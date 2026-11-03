use edith_core::{EdithError, TaskState, VerificationMode};

#[derive(Debug, Clone)]
pub struct TaskStateMachine;

impl TaskStateMachine {
    /// Validates whether a state transition from `current` to `target` is legal.
    pub fn can_transition(
        current: TaskState,
        target: TaskState,
        verification_mode: VerificationMode,
        has_evidence: bool,
    ) -> Result<(), EdithError> {
        if current == target {
            return Ok(());
        }

        // Terminal states cannot transition to anything
        if matches!(current, TaskState::Completed | TaskState::Failed | TaskState::Cancelled) {
            return Err(EdithError::Agent(format!(
                "Cannot transition from terminal state '{:?}' to '{:?}'",
                current, target
            )));
        }

        match (current, target) {
            // Discovered can move to Planning, Executing (for direct/Tier 0 execution), or Cancelled
            (TaskState::Discovered, TaskState::Planning)
            | (TaskState::Discovered, TaskState::Executing)
            | (TaskState::Discovered, TaskState::Cancelled) => Ok(()),

            // Planning can move to Executing, WaitingApproval, Failed, or Cancelled
            (TaskState::Planning, TaskState::Executing)
            | (TaskState::Planning, TaskState::WaitingApproval)
            | (TaskState::Planning, TaskState::Failed)
            | (TaskState::Planning, TaskState::Cancelled) => Ok(()),

            // WaitingApproval can move to Executing (if approved), Cancelled (if denied), or Failed
            (TaskState::WaitingApproval, TaskState::Executing)
            | (TaskState::WaitingApproval, TaskState::Cancelled)
            | (TaskState::WaitingApproval, TaskState::Failed) => Ok(()),

            // Executing can move to Verifying, WaitingApproval (if elevation needed), Failed, Cancelled, or Completed (if NoneDeclared verification)
            (TaskState::Executing, TaskState::Verifying)
            | (TaskState::Executing, TaskState::WaitingApproval)
            | (TaskState::Executing, TaskState::Failed)
            | (TaskState::Executing, TaskState::Cancelled) => Ok(()),
            (TaskState::Executing, TaskState::Completed) => {
                if verification_mode == VerificationMode::NoneDeclared {
                    Ok(())
                } else {
                    Err(EdithError::Agent(
                        "Task requires verification before entering Completed state".to_string(),
                    ))
                }
            }

            // Verifying can move to Completed (if verified), Executing (re-plan/retry), Failed, or Cancelled
            (TaskState::Verifying, TaskState::Completed) => {
                match verification_mode {
                    VerificationMode::Mechanical | VerificationMode::Evidence => {
                        if !has_evidence {
                            Err(EdithError::Agent(
                                "Evidence verification required before completing task".to_string(),
                            ))
                        } else {
                            Ok(())
                        }
                    }
                    VerificationMode::UserConfirmed => Ok(()),
                    VerificationMode::NoneDeclared => Ok(()),
                }
            }
            (TaskState::Verifying, TaskState::Executing)
            | (TaskState::Verifying, TaskState::Failed)
            | (TaskState::Verifying, TaskState::Cancelled) => Ok(()),

            _ => Err(EdithError::Agent(format!(
                "Illegal task state transition from '{:?}' to '{:?}'",
                current, target
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_task_lifecycle_transitions() {
        assert!(TaskStateMachine::can_transition(
            TaskState::Discovered,
            TaskState::Planning,
            VerificationMode::Mechanical,
            false,
        ).is_ok());

        assert!(TaskStateMachine::can_transition(
            TaskState::Planning,
            TaskState::Executing,
            VerificationMode::Mechanical,
            false,
        ).is_ok());

        assert!(TaskStateMachine::can_transition(
            TaskState::Executing,
            TaskState::Verifying,
            VerificationMode::Mechanical,
            false,
        ).is_ok());

        // Verifying requires evidence for Mechanical verification
        assert!(TaskStateMachine::can_transition(
            TaskState::Verifying,
            TaskState::Completed,
            VerificationMode::Mechanical,
            false,
        ).is_err());

        assert!(TaskStateMachine::can_transition(
            TaskState::Verifying,
            TaskState::Completed,
            VerificationMode::Mechanical,
            true,
        ).is_ok());
    }

    #[test]
    fn test_terminal_states_cannot_transition() {
        assert!(TaskStateMachine::can_transition(
            TaskState::Completed,
            TaskState::Executing,
            VerificationMode::Mechanical,
            true,
        ).is_err());

        assert!(TaskStateMachine::can_transition(
            TaskState::Failed,
            TaskState::Planning,
            VerificationMode::Mechanical,
            true,
        ).is_err());

        assert!(TaskStateMachine::can_transition(
            TaskState::Cancelled,
            TaskState::Executing,
            VerificationMode::Mechanical,
            true,
        ).is_err());
    }
}
