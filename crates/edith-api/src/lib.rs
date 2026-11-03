use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use edith_core::{TaskOrigin, TaskPriority, VerificationMode};
use edith_events::{EventBus, EventEnvelope};
use edith_models::{ChatMessage, ModelRequest, ProviderRegistry};
use edith_storage::Storage;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

#[derive(Clone)]
pub struct AppState {
    pub storage: Storage,
    pub event_bus: EventBus,
    pub models: ProviderRegistry,
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
        Self {
            storage,
            event_bus,
            models,
            active_cancellations: Arc::new(RwLock::new(HashMap::new())),
            auth_token,
        }
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

    Json(StatusResponse {
        active_tasks,
        storage_ok: true,
        providers: Value::Object(providers_status),
        voice_state: "idle".to_string(),
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

    let worker_state = state.clone();
    let worker_session_id = session_id.clone();
    let worker_task_id = task.id.clone();
    let worker_trace_id = user_turn.id.clone();
    tokio::spawn(async move {
        process_conversation(
            worker_state,
            worker_session_id,
            worker_task_id,
            worker_trace_id,
            cancel_token,
        )
        .await;
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

async fn process_conversation(
    state: AppState,
    session_id: String,
    task_id: String,
    trace_id: String,
    cancel_token: CancellationToken,
) {
    info!(task_id = %task_id, session_id = %session_id, "Starting conversation processing");

    let _ = state.storage.update_task_state(&task_id, "executing", None).await;

    let turns = match state.storage.list_turns(&session_id).await {
        Ok(t) => t,
        Err(e) => {
            warn!("Failed to fetch turns for session {session_id}: {e}");
            let _ = state.storage.update_task_state(&task_id, "failed", Some(&e.to_string())).await;
            return;
        }
    };

    let mut messages = Vec::new();
    messages.push(ChatMessage::system(
        "You are EDITH, an advanced AI personal assistant. Be concise, precise, helpful, and direct.",
    ));
    for turn in turns {
        match turn.role.as_str() {
            "user" => messages.push(ChatMessage::user(turn.content)),
            "assistant" => messages.push(ChatMessage::assistant(turn.content)),
            "system" => messages.push(ChatMessage::system(turn.content)),
            _ => messages.push(ChatMessage::user(turn.content)),
        }
    }

    let (provider, model_name) = {
        let all_providers = state.models.list().await;
        if all_providers.iter().any(|(id, _)| id == "ollama") {
            (state.models.get("ollama").await, "qwen3:0.6b".to_string())
        } else if all_providers.iter().any(|(id, _)| id == "mock") {
            (state.models.get("mock").await, "mock-model".to_string())
        } else if let Some((first_id, _)) = all_providers.first() {
            (state.models.get(first_id).await, "default".to_string())
        } else {
            (None, "none".to_string())
        }
    };

    let provider = match provider {
        Some(p) => p,
        None => {
            warn!("No model provider available to handle conversation");
            let _ = state
                .storage
                .update_task_state(&task_id, "failed", Some("No model provider available"))
                .await;
            return;
        }
    };

    let request = ModelRequest::new(model_name, messages).with_stream(true);

    let mut stream = match provider.complete_stream(request).await {
        Ok(s) => s,
        Err(e) => {
            warn!("Failed to initiate completion stream: {e}");
            let _ = state
                .storage
                .update_task_state(&task_id, "failed", Some(&e.to_string()))
                .await;
            return;
        }
    };

    let mut content_accum = String::new();
    let mut thinking_accum = String::new();
    let mut was_cancelled = false;

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                info!(task_id = %task_id, "Conversation generation cancelled by user");
                was_cancelled = true;
                break;
            }
            item = stream.next() => {
                match item {
                    Some(Ok(chunk)) => {
                        content_accum.push_str(&chunk.delta);
                        if let Some(ref t) = chunk.thinking_delta {
                            thinking_accum.push_str(t);
                        }

                        state.event_bus.publish(
                            EventEnvelope::new(
                                "message.delta",
                                serde_json::json!({
                                    "session_id": session_id,
                                    "delta": chunk.delta,
                                    "thinking_delta": chunk.thinking_delta,
                                }),
                            )
                            .with_task(&task_id)
                            .with_trace(&trace_id),
                        );
                    }
                    Some(Err(e)) => {
                        warn!("Error chunk from stream: {e}");
                        let _ = state
                            .storage
                            .update_task_state(&task_id, "failed", Some(&e.to_string()))
                            .await;
                        let mut map = state.active_cancellations.write().await;
                        map.remove(&session_id);
                        return;
                    }
                    None => {
                        break;
                    }
                }
            }
        }
    }

    {
        let mut map = state.active_cancellations.write().await;
        map.remove(&session_id);
    }

    if was_cancelled {
        let _ = state
            .storage
            .update_task_state(&task_id, "cancelled", Some("Cancelled by user"))
            .await;
        state.event_bus.publish(
            EventEnvelope::new(
                "generation.cancelled",
                serde_json::json!({
                    "session_id": session_id,
                    "task_id": task_id,
                }),
            )
            .with_task(&task_id)
            .with_trace(&trace_id),
        );
        return;
    }

    let thinking_opt = if thinking_accum.trim().is_empty() {
        None
    } else {
        Some(thinking_accum.as_str())
    };

    let assistant_turn = state
        .storage
        .append_turn(&session_id, "assistant", &content_accum, thinking_opt, None)
        .await;

    match assistant_turn {
        Ok(turn) => {
            let _ = state
                .storage
                .update_task_state(&task_id, "completed", Some("completed"))
                .await;
            state.event_bus.publish(
                EventEnvelope::new(
                    "message.final",
                    serde_json::json!({
                        "session_id": session_id,
                        "turn_id": turn.id,
                        "content": content_accum,
                        "thinking": thinking_opt,
                    }),
                )
                .with_task(&task_id)
                .with_trace(&trace_id),
            );
        }
        Err(e) => {
            warn!("Failed to persist assistant turn: {e}");
            let _ = state
                .storage
                .update_task_state(&task_id, "failed", Some(&e.to_string()))
                .await;
        }
    }
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
