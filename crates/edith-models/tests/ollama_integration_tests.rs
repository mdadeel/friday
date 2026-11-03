use edith_models::{ChatMessage, ModelProvider, ModelRequest, OllamaAdapter};
use futures_util::StreamExt;

#[tokio::test]
async fn test_ollama_live_health_and_completion() {
    let adapter = OllamaAdapter::new("http://127.0.0.1:11434");

    // 1. Health check
    let health = match adapter.check_health().await {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Skipping live Ollama test: Ollama not reachable ({e})");
            return;
        }
    };

    assert_eq!(health.status, "healthy");
    assert!(health.latency_ms.is_some());
    assert!(!health.available_models.is_empty());
    println!("Ollama available models: {:?}", health.available_models);

    // Pick qwen3:0.6b or first available model
    let model = if health.available_models.iter().any(|m| m.contains("qwen3:0.6b")) {
        "qwen3:0.6b"
    } else {
        &health.available_models[0]
    };

    // 2. Non-streaming completion
    let req = ModelRequest::new(model, vec![ChatMessage::user("Say hello in one word")])
        .with_temperature(0.1);

    let resp = adapter.complete(req).await.expect("Ollama complete failed");
    assert!(!resp.content.is_empty());
    println!("Ollama response: {}", resp.content);
    if let Some(ref thinking) = resp.thinking {
        println!("Ollama thinking length: {} chars", thinking.len());
    }

    // 3. Streaming completion
    let stream_req = ModelRequest::new(model, vec![ChatMessage::user("Count from 1 to 3")])
        .with_temperature(0.1)
        .with_stream(true);

    let mut stream = adapter
        .complete_stream(stream_req)
        .await
        .expect("Ollama complete_stream failed");

    let mut streamed_text = String::new();
    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.expect("Stream chunk error");
        streamed_text.push_str(&chunk.delta);
    }

    assert!(!streamed_text.is_empty());
    println!("Ollama streamed text: {}", streamed_text.trim());
}
