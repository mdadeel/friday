pub mod adapters;
pub mod provider;
pub mod registry;
pub mod types;

pub use adapters::{MockProvider, OllamaAdapter};
pub use provider::{ModelProvider, StreamResult};
pub use registry::ProviderRegistry;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_mock_provider_completion() {
        let provider = MockProvider::default();
        let request = ModelRequest::new("mock-model", vec![ChatMessage::user("ping")]);

        let response = provider.complete(request).await.unwrap();
        assert_eq!(response.model, "mock-model");
        assert!(response.content.contains("ping"));
        assert!(response.usage.is_some());
    }

    #[tokio::test]
    async fn test_mock_provider_streaming() {
        let provider = MockProvider::default();
        let request = ModelRequest::new("mock-model", vec![ChatMessage::user("stream ping")])
            .with_stream(true);

        let mut stream = provider.complete_stream(request).await.unwrap();
        let mut collected_text = String::new();

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.unwrap();
            collected_text.push_str(&chunk.delta);
        }

        assert_eq!(collected_text, "Mock streaming response.");
    }

    #[tokio::test]
    async fn test_provider_registry() {
        let registry = ProviderRegistry::new();
        let mock = Arc::new(MockProvider::new("test-mock", "Test Mock"));

        registry.register(mock.clone()).await;

        let retrieved = registry.get("test-mock").await.expect("Should retrieve registered provider");
        assert_eq!(retrieved.id(), "test-mock");

        let health_map = registry.check_all_health().await;
        assert!(health_map.contains_key("test-mock"));
        let health = health_map.get("test-mock").unwrap().as_ref().unwrap();
        assert_eq!(health.status, "healthy");
    }
}
