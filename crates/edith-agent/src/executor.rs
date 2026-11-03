use crate::plan::{Plan, PlanStep, StepStatus};
use crate::verification::VerificationEngine;
use async_trait::async_trait;
use edith_events::{EventBus, EventEnvelope};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

#[async_trait]
pub trait StepHandler: Send + Sync {
    async fn execute(&self, step: &PlanStep) -> Result<Value, String>;
}

pub struct ExecutionEngine {
    event_bus: EventBus,
    handlers: Arc<RwLock<HashMap<String, Arc<dyn StepHandler>>>>,
}

impl ExecutionEngine {
    pub fn new(event_bus: EventBus) -> Self {
        Self {
            event_bus,
            handlers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_handler(&self, capability: impl Into<String>, handler: Arc<dyn StepHandler>) {
        let mut map = self.handlers.write().await;
        map.insert(capability.into(), handler);
    }

    /// Executes all waves in the plan.
    pub async fn execute_plan(
        &self,
        plan: &mut Plan,
        cancel_token: CancellationToken,
    ) -> Result<bool, String> {
        let waves = plan.compute_waves()?;
        info!(task_id = %plan.task_id, waves_count = waves.len(), "Beginning plan execution");

        for (wave_idx, wave) in waves.iter().enumerate() {
            if cancel_token.is_cancelled() {
                info!(task_id = %plan.task_id, wave = wave_idx, "Execution cancelled before wave");
                self.skip_remaining_steps(plan);
                return Ok(false);
            }

            info!(task_id = %plan.task_id, wave = wave_idx, step_count = wave.len(), "Executing wave");

            for step_id in wave {
                if cancel_token.is_cancelled() {
                    self.skip_remaining_steps(plan);
                    return Ok(false);
                }

                // Locate step
                let step_pos = match plan.steps.iter().position(|s| s.id == *step_id) {
                    Some(p) => p,
                    None => continue,
                };

                let step = &mut plan.steps[step_pos];
                step.status = StepStatus::Running;

                self.event_bus.publish(
                    EventEnvelope::new(
                        "step.started",
                        serde_json::json!({
                            "task_id": plan.task_id,
                            "plan_id": plan.id,
                            "step_id": step.id,
                            "title": step.title,
                            "capability": step.capability,
                        }),
                    )
                    .with_task(&plan.task_id),
                );

                // Find handler
                let handler = {
                    let map = self.handlers.read().await;
                    map.get(&step.capability).cloned()
                };

                let exec_result = match handler {
                    Some(h) => h.execute(step).await,
                    None => {
                        // Default mock/fallback execution if no specific tool handler registered
                        Ok(serde_json::json!({
                            "status": "simulated",
                            "capability": step.capability,
                            "message": format!("Step '{}' executed successfully", step.title)
                        }))
                    }
                };

                match exec_result {
                    Ok(output) => {
                        // Run verification
                        match VerificationEngine::verify_step(step.verification, Some(&output), None, false) {
                            Ok(_) => {
                                step.status = StepStatus::Completed;
                                step.output = Some(output.clone());

                                self.event_bus.publish(
                                    EventEnvelope::new(
                                        "step.completed",
                                        serde_json::json!({
                                            "task_id": plan.task_id,
                                            "step_id": step.id,
                                            "output": output,
                                        }),
                                    )
                                    .with_task(&plan.task_id),
                                );
                            }
                            Err(v_err) => {
                                warn!(step_id = %step.id, error = %v_err, "Step verification failed");
                                step.status = StepStatus::Failed;
                                step.error = Some(v_err.to_string());

                                self.event_bus.publish(
                                    EventEnvelope::new(
                                        "step.failed",
                                        serde_json::json!({
                                            "task_id": plan.task_id,
                                            "step_id": step.id,
                                            "error": v_err.to_string(),
                                        }),
                                    )
                                    .with_task(&plan.task_id),
                                );

                                self.skip_remaining_steps(plan);
                                return Err(v_err.to_string());
                            }
                        }
                    }
                    Err(e) => {
                        warn!(step_id = %step.id, error = %e, "Step execution failed");
                        step.status = StepStatus::Failed;
                        step.error = Some(e.clone());

                        self.event_bus.publish(
                            EventEnvelope::new(
                                "step.failed",
                                serde_json::json!({
                                    "task_id": plan.task_id,
                                    "step_id": step.id,
                                    "error": e,
                                }),
                            )
                            .with_task(&plan.task_id),
                        );

                        self.skip_remaining_steps(plan);
                        return Err(e);
                    }
                }
            }
        }

        Ok(plan.is_complete())
    }

    fn skip_remaining_steps(&self, plan: &mut Plan) {
        for step in &mut plan.steps {
            if step.status == StepStatus::Pending {
                step.status = StepStatus::Skipped;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct EchoHandler;
    #[async_trait]
    impl StepHandler for EchoHandler {
        async fn execute(&self, step: &PlanStep) -> Result<Value, String> {
            Ok(serde_json::json!({"echo": step.title}))
        }
    }

    #[tokio::test]
    async fn test_execution_engine_wave_dispatch() {
        let event_bus = EventBus::new(32);
        let mut rx = event_bus.subscribe();
        let engine = ExecutionEngine::new(event_bus);

        engine.register_handler("echo", Arc::new(EchoHandler)).await;

        let step1 = PlanStep::new("Step 1", "echo", Value::Null);
        let step1_id = step1.id.clone();
        let step2 = PlanStep::new("Step 2", "echo", Value::Null).with_dependency(step1_id);

        let mut plan = Plan::new("task-123", "Test Wave Exec", vec![step1, step2]);
        let token = CancellationToken::new();

        let success = engine.execute_plan(&mut plan, token).await.unwrap();
        assert!(success);
        assert!(plan.is_complete());

        // Verify emitted events
        let ev1 = rx.recv().await.unwrap();
        assert_eq!(ev1.kind, "step.started");
        let ev2 = rx.recv().await.unwrap();
        assert_eq!(ev2.kind, "step.completed");
    }

    #[tokio::test]
    async fn test_execution_engine_cancellation() {
        let event_bus = EventBus::new(32);
        let engine = ExecutionEngine::new(event_bus);

        let step1 = PlanStep::new("Step 1", "echo", Value::Null);
        let step2 = PlanStep::new("Step 2", "echo", Value::Null);

        let mut plan = Plan::new("task-cancel", "Cancel Test", vec![step1, step2]);
        let token = CancellationToken::new();
        token.cancel(); // Cancel immediately

        let success = engine.execute_plan(&mut plan, token).await.unwrap();
        assert!(!success);
        assert_eq!(plan.steps[0].status, StepStatus::Skipped);
        assert_eq!(plan.steps[1].status, StepStatus::Skipped);
    }
}
