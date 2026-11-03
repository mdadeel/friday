pub mod adapter;
pub mod client;
pub mod error;
pub mod protocol;

pub use adapter::McpToolAdapter;
pub use client::{McpServerConfig, ServerStatus, StdioMcpClient};
pub use error::{McpError, Result};
pub use protocol::{
    ClientInfo, InitializeParams, JsonRpcError, JsonRpcNotification, JsonRpcRequest,
    JsonRpcResponse, McpToolDefinition, ToolCallContent, ToolCallResult,
};

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_jsonrpc_request_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: json!(42),
            method: "tools/list".to_string(),
            params: Some(json!({})),
        };
        let serialized = serde_json::to_string(&req).unwrap();
        assert!(serialized.contains("\"jsonrpc\":\"2.0\""));
        assert!(serialized.contains("\"id\":42"));
        assert!(serialized.contains("\"method\":\"tools/list\""));
    }

    #[test]
    fn test_mcp_tool_definition_deserialization() {
        let raw = json!({
            "name": "read_file",
            "description": "Read file contents",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }
        });

        let tool_def: McpToolDefinition = serde_json::from_value(raw).unwrap();
        assert_eq!(tool_def.name, "read_file");
        assert_eq!(tool_def.description, "Read file contents");
        assert!(tool_def.input_schema.get("properties").is_some());
    }

    #[test]
    fn test_tool_call_result_parsing() {
        let raw = json!({
            "content": [
                {
                    "type": "text",
                    "text": "file content here"
                }
            ],
            "isError": false
        });

        let res: ToolCallResult = serde_json::from_value(raw).unwrap();
        assert!(!res.is_error);
        assert_eq!(res.content.len(), 1);
        assert_eq!(res.content[0].text.as_deref(), Some("file content here"));
    }
}
