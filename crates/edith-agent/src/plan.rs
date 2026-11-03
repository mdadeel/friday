use edith_core::{Id, VerificationMode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    pub capability: String,
    #[serde(default)]
    pub params: Value,
    #[serde(default)]
    pub depends_on: Vec<String>,
    pub status: StepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub verification: VerificationMode,
}

impl PlanStep {
    pub fn new(
        title: impl Into<String>,
        capability: impl Into<String>,
        params: Value,
    ) -> Self {
        Self {
            id: Id::new().to_string(),
            title: title.into(),
            capability: capability.into(),
            params,
            depends_on: Vec::new(),
            status: StepStatus::Pending,
            output: None,
            error: None,
            verification: VerificationMode::Mechanical,
        }
    }

    pub fn with_dependency(mut self, step_id: impl Into<String>) -> Self {
        self.depends_on.push(step_id.into());
        self
    }

    pub fn with_verification(mut self, mode: VerificationMode) -> Self {
        self.verification = mode;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub task_id: String,
    pub objective: String,
    pub steps: Vec<PlanStep>,
    pub created_at: String,
}

impl Plan {
    pub fn new(task_id: impl Into<String>, objective: impl Into<String>, steps: Vec<PlanStep>) -> Self {
        Self {
            id: Id::new().to_string(),
            task_id: task_id.into(),
            objective: objective.into(),
            steps,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Computes execution waves: groups of step IDs where steps in each wave can run concurrently
    /// because all their dependencies were completed in prior waves.
    pub fn compute_waves(&self) -> Result<Vec<Vec<String>>, String> {
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        let mut dependents: HashMap<String, Vec<String>> = HashMap::new();
        let all_ids: HashSet<String> = self.steps.iter().map(|s| s.id.clone()).collect();

        for step in &self.steps {
            in_degree.insert(step.id.clone(), step.depends_on.len());
            for dep in &step.depends_on {
                if !all_ids.contains(dep) {
                    return Err(format!("Step '{}' depends on unknown step '{}'", step.id, dep));
                }
                dependents.entry(dep.clone()).or_default().push(step.id.clone());
            }
        }

        let mut waves = Vec::new();
        let mut remaining_ids = all_ids.clone();

        while !remaining_ids.is_empty() {
            let current_wave: Vec<String> = remaining_ids
                .iter()
                .filter(|id| *in_degree.get(*id).unwrap_or(&0) == 0)
                .cloned()
                .collect();

            if current_wave.is_empty() {
                return Err("Cyclic dependency detected in execution plan".to_string());
            }

            for id in &current_wave {
                remaining_ids.remove(id);
                if let Some(deps) = dependents.get(id) {
                    for dep_step in deps {
                        if let Some(deg) = in_degree.get_mut(dep_step) {
                            if *deg > 0 {
                                *deg -= 1;
                            }
                        }
                    }
                }
            }

            waves.push(current_wave);
        }

        Ok(waves)
    }

    pub fn is_complete(&self) -> bool {
        self.steps
            .iter()
            .all(|s| matches!(s.status, StepStatus::Completed | StepStatus::Skipped))
    }

    pub fn has_failures(&self) -> bool {
        self.steps.iter().any(|s| s.status == StepStatus::Failed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_wave_computation() {
        let step1 = PlanStep::new("Fetch data", "http.get", Value::Null);
        let step1_id = step1.id.clone();

        let step2a = PlanStep::new("Process A", "calc.a", Value::Null).with_dependency(&step1_id);
        let step2a_id = step2a.id.clone();

        let step2b = PlanStep::new("Process B", "calc.b", Value::Null).with_dependency(&step1_id);
        let step2b_id = step2b.id.clone();

        let step3 = PlanStep::new("Aggregate", "report.gen", Value::Null)
            .with_dependency(&step2a_id)
            .with_dependency(&step2b_id);
        let step3_id = step3.id.clone();

        let plan = Plan::new("task-1", "Generate report", vec![step1, step2a, step2b, step3]);

        let waves = plan.compute_waves().unwrap();
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0], vec![step1_id]);
        assert_eq!(waves[1].len(), 2);
        assert!(waves[1].contains(&step2a_id));
        assert!(waves[1].contains(&step2b_id));
        assert_eq!(waves[2], vec![step3_id]);
    }

    #[test]
    fn test_cycle_detection() {
        let mut step1 = PlanStep::new("A", "cap.a", Value::Null);
        let mut step2 = PlanStep::new("B", "cap.b", Value::Null);

        step1.depends_on.push(step2.id.clone());
        step2.depends_on.push(step1.id.clone());

        let plan = Plan::new("task-1", "Loop", vec![step1, step2]);
        assert!(plan.compute_waves().is_err());
    }
}
