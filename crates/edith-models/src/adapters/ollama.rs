use crate::provider::{ModelProvider, StreamResult};
use crate::types::{
    ModelCapabilities, ModelRequest, ModelResponse, ModelStreamChunk, ProviderHealth, TokenUsage,
};
use async_trait::async_trait;
use edith_core::EdithError;
use futures_util::TryStreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

pub struct OllamaAdapter {
    base_url: String,
    client: Client,
}

impl OllamaAdapter {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client: Client::builder().build().unwrap_or_default(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelEntry>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaModelEntry {
    name: String,
    details: Option<OllamaModelDetails>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaModelDetails {
    context_length: Option<usize>,
}

#[derive(Debug, Serialize)]
struct OllamaChatPayload<'a> {
    model: &'a str,
    messages: &'a [OllamaChatMessage],
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize)]
struct OllamaChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaChatResponse {
    model: String,
    message: OllamaResponseMessage,
    done: bool,
    done_reason: Option<String>,
    prompt_eval_count: Option<u32>,
    eval_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OllamaResponseMessage {
    content: String,
    thinking: Option<String>,
}

#[async_trait]
impl ModelProvider for OllamaAdapter {
    fn id(&self) -> &str {
        "ollama"
    }

    fn name(&self) -> &str {
        "Ollama Local Inference Server"
    }

    fn capabilities(&self, model: &str) -> ModelCapabilities {
        let is_qwen3 = model.contains("qwen3");
        ModelCapabilities {
            supports_streaming: true,
            supports_tools: true,
            supports_thinking: is_qwen3,
            max_context_tokens: if is_qwen3 { 40960 } else { 32768 },
        }
    }

    async fn check_health(&self) -> Result<ProviderHealth, EdithError> {
        let url = format!("{}/api/tags", self.base_url);
        let start = Instant::now();

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| EdithError::Internal(format!("Failed to connect to Ollama at {url}: {e}")))?;

        let latency_ms = start.elapsed().as_millis() as u64;

        if !response.status().is_success() {
            return Err(EdithError::Internal(format!(
                "Ollama returned HTTP error status: {}",
                response.status()
            )));
        }

        let tags: OllamaTagsResponse = response
            .json()
            .await
            .map_err(|e| EdithError::Internal(format!("Failed to parse Ollama tags response: {e}")))?;

        let available_models = tags.models.into_iter().map(|m| m.name).collect();

        Ok(ProviderHealth {
            status: "healthy".to_string(),
            latency_ms: Some(latency_ms),
            available_models,
        })
    }

    async fn complete(&self, request: ModelRequest) -> Result<ModelResponse, EdithError> {
        let url = format!("{}/api/chat", self.base_url);

        let messages: Vec<OllamaChatMessage> = request
            .messages
            .into_iter()
            .map(|m| OllamaChatMessage {
                role: serde_json::to_string(&m.role)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
                content: m.content,
            })
            .collect();

        let options = if request.temperature.is_some() || request.max_tokens.is_some() {
            Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            })
        } else {
            None
        };

        let payload = OllamaChatPayload {
            model: &request.model,
            messages: &messages,
            stream: false,
            options,
        };

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(request.timeout_secs))
            .send()
            .await
            .map_err(|e| EdithError::Internal(format!("Ollama chat request failed: {e}")))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(EdithError::Internal(format!(
                "Ollama chat error ({}): {}",
                url, error_text
            )));
        }

        let chat_resp: OllamaChatResponse = resp
            .json()
            .await
            .map_err(|e| EdithError::Internal(format!("Failed to parse Ollama chat response: {e}")))?;

        let usage = match (chat_resp.prompt_eval_count, chat_resp.eval_count) {
            (Some(prompt), Some(eval)) => Some(TokenUsage {
                prompt_tokens: prompt,
                completion_tokens: eval,
                total_tokens: prompt + eval,
            }),
            _ => None,
        };

        Ok(ModelResponse {
            id: edith_core::Id::new().to_string(),
            model: chat_resp.model,
            content: chat_resp.message.content,
            thinking: chat_resp.message.thinking,
            usage,
            finish_reason: chat_resp.done_reason.or(Some("stop".to_string())),
        })
    }

    async fn complete_stream(&self, request: ModelRequest) -> Result<StreamResult, EdithError> {
        let url = format!("{}/api/chat", self.base_url);

        let messages: Vec<OllamaChatMessage> = request
            .messages
            .into_iter()
            .map(|m| OllamaChatMessage {
                role: serde_json::to_string(&m.role)
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
                content: m.content,
            })
            .collect();

        let options = if request.temperature.is_some() || request.max_tokens.is_some() {
            Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            })
        } else {
            None
        };

        let payload = OllamaChatPayload {
            model: &request.model,
            messages: &messages,
            stream: true,
            options,
        };

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(request.timeout_secs))
            .send()
            .await
            .map_err(|e| EdithError::Internal(format!("Ollama stream request failed: {e}")))?;

        if !resp.status().is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            return Err(EdithError::Internal(format!(
                "Ollama stream error: {}",
                error_text
            )));
        }

        let byte_stream = resp.bytes_stream();

        let chunk_stream = byte_stream
            .map_err(|e| EdithError::Internal(format!("Byte stream error: {e}")))
            .and_then(|bytes| async move {
                let text = String::from_utf8_lossy(&bytes);
                // Ollama streams NDJSON lines
                let mut combined_delta = String::new();
                let mut thinking_delta = None;
                let mut finish_reason = None;
                let mut usage = None;

                for line in text.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }

                    if let Ok(val) = serde_json::from_str::<Value>(line) {
                        if let Some(msg) = val.get("message") {
                            if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                                combined_delta.push_str(content);
                            }
                            if let Some(thinking) = msg.get("thinking").and_then(|t| t.as_str()) {
                                thinking_delta = Some(thinking.to_string());
                            }
                        }
                        if let Some(done) = val.get("done").and_then(|d| d.as_bool()) {
                            if done {
                                finish_reason = val
                                    .get("done_reason")
                                    .and_then(|r| r.as_str())
                                    .map(|s| s.to_string())
                                    .or(Some("stop".to_string()));

                                let prompt = val.get("prompt_eval_count").and_then(|c| c.as_u64()).unwrap_or(0) as u32;
                                let eval = val.get("eval_count").and_then(|c| c.as_u64()).unwrap_or(0) as u32;
                                usage = Some(TokenUsage {
                                    prompt_tokens: prompt,
                                    completion_tokens: eval,
                                    total_tokens: prompt + eval,
                                });
                            }
                        }
                    }
                }

                Ok(ModelStreamChunk {
                    delta: combined_delta,
                    thinking_delta,
                    finish_reason,
                    usage,
                })
            });

        Ok(Box::pin(chunk_stream))
    }
}
