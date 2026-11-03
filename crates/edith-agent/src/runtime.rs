use crate::context::ContextBuilder;
use crate::executor::ExecutionEngine;
use crate::plan::{Plan, PlanStep};
use crate::state_machine::TaskStateMachine;
use edith_core::{EdithError, TaskState, VerificationMode};
use edith_events::{EventBus, EventEnvelope};
use edith_memory::MemoryService;
use edith_models::{ChatMessage, ModelProvider, ModelRequest, ProviderRegistry};
use edith_router::{ModelRouter, RouteDecision};
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
    router: Arc<ModelRouter>,
    executor: Arc<ExecutionEngine>,
    memory: Arc<MemoryService>,
}

impl AgentRuntime {
    pub fn new(storage: Storage, event_bus: EventBus, models: ProviderRegistry) -> Self {
        let executor = Arc::new(ExecutionEngine::new(event_bus.clone()));
        let router = Arc::new(ModelRouter::new(storage.clone(), event_bus.clone(), models.clone()));
        let memory = Arc::new(MemoryService::new(storage.clone(), event_bus.clone()));
        Self {
            storage,
            event_bus,
            models,
            router,
            executor,
            memory,
        }
    }

    pub fn with_tools(
        storage: Storage,
        event_bus: EventBus,
        models: ProviderRegistry,
        tool_registry: edith_tools::ToolRegistry,
    ) -> Self {
        let executor = Arc::new(ExecutionEngine::with_tools(
            event_bus.clone(),
            tool_registry,
            edith_tools::policy::PolicyEngine::default(),
        ));
        let router = Arc::new(ModelRouter::new(storage.clone(), event_bus.clone(), models.clone()));
        let memory = Arc::new(MemoryService::new(storage.clone(), event_bus.clone()));
        Self {
            storage,
            event_bus,
            models,
            router,
            executor,
            memory,
        }
    }

    pub fn memory(&self) -> Arc<MemoryService> {
        self.memory.clone()
    }

    pub fn executor(&self) -> Arc<ExecutionEngine> {
        self.executor.clone()
    }

    pub fn router(&self) -> Arc<ModelRouter> {
        self.router.clone()
    }

    pub fn tool_registry(&self) -> &edith_tools::ToolRegistry {
        self.executor.tool_registry()
    }

    pub fn format_tools_prompt(&self) -> String {
        let descriptors = self.executor.tool_registry().list_descriptors();
        let mut prompt = String::new();
        for desc in descriptors {
            prompt.push_str(&format!("- `{}`: {}\n", desc.name, desc.description));
        }
        prompt
    }

    /// Orchestrates an incoming user objective from routing/planning through execution and verification.
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

        // 2. Fetch turns & build context with available tool capabilities and persistent memory
        let turns = self.storage.list_turns(session_id).await.unwrap_or_default();
        let tools_prompt = self.format_tools_prompt();
        let memory_context = self.memory.get_context_for_prompt(10).await.unwrap_or_default();

        let mut context_builder = ContextBuilder::new().with_tools_prompt(tools_prompt);
        if !memory_context.is_empty() {
            context_builder = context_builder.with_working_context(memory_context);
        }
        let messages = context_builder.build(&turns);

        // 3. Routing decision (Tier 0 heuristic or model selection)
        let route_decision = self.router.route(task_id, objective, turns.len()).await?;

        // 4. Check Tier 0 instant resolution
        if route_decision.is_tier0() {
            let answer = route_decision.tier0_result.unwrap_or_default();

            TaskStateMachine::can_transition(
                TaskState::Planning,
                TaskState::Executing,
                VerificationMode::NoneDeclared,
                false,
            )?;
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

            let turn = self
                .storage
                .append_turn(session_id, "assistant", &answer, None, Some(&route_decision.id))
                .await?;

            self.event_bus.publish(
                EventEnvelope::new(
                    "message.final",
                    serde_json::json!({
                        "session_id": session_id,
                        "turn_id": turn.id,
                        "content": answer,
                        "tier": "T0",
                    }),
                )
                .with_task(task_id),
            );

            return Ok(AgentExecutionResult {
                task_id: task_id.to_string(),
                final_state: TaskState::Completed,
                response: answer,
                thinking: None,
                steps_executed: 0,
            });
        }

        // 5. Check for cancellation
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

        let mut messages = messages;
        let lower_obj = objective.to_lowercase();

        // 6. Autonomous Grounding & Tool Execution (ReAct Pre-Execution)
        if lower_obj.contains("search") || lower_obj.contains("look up") || lower_obj.contains("find online") || lower_obj.contains("research") {
            let query = objective.replace("search for", "").replace("search", "").replace("look up", "").trim().to_string();
            let q = if query.is_empty() { objective.to_string() } else { query };

            self.event_bus.publish(
                EventEnvelope::new(
                    "tool.invoking",
                    serde_json::json!({
                        "session_id": session_id,
                        "task_id": task_id,
                        "tool": "web.search",
                        "input": { "query": &q, "limit": 4 }
                    }),
                )
                .with_task(task_id),
            );

            if let Ok(res) = self.executor.tool_registry().invoke("web.search", serde_json::json!({"query": q, "limit": 4}), self.executor.policy_engine()).await {
                self.event_bus.publish(
                    EventEnvelope::new(
                        "tool.completed",
                        serde_json::json!({
                            "session_id": session_id,
                            "task_id": task_id,
                            "tool": "web.search",
                            "output": res
                        }),
                    )
                    .with_task(task_id),
                );

                messages.push(ChatMessage::system(format!(
                    "Ground Truth Search Observation for '{}':\n{}\n\nUse this verified search evidence to ground your answer with specific facts and cite sources.",
                    objective, res
                )));
            }
        } else if lower_obj.contains("system metrics") || lower_obj.contains("cpu usage") || lower_obj.contains("ram usage") || lower_obj.contains("telemetry") {
            self.event_bus.publish(
                EventEnvelope::new(
                    "tool.invoking",
                    serde_json::json!({
                        "session_id": session_id,
                        "task_id": task_id,
                        "tool": "desktop.system_metrics",
                        "input": {}
                    }),
                )
                .with_task(task_id),
            );

            if let Ok(res) = self.executor.tool_registry().invoke("desktop.system_metrics", serde_json::json!({}), self.executor.policy_engine()).await {
                self.event_bus.publish(
                    EventEnvelope::new(
                        "tool.completed",
                        serde_json::json!({
                            "session_id": session_id,
                            "task_id": task_id,
                            "tool": "desktop.system_metrics",
                            "output": res
                        }),
                    )
                    .with_task(task_id),
                );

                messages.push(ChatMessage::system(format!(
                    "Ground Truth Host System Telemetry:\n{}\n\nUse these exact metrics in your response.",
                    res
                )));
            }
        } else if lower_obj.contains("list files") || lower_obj.contains("show files") || lower_obj.contains("files in repo") {
            self.event_bus.publish(
                EventEnvelope::new(
                    "tool.invoking",
                    serde_json::json!({
                        "session_id": session_id,
                        "task_id": task_id,
                        "tool": "fs.list_dir",
                        "input": { "path": "." }
                    }),
                )
                .with_task(task_id),
            );

            if let Ok(res) = self.executor.tool_registry().invoke("fs.list_dir", serde_json::json!({"path": "."}), self.executor.policy_engine()).await {
                self.event_bus.publish(
                    EventEnvelope::new(
                        "tool.completed",
                        serde_json::json!({
                            "session_id": session_id,
                            "task_id": task_id,
                            "tool": "fs.list_dir",
                            "output": res
                        }),
                    )
                    .with_task(task_id),
                );

                messages.push(ChatMessage::system(format!(
                    "Ground Truth Filesystem Listing (Current Directory):\n{}\n\nRefer to these real files in your answer.",
                    res
                )));
            }
        }

        // 7. Determine whether objective requires a multi-step plan
        let is_complex_task = objective.to_lowercase().contains("plan")
            || objective.to_lowercase().contains("steps")
            || objective.to_lowercase().contains("build");

        if is_complex_task {
            self.execute_complex_plan(session_id, task_id, objective, cancel_token).await
        } else {
            // Conversational direct execution with chosen route
            self.execute_conversational(session_id, task_id, &route_decision, messages, cancel_token).await
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

        // Record episodic memory of plan completion
        let _ = self
            .memory
            .record_episodic_event(session_id, &format!("Objective '{}' completed: {}", objective, response_summary))
            .await;

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
        route_decision: &RouteDecision,
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

        // Resolve model provider based on route decision and fallback chain
        let (provider, model_name) = self.resolve_provider(route_decision).await?;

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
            .append_turn(
                session_id,
                "assistant",
                &content_accum,
                thinking_opt,
                Some(&route_decision.id),
            )
            .await?;

        self.event_bus.publish(
            EventEnvelope::new(
                "message.final",
                serde_json::json!({
                    "session_id": session_id,
                    "turn_id": assistant_turn.id,
                    "content": content_accum,
                    "thinking": thinking_opt,
                    "route_id": route_decision.id,
                }),
            )
            .with_task(task_id),
        );

        // Record episodic memory of turn interaction
        let _ = self
            .memory
            .record_episodic_event(session_id, &format!("Completed response in session: {}", session_id))
            .await;

        Ok(AgentExecutionResult {
            task_id: task_id.to_string(),
            final_state: TaskState::Completed,
            response: content_accum,
            thinking: thinking_opt.map(|s| s.to_string()),
            steps_executed: 1,
        })
    }

    async fn resolve_provider(
        &self,
        route_decision: &RouteDecision,
    ) -> Result<(Arc<dyn ModelProvider>, String), EdithError> {
        // Try primary provider
        if let Some(p) = self.models.get(&route_decision.provider_id).await {
            return Ok((p, route_decision.primary_model.clone()));
        }

        // Try fallbacks
        for (provider_id, model_name) in &route_decision.fallback_chain {
            if let Some(p) = self.models.get(provider_id).await {
                return Ok((p, model_name.clone()));
            }
        }

        // Ultimate fallback: first available provider in registry
        let list = self.models.list().await;
        if let Some((first_id, _)) = list.first() {
            if let Some(p) = self.models.get(first_id).await {
                return Ok((p, "default".to_string()));
            }
        }

        Err(EdithError::Agent("No model provider available in registry".to_string()))
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
}
