pub mod context;
pub mod executor;
pub mod plan;
pub mod runtime;
pub mod state_machine;
pub mod verification;

pub use context::ContextBuilder;
pub use executor::{ExecutionEngine, StepHandler};
pub use plan::{Plan, PlanStep, StepStatus};
pub use runtime::{AgentExecutionResult, AgentRuntime};
pub use state_machine::TaskStateMachine;
pub use verification::VerificationEngine;

#[cfg(test)]
mod tests {
    use super::*;
    use edith_events::EventBus;
    use edith_models::{MockProvider, ProviderRegistry};
    use edith_storage::Storage;
    use std::sync::Arc;
    use tokio_util::sync::CancellationToken;

    #[tokio::test]
    async fn test_agent_runtime_conversational_execution() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(32);
        let mut rx = event_bus.subscribe();

        let models = ProviderRegistry::new();
        models.register(Arc::new(MockProvider::default())).await;

        let session = storage.create_session("Agent Test").await.unwrap();
        let turn = storage
            .append_turn(&session.id, "user", "What is 2+2?", None, None)
            .await
            .unwrap();
        let task = storage
            .create_task(
                Some(&session.id),
                edith_core::TaskOrigin::Text,
                "What is 2+2?",
                edith_core::TaskPriority::Interactive,
                edith_core::VerificationMode::NoneDeclared,
                &turn.id,
            )
            .await
            .unwrap();

        let runtime = AgentRuntime::new(storage.clone(), event_bus, models);
        let token = CancellationToken::new();

        let result = runtime
            .execute_objective(&session.id, &task.id, "What is 2+2?", token)
            .await
            .unwrap();

        assert_eq!(result.final_state, edith_core::TaskState::Completed);
        assert!(!result.response.is_empty());

        // Verify task updated in SQLite
        let updated_task = storage.get_task(&task.id).await.unwrap().unwrap();
        assert_eq!(updated_task.state, "completed");

        // Verify events emitted
        let mut event_kinds = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            event_kinds.push(ev.kind);
        }
        assert!(event_kinds.contains(&"task.state_changed".to_string()));
        assert!(event_kinds.contains(&"message.delta".to_string()));
        assert!(event_kinds.contains(&"message.final".to_string()));
    }

    #[tokio::test]
    async fn test_agent_runtime_complex_plan_execution() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(32);

        let models = ProviderRegistry::new();
        models.register(Arc::new(MockProvider::default())).await;

        let session = storage.create_session("Plan Test").await.unwrap();
        let turn = storage
            .append_turn(&session.id, "user", "Plan and build project", None, None)
            .await
            .unwrap();
        let task = storage
            .create_task(
                Some(&session.id),
                edith_core::TaskOrigin::Text,
                "Plan and build project",
                edith_core::TaskPriority::Interactive,
                edith_core::VerificationMode::Mechanical,
                &turn.id,
            )
            .await
            .unwrap();

        let runtime = AgentRuntime::new(storage.clone(), event_bus, models);
        let token = CancellationToken::new();

        let result = runtime
            .execute_objective(&session.id, &task.id, "Plan and build project", token)
            .await
            .unwrap();

        assert_eq!(result.final_state, edith_core::TaskState::Completed);
        assert_eq!(result.steps_executed, 2);

        // Verify SQLite state
        let updated_task = storage.get_task(&task.id).await.unwrap().unwrap();
        assert_eq!(updated_task.state, "completed");
        assert_eq!(updated_task.outcome.as_deref(), Some("completed"));
    }
}
