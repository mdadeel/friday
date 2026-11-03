use crate::classifier::ComplexityClassifier;
use crate::decision::RouteDecision;
use crate::tier0::Tier0Matcher;
use edith_core::{EdithError, Tier};
use edith_events::{EventBus, EventEnvelope};
use edith_models::ProviderRegistry;
use edith_storage::Storage;
use tracing::info;

pub struct ModelRouter {
    storage: Storage,
    event_bus: EventBus,
    models: ProviderRegistry,
    tier0: Tier0Matcher,
}

impl ModelRouter {
    pub fn new(storage: Storage, event_bus: EventBus, models: ProviderRegistry) -> Self {
        Self {
            storage,
            event_bus,
            models,
            tier0: Tier0Matcher::new(),
        }
    }

    /// Evaluates prompt and returns routing decision, persisting audit trail.
    pub async fn route(
        &self,
        task_id: &str,
        prompt: &str,
        history_count: usize,
    ) -> Result<RouteDecision, EdithError> {
        info!(task_id = %task_id, "Evaluating routing for objective");

        // 1. Check Tier 0 deterministic heuristic first
        if let Some(tier0_res) = self.tier0.try_match(prompt) {
            let decision = RouteDecision::tier0(task_id, &tier0_res.answer);

            self.storage
                .record_route_decision(
                    task_id,
                    None,
                    "T0",
                    &decision.provider_id,
                    Some(&decision.primary_model),
                    "Public",
                    &decision.reason,
                    "[]",
                    "routed",
                )
                .await?;

            self.publish_route_event(&decision);
            return Ok(decision);
        }

        // 2. Classify task complexity into Tiers T1 - T4
        let classification = ComplexityClassifier::classify(prompt, history_count);

        // 3. Inspect available models and construct fallback chain
        let available_providers = self.models.list().await;
        let has_ollama = available_providers.iter().any(|(id, _)| id == "ollama");
        let has_mock = available_providers.iter().any(|(id, _)| id == "mock");

        let (chosen_tier, provider_id, primary_model, fallbacks) = match classification.tier {
            Tier::T0 => unreachable!(),
            Tier::T1 => {
                if has_ollama {
                    (
                        Tier::T1,
                        "ollama".to_string(),
                        "qwen3:0.6b".to_string(),
                        vec![("ollama".to_string(), "qwen3:4b".to_string()), ("mock".to_string(), "mock-fast".to_string())],
                    )
                } else if has_mock {
                    (
                        Tier::T1,
                        "mock".to_string(),
                        "mock-fast".to_string(),
                        Vec::new(),
                    )
                } else {
                    (
                        Tier::T1,
                        "default".to_string(),
                        "default".to_string(),
                        Vec::new(),
                    )
                }
            }
            Tier::T2 => {
                if has_ollama {
                    (
                        Tier::T2,
                        "ollama".to_string(),
                        "qwen3:4b".to_string(),
                        vec![("ollama".to_string(), "qwen3:0.6b".to_string()), ("mock".to_string(), "mock-reasoning".to_string())],
                    )
                } else if has_mock {
                    (
                        Tier::T2,
                        "mock".to_string(),
                        "mock-reasoning".to_string(),
                        Vec::new(),
                    )
                } else {
                    (
                        Tier::T2,
                        "default".to_string(),
                        "default".to_string(),
                        Vec::new(),
                    )
                }
            }
            Tier::T3 | Tier::T4 => {
                // When cloud providers are not configured, fallback gracefully to local reasoning (T2)
                if has_ollama {
                    (
                        classification.tier,
                        "ollama".to_string(),
                        "qwen3:4b".to_string(),
                        vec![("ollama".to_string(), "qwen3:0.6b".to_string())],
                    )
                } else {
                    (
                        classification.tier,
                        "mock".to_string(),
                        "mock-reasoning".to_string(),
                        Vec::new(),
                    )
                }
            }
        };

        let fallbacks_json = serde_json::to_string(&fallbacks).unwrap_or_else(|_| "[]".to_string());

        let decision = RouteDecision::model_route(
            task_id,
            chosen_tier,
            &provider_id,
            &primary_model,
            fallbacks,
            classification.estimated_tokens,
            classification.complexity,
            classification.rationale,
        );

        let tier_str = format!("{:?}", chosen_tier);
        self.storage
            .record_route_decision(
                task_id,
                None,
                &tier_str,
                &provider_id,
                Some(&primary_model),
                "Personal",
                classification.rationale,
                &fallbacks_json,
                "routed",
            )
            .await?;

        self.publish_route_event(&decision);
        Ok(decision)
    }

    fn publish_route_event(&self, decision: &RouteDecision) {
        self.event_bus.publish(
            EventEnvelope::new(
                "route.decided",
                serde_json::json!({
                    "task_id": decision.task_id,
                    "tier": format!("{:?}", decision.tier),
                    "provider": decision.provider_id,
                    "model": decision.primary_model,
                    "is_tier0": decision.is_tier0(),
                    "reason": decision.reason,
                }),
            )
            .with_task(&decision.task_id),
        );
    }
}
