use std::sync::Arc;
use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub parameters_schema: Value,
    pub side_effects: SideEffects,
    pub default_autonomy: AutonomyClass,
}

#[async_trait]
pub trait Tool: Send + Sync {
    /// Canonical identifier of the tool (e.g. `fs.read_file`, `system.execute_command`, `mcp:server/tool_name`).
    fn name(&self) -> &str;

    /// Concise human- and LLM-readable description of what the tool does and when to use it.
    fn description(&self) -> &str;

    /// JSON Schema defining the input arguments expected by this tool.
    fn parameters_schema(&self) -> Value;

    /// Declared side effects of executing this tool.
    fn side_effects(&self) -> SideEffects;

    /// Baseline autonomy level under default policy rules.
    fn default_autonomy(&self) -> AutonomyClass;

    /// Execute the tool with the validated JSON input arguments.
    async fn execute(&self, input: Value) -> Result<Value>;

    /// Return a serializable descriptor for schema export.
    fn descriptor(&self) -> ToolDescriptor {
        ToolDescriptor {
            name: self.name().to_string(),
            description: self.description().to_string(),
            parameters_schema: self.parameters_schema(),
            side_effects: self.side_effects(),
            default_autonomy: self.default_autonomy(),
        }
    }
}

pub type DynTool = Arc<dyn Tool>;
