use axum::body::Body;
use axum::http::{Request, StatusCode};
use edith_api::{create_router, AppState};
use edith_events::EventBus;
use edith_models::ProviderRegistry;
use edith_storage::Storage;
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn test_evaluation_scenario_1_tier0_math_and_time() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // Create session
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/sessions")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"title": "Tier 0 Eval"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
    let s_val: Value = serde_json::from_slice(
        &axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let session_id = s_val["id"].as_str().unwrap();

    // 1. Math query
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/v1/sessions/{session_id}/messages"))
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"text": "calculate (100 - 25) * 4", "source": "text"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);

    // 2. Time query
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/v1/sessions/{session_id}/messages"))
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"text": "what time is it", "source": "text"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);
}

#[tokio::test]
async fn test_evaluation_scenario_2_memory_security_gatekeeper() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // 1. Secret rejection
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/memory/items")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"category": "semantic", "content": "ghp_1234567890abcdef1234567890abcdef", "provenance": "explicit"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    // 2. Valid semantic fact creation
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/memory/items")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"category": "semantic", "content": "Owner prefers concise technical responses", "provenance": "explicit"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn test_evaluation_scenario_3_ssrf_defense_and_evidence() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // 1. SSRF loopback denial
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/search/fetch")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"url": "http://127.0.0.1:4242/v1/health"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // 2. SSRF metadata service denial
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/search/fetch")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"url": "http://169.254.169.254/latest/meta-data"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_evaluation_scenario_4_desktop_telemetry_and_capabilities() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // 1. Host metrics
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
    assert!(val["cpu_usage_percent"].as_f64().is_some());
    assert!(val["memory_total_bytes"].as_u64().is_some());

    // 2. 11 Registered Tools
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
    assert_eq!(val["count"], 11);
}

#[tokio::test]
async fn test_evaluation_scenario_5_voice_mic_isolation() {
    let storage = Storage::open_in_memory().unwrap();
    let event_bus = EventBus::new(16);
    let state = AppState::new(storage, event_bus, ProviderRegistry::new(), None);
    let app = create_router(state);

    // Mic push in Idle must fail
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/voice/audio")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"samples": [0, 0, 0, 0]}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    // Start voice session enters listening
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
}
