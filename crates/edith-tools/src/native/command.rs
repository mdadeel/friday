use std::time::Duration;
use async_trait::async_trait;
use edith_core::{AutonomyClass, SideEffects};
use serde_json::{json, Value};
use tokio::process::Command;
use tokio::time::timeout;

use crate::error::{Result, ToolError};
use crate::tool::Tool;

pub struct SystemCommandTool;

#[async_trait]
impl Tool for SystemCommandTool {
    fn name(&self) -> &str {
        "system.execute_command"
    }

    fn description(&self) -> &str {
        "Execute a system command from the allowlisted development programs without shell interpretation."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "program": {
                    "type": "string",
                    "description": "The executable program name (e.g. 'git', 'cargo', 'npm', 'ls')"
                },
                "args": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Arguments to pass to the program"
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional working directory"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Optional timeout in seconds (default 30, maximum 300)"
                }
            },
            "required": ["program"]
        })
    }

    fn side_effects(&self) -> SideEffects {
        SideEffects::Process
    }

    fn default_autonomy(&self) -> AutonomyClass {
        AutonomyClass::PolicyControlled
    }

    async fn execute(&self, input: Value) -> Result<Value> {
        let program = input
            .get("program")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidParameters("Missing 'program' argument".to_string()))?;

        let args: Vec<String> = input
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|val| val.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let cwd = input.get("cwd").and_then(|v| v.as_str());

        let timeout_secs = input
            .get("timeout_secs")
            .and_then(|v| v.as_u64())
            .unwrap_or(30)
            .min(300);

        let mut cmd = Command::new(program);
        cmd.args(&args);

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        // Clean env: keep standard paths but don't leak arbitrary env
        cmd.env_remove("EDITH_SECRET");

        let duration = Duration::from_secs(timeout_secs);
        let output_result = timeout(duration, cmd.output()).await;

        let output = match output_result {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => {
                return Err(ToolError::ExecutionFailed(format!(
                    "Failed to execute '{}': {}",
                    program, e
                )));
            }
            Err(_) => {
                return Err(ToolError::ExecutionFailed(format!(
                    "Command '{}' timed out after {} seconds",
                    program, timeout_secs
                )));
            }
        };

        const MAX_OUTPUT_BYTES: usize = 1024 * 1024; // 1 MB cap
        let stdout_raw = String::from_utf8_lossy(&output.stdout);
        let stderr_raw = String::from_utf8_lossy(&output.stderr);

        let stdout = if stdout_raw.len() > MAX_OUTPUT_BYTES {
            format!("{}... [truncated]", &stdout_raw[..MAX_OUTPUT_BYTES])
        } else {
            stdout_raw.into_owned()
        };

        let stderr = if stderr_raw.len() > MAX_OUTPUT_BYTES {
            format!("{}... [truncated]", &stderr_raw[..MAX_OUTPUT_BYTES])
        } else {
            stderr_raw.into_owned()
        };

        Ok(json!({
            "program": program,
            "args": args,
            "exit_code": output.status.code(),
            "success": output.status.success(),
            "stdout": stdout,
            "stderr": stderr
        }))
    }
}
