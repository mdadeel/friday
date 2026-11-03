use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};
use tokio::process::Command;

use crate::error::{Result, ToolError};
use crate::tool::Tool;

pub struct BrowserOpenTool;

#[async_trait]
impl Tool for BrowserOpenTool {
    fn name(&self) -> &str {
        "browser.open_url"
    }

    fn description(&self) -> &str {
        "Open a verified HTTP or HTTPS web URL in the user's default desktop browser."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The web URL to open (must begin with http:// or https://)."
                }
            },
            "required": ["url"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Process
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, input: Value) -> Result<Value> {
        let url = input
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'url' parameter".to_string()))?;

        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ToolError::InvalidParameters(
                "URL must begin with http:// or https://".to_string(),
            ));
        }

        // Use xdg-open on Linux without shell expansion
        let status = Command::new("xdg-open")
            .arg(url)
            .status()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to execute xdg-open: {e}")))?;

        Ok(json!({
            "url": url,
            "status": if status.success() { "opened" } else { "failed" },
            "code": status.code(),
        }))
    }
}
