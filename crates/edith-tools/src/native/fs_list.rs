use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};
use tokio::fs;

use crate::error::{Result, ToolError};
use crate::tool::Tool;

pub struct FsListTool;

#[async_trait]
impl Tool for FsListTool {
    fn name(&self) -> &str {
        "fs.list_dir"
    }

    fn description(&self) -> &str {
        "List directory contents at the specified path (or current directory if omitted)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list (defaults to '.' if omitted)"
                }
            }
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
            .unwrap_or(".");

        let mut read_dir = fs::read_dir(path_str).await.map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to list directory '{}': {}", path_str, e))
        })?;

        let mut entries = Vec::new();
        while let Some(entry) = read_dir.next_entry().await.map_err(|e| {
            ToolError::ExecutionFailed(format!("Error reading directory entry in '{}': {}", path_str, e))
        })? {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_type = entry.file_type().await.ok();
            let is_dir = file_type.map(|t| t.is_dir()).unwrap_or(false);
            let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);

            entries.push(json!({
                "name": file_name,
                "is_dir": is_dir,
                "size_bytes": size
            }));
        }

        // Sort entries: directories first, then alphabetical
        entries.sort_by(|a, b| {
            let a_dir = a.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
            let b_dir = b.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
            match (a_dir, b_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => {
                    let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    a_name.cmp(b_name)
                }
            }
        });

        Ok(json!({
            "path": path_str,
            "total_entries": entries.len(),
            "entries": entries
        }))
    }
}
