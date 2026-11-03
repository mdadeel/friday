use std::sync::Arc;
use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use edith_tools::{Tool, ToolError};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::client::StdioMcpClient;
use crate::protocol::McpToolDefinition;

pub struct McpToolAdapter {
    canonical_name: String,
    raw_name: String,
    description: String,
    schema: Value,
    client: Arc<Mutex<StdioMcpClient>>,
}

impl McpToolAdapter {
    pub fn new(
        server_id: &str,
        tool_def: McpToolDefinition,
        client: Arc<Mutex<StdioMcpClient>>,
    ) -> Self {
        Self {
            canonical_name: format!("mcp:{}/{}", server_id, tool_def.name),
            raw_name: tool_def.name,
            description: tool_def.description,
            schema: tool_def.input_schema,
            client,
        }
    }
}

#[async_trait]
impl Tool for McpToolAdapter {
    fn name(&self) -> &str {
        &self.canonical_name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn parameters_schema(&self) -> Value {
        self.schema.clone()
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Process
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, input: Value) -> Result<Value, ToolError> {
        let client = self.client.lock().await;
        client
            .call_tool(&self.raw_name, input)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("MCP tool error: {}", e)))
    }
}
