use crate::provider::ModelProvider;
use crate::types::ProviderHealth;
use edith_core::EdithError;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Default)]
pub struct ProviderRegistry {
    providers: Arc<RwLock<HashMap<String, Arc<dyn ModelProvider>>>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, provider: Arc<dyn ModelProvider>) {
        let mut map = self.providers.write().await;
        map.insert(provider.id().to_string(), provider);
    }

    pub async fn get(&self, id: &str) -> Option<Arc<dyn ModelProvider>> {
        let map = self.providers.read().await;
        map.get(id).cloned()
    }

    pub async fn list(&self) -> Vec<(String, String)> {
        let map = self.providers.read().await;
        map.values().map(|p| (p.id().to_string(), p.name().to_string())).collect()
    }

    pub async fn check_all_health(&self) -> HashMap<String, Result<ProviderHealth, EdithError>> {
        let map = self.providers.read().await;
        let mut results = HashMap::new();

        for (id, provider) in map.iter() {
            let health = provider.check_health().await;
            results.insert(id.clone(), health);
        }

        results
    }
}
