use std::collections::HashMap;
use std::sync::Arc;
use serde_json::Value;

use crate::error::{Result, ToolError};
use crate::native::{BrowserOpenTool, DateTimeTool, FsListTool, FsReadTool, FsWriteTool, SystemCommandTool};
use crate::policy::{PolicyDecision, PolicyEngine};
use crate::tool::{DynTool, ToolDescriptor};

#[derive(Clone)]
pub struct ToolRegistry {
    tools: HashMap<String, DynTool>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Construct a registry preloaded with standard native EDITH tools.
    pub fn with_builtins() -> Self {
        let mut registry = Self::new();
        registry.register(Arc::new(FsReadTool));
        registry.register(Arc::new(FsWriteTool));
        registry.register(Arc::new(FsListTool));
        registry.register(Arc::new(SystemCommandTool));
        registry.register(Arc::new(DateTimeTool));
        registry.register(Arc::new(BrowserOpenTool));
        registry
    }

    /// Register a tool into the registry.
    pub fn register(&mut self, tool: DynTool) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    /// Lookup a tool by canonical name.
    pub fn get(&self, name: &str) -> Option<DynTool> {
        self.tools.get(name).cloned()
    }

    /// Check if a tool exists.
    pub fn contains(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// List descriptors for all registered tools.
    pub fn list_descriptors(&self) -> Vec<ToolDescriptor> {
        let mut descriptors: Vec<_> = self.tools.values().map(|t| t.descriptor()).collect();
        descriptors.sort_by(|a, b| a.name.cmp(&b.name));
        descriptors
    }

    /// Export OpenAI/Gemini/Qwen compatible function calling schema array.
    pub fn export_schemas(&self) -> Vec<Value> {
        self.list_descriptors()
            .into_iter()
            .map(|desc| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": desc.name,
                        "description": desc.description,
                        "parameters": desc.parameters_schema
                    }
                })
            })
            .collect()
    }

    /// Invoke a tool by name with input arguments, enforcing security policy validation.
    pub async fn invoke(
        &self,
        name: &str,
        input: Value,
        policy: &PolicyEngine,
    ) -> Result<Value> {
        let tool = self
            .get(name)
            .ok_or_else(|| ToolError::NotFound(format!("Tool '{}' is not registered", name)))?;

        let decision = policy.evaluate(tool.as_ref(), &input);
        match decision {
            PolicyDecision::Allow => {
                tracing::info!(tool = name, "Executing policy-allowed tool");
                tool.execute(input).await
            }
            PolicyDecision::ConfirmRequired { reason, prompt } => {
                tracing::warn!(tool = name, reason = %reason, "Tool execution requires user confirmation");
                Err(ToolError::PolicyViolation(format!(
                    "Confirmation required: {} (Prompt: {})",
                    reason, prompt
                )))
            }
            PolicyDecision::Deny { reason } => {
                tracing::error!(tool = name, reason = %reason, "Tool execution blocked by policy");
                Err(ToolError::PolicyViolation(format!("Blocked by policy: {}", reason)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_registry_with_builtins() {
        let registry = ToolRegistry::with_builtins();
        assert!(registry.contains("fs.read_file"));
        assert!(registry.contains("fs.write_file"));
        assert!(registry.contains("fs.list_dir"));
        assert!(registry.contains("system.execute_command"));
        assert!(registry.contains("datetime.now"));
        assert!(registry.contains("browser.open_url"));

        let descriptors = registry.list_descriptors();
        assert_eq!(descriptors.len(), 6);

        let schemas = registry.export_schemas();
        assert_eq!(schemas.len(), 6);
    }

    #[tokio::test]
    async fn test_datetime_tool_execution() {
        let registry = ToolRegistry::with_builtins();
        let policy = PolicyEngine::default();
        let result = registry.invoke("datetime.now", serde_json::json!({}), &policy).await.unwrap();

        assert!(result.get("utc").is_some());
        assert!(result.get("local").is_some());
    }

    #[tokio::test]
    async fn test_filesystem_lifecycle() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("edith_test.txt");
        let file_path_str = file_path.to_str().unwrap().to_string();

        let registry = ToolRegistry::with_builtins();
        let policy = PolicyEngine::new(vec![dir.path().to_path_buf()]);

        // 1. Write file
        let write_res = registry
            .invoke(
                "fs.write_file",
                serde_json::json!({
                    "path": file_path_str,
                    "content": "Hello EDITH 2.0"
                }),
                &policy,
            )
            .await
            .unwrap();
        assert_eq!(write_res.get("status").unwrap(), "written");

        // 2. Read file
        let read_res = registry
            .invoke(
                "fs.read_file",
                serde_json::json!({
                    "path": file_path_str
                }),
                &policy,
            )
            .await
            .unwrap();
        assert_eq!(read_res.get("content").unwrap(), "Hello EDITH 2.0");

        // 3. List directory
        let list_res = registry
            .invoke(
                "fs.list_dir",
                serde_json::json!({
                    "path": dir.path().to_str().unwrap()
                }),
                &policy,
            )
            .await
            .unwrap();
        let entries = list_res.get("entries").and_then(|e| e.as_array()).unwrap();
        assert!(entries.iter().any(|e| e.get("name").unwrap() == "edith_test.txt"));
    }

    #[tokio::test]
    async fn test_command_execution() {
        let registry = ToolRegistry::with_builtins();
        let policy = PolicyEngine::default();

        let result = registry
            .invoke(
                "system.execute_command",
                serde_json::json!({
                    "program": "echo",
                    "args": ["EDITH_TOOL_ONLINE"]
                }),
                &policy,
            )
            .await
            .unwrap();

        assert_eq!(result.get("success").unwrap(), true);
        assert!(result.get("stdout").unwrap().as_str().unwrap().contains("EDITH_TOOL_ONLINE"));
    }
}
