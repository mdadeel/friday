use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};
use tokio::fs;

use crate::error::{Result, ToolError};
use crate::tool::Tool;

pub struct FsReadTool;

#[async_trait]
impl Tool for FsReadTool {
    fn name(&self) -> &str {
        "fs.read_file"
    }

    fn description(&self) -> &str {
        "Read the UTF-8 text contents of a file at the specified path (max 2MB)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read"
                }
            },
            "required": ["path"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Read
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, input: Value) -> Result<Value> {
        let path_str = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'path' argument".to_string()))?;

        let metadata = fs::metadata(path_str).await.map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to read metadata for '{}': {}", path_str, e))
        })?;

        // 2MB size limit to prevent memory exhaustion
        const MAX_BYTES: u64 = 2 * 1024 * 1024;
        if metadata.len() > MAX_BYTES {
            return Err(ToolError::ExecutionFailed(format!(
                "File '{}' exceeds maximum allowed read size of 2MB (actual size: {} bytes)",
                path_str,
                metadata.len()
            )));
        }

        let content = fs::read_to_string(path_str).await.map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to read file '{}': {}", path_str, e))
        })?;

        Ok(json!({
            "path": path_str,
            "size_bytes": metadata.len(),
            "content": content
        }))
    }
}
