use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use edith_agent::AgentRuntime;
use edith_core::{Provenance, TaskOrigin, TaskPriority, VerificationMode};
use edith_events::{EventBus, EventEnvelope};
use edith_models::ProviderRegistry;
use edith_storage::Storage;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use edith_search::{SearchService, WebFetchTool, WebSearchTool};
use edith_voice::{MockSpeechRecognizer, MockSpeechSynthesizer, VoiceManager, VoiceStatus};
use edith_desktop::{
    AppLauncher, DesktopActiveWindowTool, DesktopLaunchAppTool, DesktopListAppsTool,
    DesktopSystemMetricsTool, LinuxDesktopInspector, SystemMetricsCollector, WindowInspector,
};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::warn;

#[derive(Clone)]
pub struct AppState {
    pub storage: Storage,
    pub event_bus: EventBus,
    pub models: ProviderRegistry,
    pub agent: AgentRuntime,
    pub voice: Arc<VoiceManager>,
    pub search: Arc<SearchService>,
    pub metrics_collector: Arc<SystemMetricsCollector>,
    pub app_launcher: Arc<AppLauncher>,
    pub window_inspector: Arc<dyn WindowInspector>,
    pub active_cancellations: Arc<RwLock<HashMap<String, CancellationToken>>>,
    pub auth_token: Option<String>,
}

impl AppState {
    pub fn new(
        storage: Storage,
        event_bus: EventBus,
        models: ProviderRegistry,
        auth_token: Option<String>,
    ) -> Self {
        let search = Arc::new(SearchService::default());
        let metrics_collector = Arc::new(SystemMetricsCollector::new());
        let app_launcher = Arc::new(AppLauncher::new());
        let window_inspector: Arc<dyn WindowInspector> = Arc::new(LinuxDesktopInspector::new());

        let mut tool_registry = edith_tools::ToolRegistry::with_builtins();
        tool_registry.register(Arc::new(WebSearchTool::new(search.clone())));
        tool_registry.register(Arc::new(WebFetchTool::new(search.clone())));
        tool_registry.register(Arc::new(DesktopSystemMetricsTool::with_collector(metrics_collector.clone())));
        tool_registry.register(Arc::new(DesktopListAppsTool::with_launcher(app_launcher.clone())));
        tool_registry.register(Arc::new(DesktopLaunchAppTool::with_launcher(app_launcher.clone())));
        tool_registry.register(Arc::new(DesktopActiveWindowTool::with_inspector(window_inspector.clone())));

        let agent = AgentRuntime::with_tools(
            storage.clone(),
            event_bus.clone(),
            models.clone(),
            tool_registry,
        );

        let voice = Arc::new(VoiceManager::new(
            edith_core::config::VoiceConfig::default(),
            Some(event_bus.clone()),
            Arc::new(MockSpeechRecognizer::default()),
            Arc::new(MockSpeechSynthesizer),
        ));

        Self {
            storage,
            event_bus,
            models,
            agent,
            voice,
            search,
            metrics_collector,
            app_launcher,
            window_inspector,
            active_cancellations: Arc::new(RwLock::new(HashMap::new())),
            auth_token,
        }
    }

    pub fn with_voice(mut self, voice: Arc<VoiceManager>) -> Self {
        self.voice = voice;
        self
    }

    pub fn with_search(mut self, search: Arc<SearchService>) -> Self {
        self.search = search;
        self
    }

    pub fn with_desktop(
        mut self,
        metrics: Arc<SystemMetricsCollector>,
        launcher: Arc<AppLauncher>,
        window: Arc<dyn WindowInspector>,
    ) -> Self {
        self.metrics_collector = metrics;
        self.app_launcher = launcher;
        self.window_inspector = window;
        self
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub at: String,
    pub subsystems: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub active_tasks: usize,
    pub storage_ok: bool,
    pub providers: Value,
    pub voice_state: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSessionRequest {
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTurnRequest {
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitMessageRequest {
    pub text: String,
    #[serde(default = "default_source")]
    pub source: String,
    pub client_turn_id: Option<String>,
}

fn default_source() -> String {
    "text".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMemoryRequest {
    pub content: String,
    pub category: Option<String>,
    pub provenance: Option<String>,
    pub confidence: Option<f32>,
    pub importance: Option<f32>,
    pub structured: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMemoryRequest {
    pub content: Option<String>,
    pub status: Option<String>,
    pub confidence: Option<f32>,
    pub user_confirmed: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ListMemoryQuery {
    pub category: Option<String>,
    pub status: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PushAudioRequest {
    pub samples: Vec<i16>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TtsRequest {
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchRequest {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EvidenceRequest {
    pub url: String,
    pub claim: String,
    pub quote: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchAppRequest {
    pub app: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AppsQuery {
    pub q: Option<String>,
}

pub fn create_router(state: AppState) -> Router {
    let auth_token = state.auth_token.clone();

    let api_routes = Router::new()
        .route("/v1/status", get(status_handler))
        .route("/v1/sessions", get(list_sessions_handler).post(create_session_handler))
        .route(
            "/v1/sessions/{id}",
            get(get_session_handler)
                .patch(update_session_handler)
                .delete(delete_session_handler),
        )
        .route("/v1/sessions/{id}/turns", get(list_turns_handler))
        .route(
            "/v1/sessions/{id}/turns/{turn_id}",
            get(get_turn_handler)
                .patch(update_turn_handler)
                .delete(delete_turn_handler),
        )
        .route("/v1/sessions/{id}/messages", post(submit_message_handler))
        .route("/v1/sessions/{id}/cancel", post(cancel_session_handler))
        .route("/v1/tasks", get(list_tasks_handler))
        .route("/v1/tasks/{id}", get(get_task_handler))
        .route("/v1/providers", get(list_providers_handler))
        .route("/v1/tools", get(list_tools_handler))
        .route("/v1/capabilities", get(list_tools_handler))
        .route(
            "/v1/memory/items",
            get(list_memory_items_handler).post(create_memory_item_handler),
        )
        .route(
            "/v1/memory/items/{id}",
            axum::routing::patch(update_memory_item_handler).delete(delete_memory_item_handler),
        )
        .route("/v1/voice/status", get(voice_status_handler))
        .route("/v1/voice/start", post(voice_start_handler))
        .route("/v1/voice/stop", post(voice_stop_handler))
        .route("/v1/voice/cancel", post(voice_cancel_handler))
        .route("/v1/voice/audio", post(voice_audio_handler))
        .route("/v1/voice/tts", post(voice_tts_handler))
        .route("/v1/search", post(search_handler))
        .route("/v1/search/fetch", post(fetch_handler))
        .route("/v1/search/evidence", post(evidence_handler))
        .route("/v1/desktop/metrics", get(desktop_metrics_handler))
        .route("/v1/desktop/apps", get(desktop_apps_handler))
        .route("/v1/desktop/launch", post(desktop_launch_handler))
        .route("/v1/desktop/window", get(desktop_window_handler))
        .route("/v1/events", get(events_ws_handler))
        .layer(middleware::from_fn(move |headers, req, next| {
            let token = auth_token.clone();
            auth_middleware(token, headers, req, next)
        }));

    // Public health check route
    Router::new()
        .route("/v1/health", get(health_handler))
        .merge(api_routes)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn auth_middleware(
    required_token: Option<String>,
    headers: HeaderMap,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(ref token) = required_token {
        if let Some(auth_header) = headers.get("Authorization") {
            if let Ok(auth_str) = auth_header.to_str() {
                if let Some(bearer) = auth_str.strip_prefix("Bearer ") {
                    if bearer == token {
                        return Ok(next.run(req).await);
                    }
                }
            }
        }
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(req).await)
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        at: Utc::now().to_rfc3339(),
        subsystems: serde_json::json!({
            "storage": "online",
            "event_bus": "online",
            "api": "online"
        }),
    })
}

async fn status_handler(State(state): State<AppState>) -> Json<StatusResponse> {
    let tasks = state.storage.list_tasks(100).await.unwrap_or_default();
    let active_tasks = tasks
        .iter()
        .filter(|t| !["completed", "failed", "cancelled"].contains(&t.state.as_str()))
        .count();

    let health_map = state.models.check_all_health().await;
    let mut providers_status = serde_json::Map::new();
    for (id, health) in health_map {
        let status = match health {
            Ok(h) => h.status,
            Err(_) => "offline".to_string(),
        };
        providers_status.insert(id, Value::String(status));
    }

    let voice_status = state.voice.status().await;

    Json(StatusResponse {
        active_tasks,
        storage_ok: true,
        providers: Value::Object(providers_status),
        voice_state: voice_status.state.to_string(),
    })
}

async fn list_providers_handler(State(state): State<AppState>) -> Json<Value> {
    let health_map = state.models.check_all_health().await;
    let mut entries = Vec::new();

    for (id, health_result) in health_map {
        match health_result {
            Ok(h) => {
                entries.push(serde_json::json!({
                    "id": id,
                    "status": h.status,
                    "latency_ms": h.latency_ms,
                    "models": h.available_models
                }));
            }
            Err(e) => {
                entries.push(serde_json::json!({
                    "id": id,
                    "status": "error",
                    "error": e.to_string(),
                    "models": []
                }));
            }
        }
    }

    Json(serde_json::to_value(entries).unwrap())
}

async fn list_tools_handler(State(state): State<AppState>) -> impl IntoResponse {
    let descriptors = state.agent.tool_registry().list_descriptors();
    Json(serde_json::json!({
        "tools": descriptors,
        "count": descriptors.len(),
    }))
}

async fn list_memory_items_handler(
    State(state): State<AppState>,
    Query(query): Query<ListMemoryQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    if let Some(ref q) = query.q {
        let results = state
            .storage
            .search_memory_items(q)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        return Ok(Json(serde_json::to_value(results).unwrap()));
    }

    let items = state
        .storage
        .list_memory_items(query.category.as_deref(), query.status.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(items).unwrap()))
}

async fn create_memory_item_handler(
    State(state): State<AppState>,
    Json(payload): Json<CreateMemoryRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let provenance = match payload.provenance.as_deref() {
        Some("inferred") => Provenance::Inferred,
        Some("assumption") => Provenance::Assumption,
        Some("temporary") => Provenance::Temporary,
        _ => Provenance::Explicit,
    };
    let confidence = payload.confidence.unwrap_or(0.90);
    let importance = payload.importance.unwrap_or(0.50);

    let item = state
        .agent
        .memory()
        .record_semantic_fact(&payload.content, payload.structured, provenance, confidence, importance)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(serde_json::to_value(item).unwrap())))
}

async fn update_memory_item_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMemoryRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let updated = state
        .storage
        .update_memory_item(
            &id,
            payload.content.as_deref(),
            payload.status.as_deref(),
            payload.confidence,
            payload.user_confirmed,
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Memory item '{}' not found", id)))?;

    Ok(Json(serde_json::to_value(updated).unwrap()))
}

async fn delete_memory_item_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let deleted = state
        .storage
        .delete_memory_item(&id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if deleted {
        Ok(StatusCode::OK)
    } else {
        Err((StatusCode::NOT_FOUND, format!("Memory item '{}' not found", id)))
    }
}

async fn list_sessions_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let sessions = state
        .storage
        .list_sessions()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(sessions).unwrap()))
}

async fn create_session_handler(
    State(state): State<AppState>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let session = state
        .storage
        .create_session(&payload.title)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok((StatusCode::CREATED, Json(serde_json::to_value(session).unwrap())))
}

async fn get_session_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_session(&id).await {
        Ok(Some(session)) => Ok(Json(serde_json::to_value(session).unwrap())),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Session not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn update_session_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateSessionRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_session(&id).await {
        Ok(Some(_)) => {
            state
                .storage
                .update_session_title(&id, &payload.title)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let updated = state
                .storage
                .get_session(&id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::to_value(updated).unwrap()))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, "Session not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn delete_session_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_session(&id).await {
        Ok(Some(_)) => {
            state
                .storage
                .delete_session(&id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({ "deleted": true, "session_id": id })))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, "Session not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn list_turns_handler(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let turns = state
        .storage
        .list_turns(&session_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(turns).unwrap()))
}

async fn get_turn_handler(
    State(state): State<AppState>,
    Path((_session_id, turn_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_turn(&turn_id).await {
        Ok(Some(turn)) => Ok(Json(serde_json::to_value(turn).unwrap())),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Turn not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn update_turn_handler(
    State(state): State<AppState>,
    Path((_session_id, turn_id)): Path<(String, String)>,
    Json(payload): Json<UpdateTurnRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_turn(&turn_id).await {
        Ok(Some(_)) => {
            state
                .storage
                .update_turn(&turn_id, &payload.content)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let updated = state
                .storage
                .get_turn(&turn_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::to_value(updated).unwrap()))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, "Turn not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn delete_turn_handler(
    State(state): State<AppState>,
    Path((_session_id, turn_id)): Path<(String, String)>,
) -> Result<Json<Value>, (StatusCode, String)> {
    match state.storage.get_turn(&turn_id).await {
        Ok(Some(_)) => {
            state
                .storage
                .delete_turn(&turn_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(Json(serde_json::json!({ "deleted": true, "turn_id": turn_id })))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, "Turn not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn cancel_session_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let mut map = state.active_cancellations.write().await;
    if let Some(token) = map.remove(&id) {
        token.cancel();
        Ok(Json(serde_json::json!({
            "status": "cancelled",
            "session_id": id
        })))
    } else {
        Ok(Json(serde_json::json!({
            "status": "no_active_generation",
            "session_id": id
        })))
    }
}

async fn submit_message_handler(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(payload): Json<SubmitMessageRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let session = state
        .storage
        .get_session(&session_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if session.is_none() {
        return Err((StatusCode::NOT_FOUND, "Session not found".to_string()));
    }

    let user_turn = state
        .storage
        .append_turn(&session_id, "user", &payload.text, None, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let task = state
        .storage
        .create_task(
            Some(&session_id),
            if payload.source == "voice" {
                TaskOrigin::Voice
            } else {
                TaskOrigin::Text
            },
            &payload.text,
            TaskPriority::Interactive,
            VerificationMode::Mechanical,
            &user_turn.id,
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let cancel_token = CancellationToken::new();
    {
        let mut map = state.active_cancellations.write().await;
        map.insert(session_id.clone(), cancel_token.clone());
    }

    state.event_bus.publish(
        EventEnvelope::new(
            "task.created",
            serde_json::json!({
                "objective": payload.text,
                "session_id": session_id,
                "turn_id": user_turn.id
            }),
        )
        .with_task(&task.id)
        .with_trace(&user_turn.id),
    );

    let worker_agent = state.agent.clone();
    let worker_session_id = session_id.clone();
    let worker_task_id = task.id.clone();
    let worker_text = payload.text.clone();
    let worker_cancellations = state.active_cancellations.clone();
    let token_clone = cancel_token.clone();

    tokio::spawn(async move {
        let _ = worker_agent
            .execute_objective(
                &worker_session_id,
                &worker_task_id,
                &worker_text,
                token_clone,
            )
            .await;
        let mut map = worker_cancellations.write().await;
        map.remove(&worker_session_id);
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({
            "turn_id": user_turn.id,
            "task_id": task.id,
            "accepted_at": user_turn.created_at
        })),
    ))
}

async fn list_tasks_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let tasks = state
        .storage
        .list_tasks(50)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(tasks).unwrap()))
}

async fn get_task_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let task = state
        .storage
        .get_task(&id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match task {
        Some(t) => Ok(Json(serde_json::to_value(t).unwrap())),
        None => Err((StatusCode::NOT_FOUND, "Task not found".to_string())),
    }
}

async fn events_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_events_socket(socket, state.event_bus))
}

async fn handle_events_socket(mut socket: WebSocket, event_bus: EventBus) {
    let mut rx = event_bus.subscribe();

    loop {
        tokio::select! {
            event_result = rx.recv() => {
                match event_result {
                    Ok(event) => {
                        let json = serde_json::to_string(&event).unwrap_or_default();
                        if socket.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                        warn!("WebSocket client lagged, missed {missed} events");
                        let lagged_event = serde_json::json!({
                            "kind": "lagged",
                            "missed": missed
                        });
                        let _ = socket.send(Message::Text(lagged_event.to_string().into())).await;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            msg = socket.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}

async fn voice_status_handler(State(state): State<AppState>) -> Json<VoiceStatus> {
    Json(state.voice.status().await)
}

async fn voice_start_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state
        .voice
        .start_listening()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let status = state.voice.status().await;
    Ok(Json(serde_json::to_value(status).unwrap_or_default()))
}

async fn voice_stop_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let result = state
        .voice
        .stop_listening()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "status": "ok",
        "transcription": result,
    })))
}

async fn voice_cancel_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    state
        .voice
        .cancel()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "status": "cancelled" })))
}

async fn voice_audio_handler(
    State(state): State<AppState>,
    Json(req): Json<PushAudioRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let res = state
        .voice
        .push_audio_frame(&req.samples)
        .await
        .map_err(|e| match e {
            edith_voice::VoiceError::MicrophoneClosed(s) => {
                (StatusCode::BAD_REQUEST, format!("Microphone closed in state {s:?}"))
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    Ok(Json(serde_json::json!({
        "accepted": true,
        "transcription": res,
    })))
}

async fn voice_tts_handler(
    State(state): State<AppState>,
    Json(req): Json<TtsRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let audio = state
        .voice
        .speak(&req.text)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "duration_ms": audio.duration_ms,
        "sample_rate": audio.sample_rate,
        "samples_count": audio.pcm_samples.len(),
    })))
}

async fn search_handler(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let results = state
        .search
        .search(&req.query, req.limit.unwrap_or(5))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(results).unwrap_or_default()))
}

async fn fetch_handler(
    State(state): State<AppState>,
    Json(req): Json<FetchRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let doc = state
        .search
        .fetch(&req.url)
        .await
        .map_err(|e| match e {
            edith_search::SearchError::SsrfBlocked(msg) => (StatusCode::FORBIDDEN, msg),
            edith_search::SearchError::InvalidUrl(msg) => (StatusCode::BAD_REQUEST, msg),
            edith_search::SearchError::ContentTooLarge { .. } => {
                (StatusCode::PAYLOAD_TOO_LARGE, e.to_string())
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;
    Ok(Json(serde_json::to_value(doc).unwrap_or_default()))
}

async fn evidence_handler(
    State(state): State<AppState>,
    Json(req): Json<EvidenceRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let doc = state
        .search
        .fetch(&req.url)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let span = state
        .search
        .extract_evidence(&doc, &req.claim, &req.quote)
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()))?;

    Ok(Json(serde_json::to_value(span).unwrap_or_default()))
}

async fn desktop_metrics_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let metrics = state
        .metrics_collector
        .collect()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to collect metrics: {}", e)))?;
    Ok(Json(serde_json::to_value(metrics).unwrap_or_default()))
}

async fn desktop_apps_handler(
    State(state): State<AppState>,
    Query(query): Query<AppsQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let q = query.q.unwrap_or_default();
    let apps = state.app_launcher.search_apps(&q).await;
    Ok(Json(serde_json::json!({
        "query": q,
        "count": apps.len(),
        "apps": apps
    })))
}

async fn desktop_launch_handler(
    State(state): State<AppState>,
    Json(payload): Json<LaunchAppRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let pid = state
        .app_launcher
        .launch_app(&payload.app, &payload.args)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Launch failed: {}", e)))?;
    Ok(Json(serde_json::json!({
        "app": payload.app,
        "pid": pid,
        "status": "launched"
    })))
}

async fn desktop_window_handler(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let window = state
        .window_inspector
        .get_active_window()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Window inspection failed: {}", e)))?;
    Ok(Json(serde_json::to_value(window).unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_endpoint() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_auth_middleware_blocks_unauthorized() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let state = AppState::new(
            storage,
            event_bus,
            ProviderRegistry::new(),
            Some("secret123".to_string()),
        );
        let app = create_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
