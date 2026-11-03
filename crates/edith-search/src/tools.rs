use crate::service::SearchService;
use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use edith_tools::error::{Result as ToolResult, ToolError};
use edith_tools::tool::Tool;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct WebSearchTool {
    service: Arc<SearchService>,
}

impl WebSearchTool {
    pub fn new(service: Arc<SearchService>) -> Self {
        Self { service }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web.search"
    }

    fn description(&self) -> &str {
        "Search the web for real-time information, technical documentation, news, or articles."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string."
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of search results to return (default 5).",
                    "default": 5
                }
            },
            "required": ["query"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Network
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::PolicyControlled
    }

    async fn execute(&self, input: Value) -> ToolResult<Value> {
        let query = input
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'query' parameter".to_string()))?;

        let limit = input
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;

        let results = self
            .service
            .search(query, limit)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Web search failed: {e}")))?;

        Ok(json!(results))
    }
}

pub struct WebFetchTool {
    service: Arc<SearchService>,
}

impl WebFetchTool {
    pub fn new(service: Arc<SearchService>) -> Self {
        Self { service }
    }
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web.fetch"
    }

    fn description(&self) -> &str {
        "Fetch and extract clean readable text content and evidence blocks from a web URL safely."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The HTTP or HTTPS URL to fetch and extract."
                }
            },
            "required": ["url"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Network
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::PolicyControlled
    }

    async fn execute(&self, input: Value) -> ToolResult<Value> {
        let url = input
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'url' parameter".to_string()))?;

        let doc = self
            .service
            .fetch(url)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Web fetch failed: {e}")))?;

        Ok(json!({
            "url": doc.url,
            "title": doc.title,
            "content": doc.content,
            "content_hash": doc.content_hash,
            "status_code": doc.status_code,
            "blocks_count": doc.blocks.len(),
            "sample_blocks": doc.blocks.iter().take(5).collect::<Vec<_>>()
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::MockSearchProvider;

    #[tokio::test]
    async fn test_web_search_tool() {
        let service = Arc::new(SearchService::new(vec![Arc::new(MockSearchProvider::default())]));
        let tool = WebSearchTool::new(service);

        let input = json!({ "query": "Rust Tokio async", "limit": 2 });
        let res = tool.execute(input).await.unwrap();

        assert!(res.is_array());
        let arr = res.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert!(arr[0]["title"].as_str().unwrap().contains("Rust Tokio async"));
    }
}
