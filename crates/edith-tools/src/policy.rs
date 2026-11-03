use std::path::{Path, PathBuf};
use edith_core::{AutonomyClass, SideEffects};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::tool::Tool;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PolicyDecision {
    Allow,
    ConfirmRequired { reason: String, prompt: String },
    Deny { reason: String },
}

#[derive(Debug, Clone)]
pub struct PolicyEngine {
    allowed_roots: Vec<PathBuf>,
    allowlisted_programs: Vec<String>,
}

impl Default for PolicyEngine {
    fn default() -> Self {
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        Self {
            allowed_roots: vec![current_dir],
            allowlisted_programs: vec![
                "git".to_string(),
                "cargo".to_string(),
                "npm".to_string(),
                "npx".to_string(),
                "node".to_string(),
                "python3".to_string(),
                "python".to_string(),
                "ls".to_string(),
                "cat".to_string(),
                "head".to_string(),
                "tail".to_string(),
                "echo".to_string(),
                "grep".to_string(),
                "find".to_string(),
            ],
        }
    }
}

impl PolicyEngine {
    pub fn new(allowed_roots: Vec<PathBuf>) -> Self {
        let mut engine = Self::default();
        if !allowed_roots.is_empty() {
            engine.allowed_roots = allowed_roots;
        }
        engine
    }

    pub fn with_allowlisted_programs(mut self, programs: Vec<String>) -> Self {
        self.allowlisted_programs = programs;
        self
    }

    /// Pure function evaluating tool invocation against security and autonomy policies.
    pub fn evaluate(&self, tool: &dyn Tool, input: &Value) -> PolicyDecision {
        // 1. Check default autonomy
        match tool.default_autonomy() {
            AutonomyClass::Blocked => {
                return PolicyDecision::Deny {
                    reason: format!("Tool '{}' is classified as permanently Blocked", tool.name()),
                };
            }
            AutonomyClass::ConfirmationRequired => {
                return PolicyDecision::ConfirmRequired {
                    reason: format!("Tool '{}' requires explicit confirmation", tool.name()),
                    prompt: format!("Allow execution of '{}' with args: {}", tool.name(), input),
                };
            }
            _ => {}
        }

        // 2. Specific inspection based on tool name and side effects
        match tool.name() {
            "fs.read_file" | "fs.list_dir" => {
                if let Some(path_str) = input.get("path").and_then(|v| v.as_str()) {
                    self.evaluate_path(path_str, false)
                } else {
                    PolicyDecision::Allow
                }
            }
            "fs.write_file" => {
                if let Some(path_str) = input.get("path").and_then(|v| v.as_str()) {
                    let path_decision = self.evaluate_path(path_str, true);
                    if path_decision != PolicyDecision::Allow {
                        return path_decision;
                    }
                    // Write operations have write side effects and default to PolicyControlled
                    PolicyDecision::Allow
                } else {
                    PolicyDecision::Deny {
                        reason: "Missing 'path' argument in fs.write_file".to_string(),
                    }
                }
            }
            "system.execute_command" => {
                if let Some(program) = input.get("program").and_then(|v| v.as_str()) {
                    self.evaluate_command(program, input)
                } else {
                    PolicyDecision::Deny {
                        reason: "Missing 'program' argument in system.execute_command".to_string(),
                    }
                }
            }
            _ => {
                // For MCP or custom tools:
                match tool.side_effects() {
                    SideEffects::None | SideEffects::Read => PolicyDecision::Allow,
                    SideEffects::Write | SideEffects::Process => PolicyDecision::Allow,
                    SideEffects::System => PolicyDecision::ConfirmRequired {
                        reason: "System-level modification side effect requires confirmation".to_string(),
                        prompt: format!("Authorize system action '{}'?", tool.name()),
                    },
                    SideEffects::Network => PolicyDecision::Allow,
                }
            }
        }
    }

    fn evaluate_path(&self, raw_path: &str, is_write: bool) -> PolicyDecision {
        let path = Path::new(raw_path);

        // Disallow dangerous system paths
        let dangerous_prefixes = [
            "/etc", "/boot", "/sys", "/proc", "/dev", "/root", "/sbin", "/usr/sbin",
        ];
        for prefix in &dangerous_prefixes {
            if raw_path.starts_with(prefix) {
                return PolicyDecision::Deny {
                    reason: format!("Access to sensitive system path '{}' is strictly blocked", raw_path),
                };
            }
        }

        // Disallow parent traversal if it escapes root
        if raw_path.contains("..") {
            // Check canonicalized path
            if let Ok(canonical) = path.canonicalize() {
                if !self.is_within_allowed_roots(&canonical) {
                    return PolicyDecision::Deny {
                        reason: format!("Path traversal outside project roots is blocked: '{}'", raw_path),
                    };
                }
            } else if path.is_relative() {
                // Allow relative paths if current dir is in allowed roots
            } else {
                return PolicyDecision::Deny {
                    reason: format!("Invalid or escaping path: '{}'", raw_path),
                };
            }
        }

        // Sensitive user directories
        if raw_path.contains("/.ssh") || raw_path.contains("/.gnupg") || raw_path.contains("/.aws") {
            return PolicyDecision::Deny {
                reason: "Access to credential and key stores is strictly blocked".to_string(),
            };
        }

        if is_write && !self.is_within_allowed_roots(path) && path.is_absolute() {
            return PolicyDecision::ConfirmRequired {
                reason: format!("Write target '{}' is outside the project root", raw_path),
                prompt: format!("Allow writing to outside path '{}'?", raw_path),
            };
        }

        PolicyDecision::Allow
    }

    fn evaluate_command(&self, program: &str, input: &Value) -> PolicyDecision {
        let base_prog = Path::new(program)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(program);

        // Strictly forbidden shell invocation
        if base_prog == "sh" || base_prog == "bash" || base_prog == "zsh" || base_prog == "sudo" || base_prog == "su" {
            return PolicyDecision::Deny {
                reason: format!("Direct shell interpreter or privileged command '{}' is strictly forbidden by policy", program),
            };
        }

        // Strictly forbidden destructive binaries
        let destructive = ["rm", "mkfs", "dd", "shutdown", "reboot", "poweroff"];
        if destructive.contains(&base_prog) {
            return PolicyDecision::Deny {
                reason: format!("Destructive command '{}' is blocked", base_prog),
            };
        }

        // Check against allowlisted programs
        if self.allowlisted_programs.iter().any(|p| p == base_prog) {
            PolicyDecision::Allow
        } else {
            PolicyDecision::ConfirmRequired {
                reason: format!("Program '{}' is not in the automatic allowlist", program),
                prompt: format!("Run program '{}' with args: {:?}", program, input.get("args")),
            }
        }
    }

    fn is_within_allowed_roots(&self, path: &Path) -> bool {
        if self.allowed_roots.is_empty() {
            return true;
        }
        for root in &self.allowed_roots {
            if path.starts_with(root) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool::Tool;
    use async_trait::async_trait;
    use edith_core::{AutonomyClass, SideEffects};

    struct TestTool {
        name: &'static str,
        autonomy: AutonomyClass,
        side_effects: SideEffects,
    }

    #[async_trait]
    impl Tool for TestTool {
        fn name(&self) -> &str { self.name }
        fn description(&self) -> &str { "Test tool" }
        fn parameters_schema(&self) -> Value { serde_json::json!({}) }
        fn side_effects(&self) -> SideEffects { self.side_effects }
        fn default_autonomy(&self) -> AutonomyClass { self.autonomy }
        async fn execute(&self, _input: Value) -> Result<Value, crate::error::ToolError> {
            Ok(serde_json::json!({"status": "ok"}))
        }
    }

    #[test]
    fn test_blocked_tool_denied() {
        let engine = PolicyEngine::default();
        let tool = TestTool {
            name: "dangerous.wipe",
            autonomy: AutonomyClass::Blocked,
            side_effects: SideEffects::System,
        };
        let decision = engine.evaluate(&tool, &serde_json::json!({}));
        assert!(matches!(decision, PolicyDecision::Deny { .. }));
    }

    #[test]
    fn test_dangerous_path_denied() {
        let engine = PolicyEngine::default();
        let tool = TestTool {
            name: "fs.read_file",
            autonomy: AutonomyClass::Automatic,
            side_effects: SideEffects::Read,
        };
        let decision = engine.evaluate(&tool, &serde_json::json!({"path": "/etc/shadow"}));
        assert!(matches!(decision, PolicyDecision::Deny { .. }));
    }

    #[test]
    fn test_shell_command_denied() {
        let engine = PolicyEngine::default();
        let tool = TestTool {
            name: "system.execute_command",
            autonomy: AutonomyClass::Automatic,
            side_effects: SideEffects::Process,
        };
        let decision = engine.evaluate(&tool, &serde_json::json!({"program": "bash", "args": ["-c", "ls"]}));
        assert!(matches!(decision, PolicyDecision::Deny { .. }));
    }

    #[test]
    fn test_allowlisted_command_allowed() {
        let engine = PolicyEngine::default();
        let tool = TestTool {
            name: "system.execute_command",
            autonomy: AutonomyClass::Automatic,
            side_effects: SideEffects::Process,
        };
        let decision = engine.evaluate(&tool, &serde_json::json!({"program": "git", "args": ["status"]}));
        assert_eq!(decision, PolicyDecision::Allow);
    }
}
