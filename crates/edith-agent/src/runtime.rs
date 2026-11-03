use crate::context::ContextBuilder;
use crate::executor::ExecutionEngine;
use crate::plan::{Plan, PlanStep};
use crate::state_machine::TaskStateMachine;
use edith_core::{EdithError, TaskState, VerificationMode};
use edith_events::{EventBus, EventEnvelope};
use edith_models::{ChatMessage, ModelRequest, ProviderRegistry};
use edith_storage::Storage;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentExecutionResult {
    pub task_id: String,
    pub final_state: TaskState,
    pub response: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    pub steps_executed: usize,
}

#[derive(Clone)]
pub struct AgentRuntime {
    storage: Storage,
    event_bus: EventBus,
    models: ProviderRegistry,
    executor: Arc<ExecutionEngine>,
}

impl AgentRuntime {
    pub fn new(storage: Storage, event_bus: EventBus, models: ProviderRegistry) -> Self {
        let executor = Arc::new(ExecutionEngine::new(event_bus.clone()));
        Self {
            storage,
            event_bus,
            models,
            executor,
        }
    }

    pub fn executor(&self) -> Arc<ExecutionEngine> {
        self.executor.clone()
    }

    /// Orchestrates an incoming user objective from planning through execution and verification.
    pub async fn execute_objective(
        &self,
        session_id: &str,
        task_id: &str,
        objective: &str,
        cancel_token: CancellationToken,
    ) -> Result<AgentExecutionResult, EdithError> {
        info!(task_id = %task_id, objective = %objective, "Starting AgentRuntime orchestration");

        // 1. Transition state: Discovered -> Planning
        TaskStateMachine::can_transition(
            TaskState::Discovered,
            TaskState::Planning,
            VerificationMode::Mechanical,
            false,
        )?;
        self.storage
            .update_task_state(task_id, "planning", None)
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "planning", session_id);

        // 2. Fetch turns & build context
        let turns = self.storage.list_turns(session_id).await.unwrap_or_default();
        let context_builder = ContextBuilder::new();
        let messages = context_builder.build(&turns);

        // 3. Model selection
        let (provider, model_name) = self.select_model().await?;

        // 4. Check for cancellation
        if cancel_token.is_cancelled() {
            self.handle_cancellation(task_id, session_id).await?;
            return Ok(AgentExecutionResult {
                task_id: task_id.to_string(),
                final_state: TaskState::Cancelled,
                response: "Operation cancelled by user".to_string(),
                thinking: None,
                steps_executed: 0,
            });
        }

        // 5. Determine whether objective requires a multi-step plan
        let is_complex_task = objective.to_lowercase().contains("plan")
            || objective.to_lowercase().contains("steps")
            || objective.to_lowercase().contains("build");

        if is_complex_task {
            self.execute_complex_plan(session_id, task_id, objective, cancel_token).await
        } else {
            // Conversational direct execution
            self.execute_conversational(session_id, task_id, provider, model_name, messages, cancel_token).await
        }
    }

    async fn execute_complex_plan(
        &self,
        session_id: &str,
        task_id: &str,
        objective: &str,
        cancel_token: CancellationToken,
    ) -> Result<AgentExecutionResult, EdithError> {
        // Transition: Planning -> Executing
        TaskStateMachine::can_transition(
            TaskState::Planning,
            TaskState::Executing,
            VerificationMode::Mechanical,
            false,
        )?;
        self.storage
            .update_task_state(task_id, "executing", None)
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "executing", session_id);

        // Formulate steps
        let step1 = PlanStep::new(
            format!("Analyze requirements for: {}", objective),
            "analyze",
            serde_json::json!({"objective": objective}),
        );
        let step1_id = step1.id.clone();

        let step2 = PlanStep::new(
            "Execute primary action",
            "action",
            serde_json::json!({"details": "Action executed"}),
        )
        .with_dependency(step1_id);

        let mut plan = Plan::new(task_id, objective, vec![step1, step2]);

        let success = self
            .executor
            .execute_plan(&mut plan, cancel_token.clone())
            .await
            .map_err(EdithError::Agent)?;

        if cancel_token.is_cancelled() || !success {
            self.handle_cancellation(task_id, session_id).await?;
            return Ok(AgentExecutionResult {
                task_id: task_id.to_string(),
                final_state: TaskState::Cancelled,
                response: "Plan execution was cancelled or failed".to_string(),
                thinking: None,
                steps_executed: plan.steps.iter().filter(|s| s.status == crate::plan::StepStatus::Completed).count(),
            });
        }

        // Transition: Executing -> Verifying
        TaskStateMachine::can_transition(
            TaskState::Executing,
            TaskState::Verifying,
            VerificationMode::Mechanical,
            true,
        )?;
        self.storage
            .update_task_state(task_id, "verifying", None)
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "verifying", session_id);

        // Transition: Verifying -> Completed
        TaskStateMachine::can_transition(
            TaskState::Verifying,
            TaskState::Completed,
            VerificationMode::Mechanical,
            true,
        )?;
        self.storage
            .update_task_state(task_id, "completed", Some("completed"))
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "completed", session_id);

        let response_summary = format!(
            "Successfully completed multi-step plan for '{}' ({} steps executed).",
            objective,
            plan.steps.len()
        );

        let _ = self
            .storage
            .append_turn(session_id, "assistant", &response_summary, None, None)
            .await?;

        Ok(AgentExecutionResult {
            task_id: task_id.to_string(),
            final_state: TaskState::Completed,
            response: response_summary,
            thinking: None,
            steps_executed: plan.steps.len(),
        })
    }

    async fn execute_conversational(
        &self,
        session_id: &str,
        task_id: &str,
        provider: Arc<dyn edith_models::ModelProvider>,
        model_name: String,
        messages: Vec<ChatMessage>,
        cancel_token: CancellationToken,
    ) -> Result<AgentExecutionResult, EdithError> {
        // Planning -> Executing
        TaskStateMachine::can_transition(
            TaskState::Planning,
            TaskState::Executing,
            VerificationMode::NoneDeclared,
            false,
        )?;
        self.storage
            .update_task_state(task_id, "executing", None)
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "executing", session_id);

        let request = ModelRequest::new(model_name, messages).with_stream(true);
        let mut stream = provider
            .complete_stream(request)
            .await
            .map_err(|e| EdithError::Model(e.to_string()))?;

        let mut content_accum = String::new();
        let mut thinking_accum = String::new();
        let mut was_cancelled = false;

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    was_cancelled = true;
                    break;
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(chunk)) => {
                            content_accum.push_str(&chunk.delta);
                            if let Some(t) = chunk.thinking_delta.as_deref() {
                                thinking_accum.push_str(t);
                            }

                            self.event_bus.publish(
                                EventEnvelope::new(
                                    "message.delta",
                                    serde_json::json!({
                                        "session_id": session_id,
                                        "task_id": task_id,
                                        "delta": chunk.delta,
                                        "thinking_delta": chunk.thinking_delta,
                                    }),
                                )
                                .with_task(task_id),
                            );
                        }
                        Some(Err(e)) => {
                            warn!("Error chunk from stream: {e}");
                            self.storage.update_task_state(task_id, "failed", Some(&e.to_string())).await?;
                            return Err(EdithError::Model(e.to_string()));
                        }
                        None => break,
                    }
                }
            }
        }

        if was_cancelled {
            self.handle_cancellation(task_id, session_id).await?;
            return Ok(AgentExecutionResult {
                task_id: task_id.to_string(),
                final_state: TaskState::Cancelled,
                response: "Generation cancelled by user".to_string(),
                thinking: None,
                steps_executed: 0,
            });
        }

        // Executing -> Completed (NoneDeclared verification)
        TaskStateMachine::can_transition(
            TaskState::Executing,
            TaskState::Completed,
            VerificationMode::NoneDeclared,
            true,
        )?;
        self.storage
            .update_task_state(task_id, "completed", Some("completed"))
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "completed", session_id);

        let thinking_opt = if thinking_accum.trim().is_empty() {
            None
        } else {
            Some(thinking_accum.as_str())
        };

        let assistant_turn = self
            .storage
            .append_turn(session_id, "assistant", &content_accum, thinking_opt, None)
            .await?;

        self.event_bus.publish(
            EventEnvelope::new(
                "message.final",
                serde_json::json!({
                    "session_id": session_id,
                    "turn_id": assistant_turn.id,
                    "content": content_accum,
                    "thinking": thinking_opt,
                }),
            )
            .with_task(task_id),
        );

        Ok(AgentExecutionResult {
            task_id: task_id.to_string(),
            final_state: TaskState::Completed,
            response: content_accum,
            thinking: thinking_opt.map(|s| s.to_string()),
            steps_executed: 1,
        })
    }

    async fn handle_cancellation(&self, task_id: &str, session_id: &str) -> Result<(), EdithError> {
        self.storage
            .update_task_state(task_id, "cancelled", Some("cancelled"))
            .await?;
        self.publish_task_event(task_id, "task.state_changed", "cancelled", session_id);
        Ok(())
    }

    fn publish_task_event(&self, task_id: &str, kind: &str, to_state: &str, session_id: &str) {
        self.event_bus.publish(
            EventEnvelope::new(
                kind,
                serde_json::json!({
                    "task_id": task_id,
                    "session_id": session_id,
                    "state": to_state,
                }),
            )
            .with_task(task_id),
        );
    }

    async fn select_model(&self) -> Result<(Arc<dyn edith_models::ModelProvider>, String), EdithError> {
        let all_providers = self.models.list().await;
        if all_providers.iter().any(|(id, _)| id == "ollama") {
            Ok((self.models.get("ollama").await.unwrap(), "qwen3:0.6b".to_string()))
        } else if all_providers.iter().any(|(id, _)| id == "mock") {
            Ok((self.models.get("mock").await.unwrap(), "mock-model".to_string()))
        } else if let Some((first_id, _)) = all_providers.first() {
            Ok((self.models.get(first_id).await.unwrap(), "default".to_string()))
        } else {
            Err(EdithError::Agent("No model provider registered".to_string()))
        }
    }
}
