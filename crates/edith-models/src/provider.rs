use crate::types::{ModelCapabilities, ModelRequest, ModelResponse, ModelStreamChunk, ProviderHealth};
use async_trait::async_trait;
use edith_core::EdithError;
use futures_util::Stream;
use std::pin::Pin;

pub type StreamResult = Pin<Box<dyn Stream<Item = Result<ModelStreamChunk, EdithError>> + Send>>;

#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Unique provider identifier (e.g. "ollama", "mock", "gemini")
    fn id(&self) -> &str;

    /// Human readable name
    fn name(&self) -> &str;

    /// Supported model capabilities
    fn capabilities(&self, model: &str) -> ModelCapabilities;

    /// Perform a health and availability probe
    async fn check_health(&self) -> Result<ProviderHealth, EdithError>;

    /// Complete a non-streaming chat request
    async fn complete(&self, request: ModelRequest) -> Result<ModelResponse, EdithError>;

    /// Complete a streaming chat request
    async fn complete_stream(&self, request: ModelRequest) -> Result<StreamResult, EdithError>;
}
