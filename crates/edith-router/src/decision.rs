use edith_core::{Id, Tier};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDecision {
    pub id: String,
    pub task_id: String,
    pub tier: Tier,
    pub primary_model: String,
    pub provider_id: String,
    pub fallback_chain: Vec<(String, String)>,
    pub estimated_tokens: u32,
    pub estimated_complexity: f32,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier0_result: Option<String>,
}

impl RouteDecision {
    pub fn tier0(task_id: impl Into<String>, answer: impl Into<String>) -> Self {
        Self {
            id: Id::new().to_string(),
            task_id: task_id.into(),
            tier: Tier::T0,
            primary_model: "deterministic-heuristic".to_string(),
            provider_id: "local-rule-engine".to_string(),
            fallback_chain: Vec::new(),
            estimated_tokens: 0,
            estimated_complexity: 0.0,
            reason: "Resolved deterministically without invoking model weights".to_string(),
            tier0_result: Some(answer.into()),
        }
    }

    pub fn model_route(
        task_id: impl Into<String>,
        tier: Tier,
        provider_id: impl Into<String>,
        primary_model: impl Into<String>,
        fallback_chain: Vec<(String, String)>,
        estimated_tokens: u32,
        estimated_complexity: f32,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            id: Id::new().to_string(),
            task_id: task_id.into(),
            tier,
            primary_model: primary_model.into(),
            provider_id: provider_id.into(),
            fallback_chain,
            estimated_tokens,
            estimated_complexity,
            reason: reason.into(),
            tier0_result: None,
        }
    }

    pub fn is_tier0(&self) -> bool {
        self.tier == Tier::T0
    }
}
