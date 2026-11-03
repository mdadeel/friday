use crate::provider::{ModelProvider, StreamResult};
use crate::types::{
    ModelCapabilities, ModelRequest, ModelResponse, ModelStreamChunk, ProviderHealth, TokenUsage,
};
use async_trait::async_trait;
use edith_core::EdithError;
use futures_util::stream;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct MockProvider {
    id: String,
    name: String,
    should_fail: AtomicBool,
}

impl Default for MockProvider {
    fn default() -> Self {
        Self::new("mock", "Deterministic Mock Provider")
    }
}

impl MockProvider {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            should_fail: AtomicBool::new(false),
        }
    }

    pub fn set_should_fail(&self, fail: bool) {
        self.should_fail.store(fail, Ordering::SeqCst);
    }
}

#[async_trait]
impl ModelProvider for MockProvider {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn capabilities(&self, _model: &str) -> ModelCapabilities {
        ModelCapabilities {
            supports_streaming: true,
            supports_tools: true,
            supports_thinking: true,
            max_context_tokens: 32768,
        }
    }

    async fn check_health(&self) -> Result<ProviderHealth, EdithError> {
        if self.should_fail.load(Ordering::SeqCst) {
            return Err(EdithError::Internal("Mock provider is offline".to_string()));
        }
        Ok(ProviderHealth {
            status: "healthy".to_string(),
            latency_ms: Some(1),
            available_models: vec!["mock-fast".to_string(), "mock-reasoning".to_string()],
        })
    }

    async fn complete(&self, request: ModelRequest) -> Result<ModelResponse, EdithError> {
        if self.should_fail.load(Ordering::SeqCst) {
            return Err(EdithError::Internal("Simulated model inference failure".to_string()));
        }

        let user_text = request
            .messages
            .iter()
            .rev()
            .find(|m| m.role == crate::types::Role::User)
            .map(|m| m.content.as_str())
            .unwrap_or("hello");

        let response_content = format!("Mock reply to: {user_text}");

        Ok(ModelResponse {
            id: edith_core::Id::new().to_string(),
            model: request.model,
            content: response_content,
            thinking: Some("Simulated inner reasoning".to_string()),
            usage: Some(TokenUsage {
                prompt_tokens: 15,
                completion_tokens: 10,
                total_tokens: 25,
            }),
            finish_reason: Some("stop".to_string()),
        })
    }

    async fn complete_stream(&self, _request: ModelRequest) -> Result<StreamResult, EdithError> {
        if self.should_fail.load(Ordering::SeqCst) {
            return Err(EdithError::Internal("Simulated model stream failure".to_string()));
        }

        let chunks = vec![
            Ok(ModelStreamChunk {
                delta: "".to_string(),
                thinking_delta: Some("Thinking...".to_string()),
                finish_reason: None,
                usage: None,
            }),
            Ok(ModelStreamChunk {
                delta: "Mock ".to_string(),
                thinking_delta: None,
                finish_reason: None,
                usage: None,
            }),
            Ok(ModelStreamChunk {
                delta: "streaming ".to_string(),
                thinking_delta: None,
                finish_reason: None,
                usage: None,
            }),
            Ok(ModelStreamChunk {
                delta: "response.".to_string(),
                thinking_delta: None,
                finish_reason: Some("stop".to_string()),
                usage: Some(TokenUsage {
                    prompt_tokens: 10,
                    completion_tokens: 3,
                    total_tokens: 13,
                }),
            }),
        ];

        Ok(Box::pin(stream::iter(chunks)))
    }
}
