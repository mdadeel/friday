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
