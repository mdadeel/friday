pub mod classifier;
pub mod decision;
pub mod router;
pub mod tier0;

pub use classifier::{ClassificationResult, ComplexityClassifier};
pub use decision::RouteDecision;
pub use router::ModelRouter;
pub use tier0::{Tier0Matcher, Tier0Result};

#[cfg(test)]
mod tests {
    use super::*;
    use edith_core::{TaskOrigin, TaskPriority, Tier, VerificationMode};
    use edith_events::EventBus;
    use edith_models::{MockProvider, ProviderRegistry};
    use edith_storage::Storage;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_model_router_tier0_math() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let models = ProviderRegistry::new();
        let router = ModelRouter::new(storage.clone(), event_bus, models);

        let task = storage
            .create_task(
                None,
                TaskOrigin::Text,
                "calculate 15 * 6",
                TaskPriority::Interactive,
                VerificationMode::Mechanical,
                "trace-t0",
            )
            .await
            .unwrap();

        // Tier 0 math evaluation
        let decision = router.route(&task.id, "calculate 15 * 6", 0).await.unwrap();
        assert_eq!(decision.tier, Tier::T0);
        assert!(decision.is_tier0());
        assert_eq!(decision.tier0_result.as_deref(), Some("15 * 6 = 90"));

        // Verify route decision audit in SQLite
        let decisions = storage.list_route_decisions(&task.id).await.unwrap();
        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].tier, "T0");
        assert_eq!(decisions[0].provider, "local-rule-engine");
    }

    #[tokio::test]
    async fn test_model_router_tier1_fast_local() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let models = ProviderRegistry::new();
        models.register(Arc::new(MockProvider::default())).await;

        let router = ModelRouter::new(storage.clone(), event_bus, models);

        let task = storage
            .create_task(
                None,
                TaskOrigin::Text,
                "hi there",
                TaskPriority::Interactive,
                VerificationMode::NoneDeclared,
                "trace-t1",
            )
            .await
            .unwrap();

        let decision = router.route(&task.id, "hi there", 0).await.unwrap();
        assert_eq!(decision.tier, Tier::T1);
        assert!(!decision.is_tier0());
        assert!(decision.tier0_result.is_none());

        // Verify audit in SQLite
        let decisions = storage.list_route_decisions(&task.id).await.unwrap();
        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].tier, "T1");
    }

    #[tokio::test]
    async fn test_model_router_tier2_reasoning_local() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let models = ProviderRegistry::new();
        models.register(Arc::new(MockProvider::default())).await;

        let router = ModelRouter::new(storage.clone(), event_bus, models);

        let task = storage
            .create_task(
                None,
                TaskOrigin::Text,
                "Why does ice float on water?",
                TaskPriority::Interactive,
                VerificationMode::NoneDeclared,
                "trace-t2",
            )
            .await
            .unwrap();

        let decision = router.route(&task.id, "Why does ice float on water?", 0).await.unwrap();
        assert_eq!(decision.tier, Tier::T2);

        // Verify audit in SQLite
        let decisions = storage.list_route_decisions(&task.id).await.unwrap();
        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].tier, "T2");
    }
}
