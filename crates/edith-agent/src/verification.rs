use edith_core::{EdithError, VerificationMode};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct VerificationEngine;

impl VerificationEngine {
    /// Verifies step execution outcome based on the declared `VerificationMode`.
    pub fn verify_step(
        mode: VerificationMode,
        output: Option<&Value>,
        error: Option<&str>,
        has_user_approval: bool,
    ) -> Result<bool, EdithError> {
        if let Some(err) = error {
            return Err(EdithError::Agent(format!("Step execution failed: {err}")));
        }

        match mode {
            VerificationMode::NoneDeclared => Ok(true),
            VerificationMode::Mechanical => {
                match output {
                    Some(val) if !val.is_null() => Ok(true),
                    _ => Err(EdithError::Agent(
                        "Mechanical verification failed: output is missing or null".to_string(),
                    )),
                }
            }
            VerificationMode::Evidence => {
                match output {
                    Some(Value::Object(map)) => {
                        // Check for explicit evidence keys or non-empty output payload
                        if map.contains_key("evidence") || map.contains_key("result") || !map.is_empty() {
                            Ok(true)
                        } else {
                            Err(EdithError::Agent(
                                "Evidence verification failed: output does not contain required evidence keys".to_string(),
                            ))
                        }
                    }
                    Some(Value::String(s)) if !s.trim().is_empty() => Ok(true),
                    _ => Err(EdithError::Agent(
                        "Evidence verification failed: expected non-empty output evidence".to_string(),
                    )),
                }
            }
            VerificationMode::UserConfirmed => {
                if has_user_approval {
                    Ok(true)
                } else {
                    Err(EdithError::Agent(
                        "User approval required to pass user-confirmed verification gate".to_string(),
                    ))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mechanical_verification() {
        let ok_out = serde_json::json!({"status": "ok"});
        assert!(VerificationEngine::verify_step(VerificationMode::Mechanical, Some(&ok_out), None, false).is_ok());

        assert!(VerificationEngine::verify_step(VerificationMode::Mechanical, None, None, false).is_err());
        assert!(VerificationEngine::verify_step(VerificationMode::Mechanical, Some(&Value::Null), None, false).is_err());
    }

    #[test]
    fn test_user_confirmed_verification() {
        let ok_out = serde_json::json!({"status": "ok"});
        assert!(VerificationEngine::verify_step(VerificationMode::UserConfirmed, Some(&ok_out), None, false).is_err());
        assert!(VerificationEngine::verify_step(VerificationMode::UserConfirmed, Some(&ok_out), None, true).is_ok());
    }
}
