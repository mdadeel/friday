use std::sync::Arc;
use async_trait::async_trait;
use serde_json::{json, Value};
use edith_core::{AutonomyClass, SideEffects};
use edith_tools::error::{Result as ToolResult, ToolError};
use edith_tools::tool::Tool;

use crate::apps::AppLauncher;
use crate::metrics::SystemMetricsCollector;
use crate::window::{LinuxDesktopInspector, WindowInspector};

pub struct DesktopSystemMetricsTool {
    collector: Arc<SystemMetricsCollector>,
}

impl DesktopSystemMetricsTool {
    pub fn new() -> Self {
        Self {
            collector: Arc::new(SystemMetricsCollector::new()),
        }
    }

    pub fn with_collector(collector: Arc<SystemMetricsCollector>) -> Self {
        Self { collector }
    }
}

impl Default for DesktopSystemMetricsTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DesktopSystemMetricsTool {
    fn name(&self) -> &str {
        "desktop.system_metrics"
    }

    fn description(&self) -> &str {
        "Collects host system telemetry including CPU usage, RAM utilization, load averages, uptime, and disk capacity."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Read
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, _params: Value) -> ToolResult<Value> {
        let metrics = self
            .collector
            .collect()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to collect system metrics: {}", e)))?;

        serde_json::to_value(&metrics)
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to serialize metrics: {}", e)))
    }
}

pub struct DesktopListAppsTool {
    launcher: Arc<AppLauncher>,
}

impl DesktopListAppsTool {
    pub fn new() -> Self {
        Self {
            launcher: Arc::new(AppLauncher::new()),
        }
    }

    pub fn with_launcher(launcher: Arc<AppLauncher>) -> Self {
        Self { launcher }
    }
}

impl Default for DesktopListAppsTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DesktopListAppsTool {
    fn name(&self) -> &str {
        "desktop.list_apps"
    }

    fn description(&self) -> &str {
        "Lists installed desktop applications matching an optional search query filter."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Optional search term to filter applications by name or category"
                }
            },
            "required": []
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Read
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, params: Value) -> ToolResult<Value> {
        let query = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let apps = self.launcher.search_apps(query).await;

        Ok(json!({
            "query": query,
            "count": apps.len(),
            "apps": apps
        }))
    }
}

pub struct DesktopLaunchAppTool {
    launcher: Arc<AppLauncher>,
}

impl DesktopLaunchAppTool {
    pub fn new() -> Self {
        Self {
            launcher: Arc::new(AppLauncher::new()),
        }
    }

    pub fn with_launcher(launcher: Arc<AppLauncher>) -> Self {
        Self { launcher }
    }
}

impl Default for DesktopLaunchAppTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DesktopLaunchAppTool {
    fn name(&self) -> &str {
        "desktop.launch_app"
    }

    fn description(&self) -> &str {
        "Launches an installed desktop application by its name or desktop application ID."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "app": {
                    "type": "string",
                    "description": "Name or ID of the application (e.g. 'Google Chrome' or 'firefox.desktop')"
                },
                "args": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional command-line arguments to pass to the application"
                }
            },
            "required": ["app"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Process
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::ConfirmationRequired
    }

    async fn execute(&self, params: Value) -> ToolResult<Value> {
        let app = params
            .get("app")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'app' parameter".to_string()))?;

        let args: Vec<String> = params
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let pid = self
            .launcher
            .launch_app(app, &args)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to launch '{}': {}", app, e)))?;

        Ok(json!({
            "app": app,
            "pid": pid,
            "status": "launched"
        }))
    }
}

pub struct DesktopActiveWindowTool {
    inspector: Arc<dyn WindowInspector>,
}

impl DesktopActiveWindowTool {
    pub fn new() -> Self {
        Self {
            inspector: Arc::new(LinuxDesktopInspector::new()),
        }
    }

    pub fn with_inspector(inspector: Arc<dyn WindowInspector>) -> Self {
        Self { inspector }
    }
}

impl Default for DesktopActiveWindowTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DesktopActiveWindowTool {
    fn name(&self) -> &str {
        "desktop.active_window"
    }

    fn description(&self) -> &str {
        "Queries the active desktop window, display server, and workspace context."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Read
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::Automatic
    }

    async fn execute(&self, _params: Value) -> ToolResult<Value> {
        let window = self
            .inspector
            .get_active_window()
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to inspect desktop window: {}", e)))?;

        serde_json::to_value(&window)
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to serialize window info: {}", e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window::{MockWindowInspector, WindowInfo};

    #[tokio::test]
    async fn test_desktop_metrics_tool() {
        let tool = DesktopSystemMetricsTool::new();
        let result = tool.execute(json!({})).await.expect("metrics tool executes");
        assert!(result.get("uptime_seconds").is_some());
        assert!(result.get("memory_total_bytes").is_some());
    }

    #[tokio::test]
    async fn test_desktop_active_window_tool() {
        let mock = Arc::new(MockWindowInspector::new(WindowInfo {
            title: "EDITH Control Center".to_string(),
            app_name: "EDITH".to_string(),
            session_type: "wayland".to_string(),
            desktop_environment: "ubuntu:GNOME".to_string(),
            display: "wayland-0".to_string(),
            workspace: Some("1".to_string()),
        }));

        let tool = DesktopActiveWindowTool::with_inspector(mock);
        let result = tool.execute(json!({})).await.expect("window tool executes");
        assert_eq!(result["title"], "EDITH Control Center");
        assert_eq!(result["session_type"], "wayland");
    }
}
