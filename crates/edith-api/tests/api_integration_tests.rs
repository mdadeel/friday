use axum::body::Body;
use axum::http::{Request, StatusCode};
use edith_api::{create_router, AppState};
use edith_events::EventBus;
use edith_models::{MockProvider, ProviderRegistry};
use edith_storage::Storage;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tower::ServiceExt;

#[tokio::test]
async fn test_end_to_end_conversation_streaming_and_persistence() {
    let storage = Storage::open_in_memory().expect("Storage in-memory open failed");
    let event_bus = EventBus::new(64);
    let mut rx = event_bus.subscribe();

    let models = ProviderRegistry::new();
    models
        .register(Arc::new(MockProvider::default()))
        .await;

    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    // 1. Create Session
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/sessions")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"title": "Streaming Test Session"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let session_val: Value = serde_json::from_slice(&bytes).unwrap();
    let session_id = session_val["id"].as_str().unwrap().to_string();

    // 2. Submit user message
    let message_uri = format!("/v1/sessions/{session_id}/messages");
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(&message_uri)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"text": "Hello EDITH", "source": "text"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let message_res: Value = serde_json::from_slice(&bytes).unwrap();
    let task_id = message_res["task_id"].as_str().unwrap().to_string();

    // 3. Collect streaming events from EventBus
    let mut received_task_created = false;
    let mut received_deltas = Vec::new();
    let received_final;

    let timeout = sleep(Duration::from_secs(5));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            _ = &mut timeout => {
                panic!("Timeout waiting for streaming conversation events");
            }
            event_res = rx.recv() => {
                let event = event_res.unwrap();
                match event.kind.as_str() {
                    "task.created" => {
                        received_task_created = true;
                    }
                    "message.delta" => {
                        let delta = event.payload["delta"].as_str().unwrap_or_default().to_string();
                        received_deltas.push(delta);
                    }
                    "message.final" => {
                        received_final = true;
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    assert!(received_task_created, "Expected task.created event");
    assert!(!received_deltas.is_empty(), "Expected delta tokens");
    assert!(received_final, "Expected message.final event");

    // 4. Verify SQLite turn persistence (User + Assistant)
    let turns = storage.list_turns(&session_id).await.unwrap();
    assert_eq!(turns.len(), 2, "Expected user turn and assistant turn in database");
    assert_eq!(turns[0].role, "user");
    assert_eq!(turns[0].content, "Hello EDITH");
    assert_eq!(turns[1].role, "assistant");
    assert!(!turns[1].content.is_empty());

    // 5. Verify task is completed
    let task = storage.get_task(&task_id).await.unwrap().unwrap();
    assert_eq!(task.state, "completed");
    assert_eq!(task.outcome.as_deref(), Some("completed"));
}

#[tokio::test]
async fn test_session_and_turn_crud_endpoints() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let models = ProviderRegistry::new();
    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    // 1. Create Session
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/sessions")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"title": "Initial Session"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let session_id = val["id"].as_str().unwrap().to_string();

    // 2. Get Session
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/sessions/{session_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["title"], "Initial Session");

    // 3. Update Session Title
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/v1/sessions/{session_id}"))
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"title": "Renamed Session"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["title"], "Renamed Session");

    // 4. Append and inspect Turn
    let turn = storage
        .append_turn(&session_id, "user", "Test turn content", None, None)
        .await
        .unwrap();

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/sessions/{session_id}/turns/{}", turn.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["content"], "Test turn content");

    // 5. Update Turn
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/v1/sessions/{session_id}/turns/{}", turn.id))
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"content": "Updated turn content"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let updated = storage.get_turn(&turn.id).await.unwrap().unwrap();
    assert_eq!(updated.content, "Updated turn content");

    // 6. Delete Turn
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/v1/sessions/{session_id}/turns/{}", turn.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(storage.get_turn(&turn.id).await.unwrap().is_none());

    // 7. Delete Session
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/v1/sessions/{session_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(storage.get_session(&session_id).await.unwrap().is_none());
}

#[tokio::test]
async fn test_cancellation_endpoint() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let models = ProviderRegistry::new();
    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/sessions/session-xyz/cancel")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["status"], "no_active_generation");
}

#[tokio::test]
async fn test_tools_and_capabilities_endpoint() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let models = ProviderRegistry::new();
    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/tools")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();

    let count = val["count"].as_u64().unwrap();
    assert!(count >= 5);
    let tools = val["tools"].as_array().unwrap();
    assert!(tools.iter().any(|t| t["name"] == "fs.read_file"));
    assert!(tools.iter().any(|t| t["name"] == "fs.write_file"));
    assert!(tools.iter().any(|t| t["name"] == "fs.list_dir"));
    assert!(tools.iter().any(|t| t["name"] == "system.execute_command"));
    assert!(tools.iter().any(|t| t["name"] == "datetime.now"));
}

#[tokio::test]
async fn test_memory_items_endpoints_lifecycle() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let models = ProviderRegistry::new();
    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    // 1. Create Memory Item via POST /v1/memory/items
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/memory/items")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"content": "Primary language is Rust", "provenance": "explicit", "confidence": 0.95}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::CREATED);
    let item_val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let memory_id = item_val["id"].as_str().unwrap().to_string();
    assert_eq!(item_val["content"], "Primary language is Rust");

    // 2. List Memory Items via GET /v1/memory/items
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/memory/items?category=semantic")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let list_val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let arr = list_val.as_array().unwrap();
    assert!(arr.iter().any(|m| m["id"] == memory_id));

    // 3. Search Memory Items via GET /v1/memory/items?q=Rust
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/memory/items?q=Rust")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let search_val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(search_val.as_array().unwrap().len(), 1);

    // 4. Update Memory Item via PATCH /v1/memory/items/{id}
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/v1/memory/items/{memory_id}"))
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"content": "Primary language is Modern Rust", "user_confirmed": true}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let updated_val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(updated_val["content"], "Primary language is Modern Rust");
    assert_eq!(updated_val["user_confirmed"], true);

    // 5. Delete Memory Item via DELETE /v1/memory/items/{id}
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/v1/memory/items/{memory_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    assert!(storage.get_memory_item(&memory_id).await.unwrap().is_none());
}

#[tokio::test]
async fn test_voice_api_endpoints_and_privacy() {
    let storage = Storage::open_in_memory().expect("Storage in-memory open failed");
    let event_bus = EventBus::new(64);
    let models = ProviderRegistry::new();
    models
        .register(Arc::new(MockProvider::default()))
        .await;

    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    // 1. Check Voice Status initially Idle
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/voice/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["state"], "idle");
    assert_eq!(val["mic_active"], false);

    // 2. Privacy enforcement: Push audio while Idle MUST be rejected with 400
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/voice/audio")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"samples": [100, 200, 300]}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    // 3. Start listening (Push-to-talk press)
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/voice/start")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["state"], "listening");
    assert_eq!(val["mic_active"], true);

    // 4. Push active audio frames while Listening
    let loud_samples = vec![1500i16; 480];
    let body = serde_json::json!({ "samples": loud_samples }).to_string();
    for _ in 0..5 {
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/voice/audio")
                    .header("Content-Type", "application/json")
                    .body(Body::from(body.clone()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    // 5. Stop listening (Push-to-talk release) -> triggers transcription
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/voice/stop")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["status"], "ok");
    assert!(val["transcription"]["text"].is_string());

    // 6. Synthesize Speech via POST /v1/voice/tts
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/voice/tts")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"text": "Hello world, EDITH is fully operational."}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(val["duration_ms"].as_u64().unwrap() > 0);
    assert_eq!(val["sample_rate"], 16000);
}

#[tokio::test]
async fn test_search_endpoints_and_ssrf_protection() {
    let storage = Storage::open_in_memory().expect("Storage in-memory open failed");
    let event_bus = EventBus::new(64);
    let models = ProviderRegistry::new();
    models
        .register(Arc::new(MockProvider::default()))
        .await;

    let state = AppState::new(storage.clone(), event_bus, models, None);
    let app = create_router(state);

    // 1. POST /v1/search returns candidate results
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/search")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"query": "Rust language", "limit": 2}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(val.is_array());
    let arr = val.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert!(arr[0]["title"].is_string());
    assert!(arr[0]["url"].is_string());

    // 2. SSRF Protection: POST /v1/search/fetch with localhost MUST return 403 Forbidden
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/search/fetch")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"url": "http://127.0.0.1:4242/admin"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 3. GET /v1/tools contains web.search and web.fetch
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/tools")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let tools = val["tools"].as_array().unwrap();
    let tool_names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();

    assert!(tool_names.contains(&"web.search"));
    assert!(tool_names.contains(&"web.fetch"));
    assert!(tool_names.contains(&"desktop.system_metrics"));
    assert!(tool_names.contains(&"desktop.list_apps"));
    assert!(tool_names.contains(&"desktop.launch_app"));
    assert!(tool_names.contains(&"desktop.active_window"));
    assert_eq!(tool_names.len(), 11); // 5 native + 2 web + 4 desktop
}

#[tokio::test]
async fn test_desktop_endpoints_metrics_apps_window() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // 1. GET /v1/desktop/metrics
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/desktop/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(val.get("uptime_seconds").is_some());
    assert!(val.get("memory_total_bytes").is_some());
    assert!(val.get("os_name").is_some());

    // 2. GET /v1/desktop/apps
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/desktop/apps?q=editor")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(val["query"], "editor");
    assert!(val["apps"].is_array());

    // 3. GET /v1/desktop/window
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/desktop/window")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(val["session_type"].is_string());
    assert!(val["desktop_environment"].is_string());
}


