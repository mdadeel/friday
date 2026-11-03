use std::path::Path;
use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};
use tokio::fs;

use crate::error::{Result, ToolError};
use crate::tool::Tool;

pub struct FsWriteTool;

#[async_trait]
impl Tool for FsWriteTool {
    fn name(&self) -> &str {
        "fs.write_file"
    }

    fn description(&self) -> &str {
        "Write text content to a file at the specified path, creating parent directories if needed."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the destination file"
                },
                "content": {
                    "type": "string",
                    "description": "Text content to write into the file"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Write
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::PolicyControlled
    }

    async fn execute(&self, input: Value) -> Result<Value> {
        let path_str = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'path' argument".to_string()))?;

        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'content' argument".to_string()))?;

        let path = Path::new(path_str);
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).await.map_err(|e| {
                    ToolError::ExecutionFailed(format!(
                        "Failed to create parent directory '{}': {}",
                        parent.display(),
                        e
                    ))
                })?;
            }
        }

        fs::write(path, content).await.map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to write to '{}': {}", path_str, e))
        })?;

        Ok(json!({
            "path": path_str,
            "bytes_written": content.len(),
            "status": "written"
        }))
    }
}
