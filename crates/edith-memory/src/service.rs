use chrono::{Duration, Utc};
use edith_core::Provenance;
use edith_events::{EventBus, EventEnvelope};
use edith_storage::{MemoryItemRecord, Storage};
use serde_json::Value;

use crate::error::{MemoryError, Result};
use crate::provenance::MemoryGatekeeper;

#[derive(Clone)]
pub struct MemoryService {
    storage: Storage,
    event_bus: EventBus,
}

impl MemoryService {
    pub fn new(storage: Storage, event_bus: EventBus) -> Self {
        Self { storage, event_bus }
    }

    /// Store a semantic fact (e.g. user preference, timezone, project fact).
    pub async fn record_semantic_fact(
        &self,
        content: &str,
        structured: Option<Value>,
        provenance: Provenance,
        confidence: f32,
        importance: f32,
    ) -> Result<MemoryItemRecord> {
        MemoryGatekeeper::sanitize_and_check(content)?;

        let bounded_conf = MemoryGatekeeper::validate_confidence(provenance, confidence, false);
        let provenance_str = match provenance {
            Provenance::Explicit => "explicit",
            Provenance::Inferred => "inferred",
            Provenance::Assumption => "assumption",
            Provenance::Temporary => "temporary",
            Provenance::Outdated => "outdated",
        };

        let user_confirmed = provenance == Provenance::Explicit;
        let structured_str = structured.map(|v| v.to_string());

        let record = self
            .storage
            .create_memory_item(
                "semantic",
                content,
                structured_str.as_deref(),
                provenance_str,
                bounded_conf,
                importance,
                user_confirmed,
                "active",
                None,
                None,
            )
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?;

        self.event_bus.publish(
            EventEnvelope::new(
                "memory.written",
                serde_json::json!({
                    "id": record.id,
                    "category": record.category,
                    "provenance": record.provenance,
                    "content": record.content,
                }),
            )
        );

        Ok(record)
    }

    /// Store temporary working context for an active task with a time-to-live (TTL).
    pub async fn record_working_context(
        &self,
        task_id: &str,
        content: &str,
        ttl_secs: u64,
    ) -> Result<MemoryItemRecord> {
        MemoryGatekeeper::sanitize_and_check(content)?;

        let expires_at = Utc::now() + Duration::seconds(ttl_secs as i64);
        let expires_at_str = expires_at.to_rfc3339();

        let record = self
            .storage
            .create_memory_item(
                "working",
                content,
                Some(&serde_json::json!({"task_id": task_id}).to_string()),
                "temporary",
                0.80,
                0.50,
                false,
                "active",
                Some(&expires_at_str),
                None,
            )
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?;

        Ok(record)
    }

    /// Record an episodic event summary from a completed task or session.
    pub async fn record_episodic_event(
        &self,
        session_id: &str,
        summary: &str,
    ) -> Result<MemoryItemRecord> {
        MemoryGatekeeper::sanitize_and_check(summary)?;

        let record = self
            .storage
            .create_memory_item(
                "episodic",
                summary,
                Some(&serde_json::json!({"session_id": session_id}).to_string()),
                "explicit",
                0.90,
                0.60,
                true,
                "active",
                None,
                None,
            )
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?;

        Ok(record)
    }

    /// Confirm an inferred or assumed memory fact, elevating it to confirmed explicit fact.
    pub async fn confirm_memory(&self, id: &str) -> Result<MemoryItemRecord> {
        let existing = self
            .storage
            .get_memory_item(id)
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?
            .ok_or_else(|| MemoryError::NotFound(id.to_string()))?;

        let updated = self
            .storage
            .update_memory_item(
                &existing.id,
                None,
                Some("active"),
                Some(0.95),
                Some(true),
            )
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?
            .ok_or_else(|| MemoryError::NotFound(id.to_string()))?;

        self.event_bus.publish(
            EventEnvelope::new(
                "memory.confirmed",
                serde_json::json!({
                    "id": updated.id,
                    "confidence": updated.confidence,
                    "user_confirmed": updated.user_confirmed,
                }),
            )
        );

        Ok(updated)
    }

    /// Search active memories by keyword query.
    pub async fn search(&self, query: &str) -> Result<Vec<MemoryItemRecord>> {
        self.storage
            .search_memory_items(query)
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))
    }

    /// List memories with optional category or status filters.
    pub async fn list(&self, category: Option<&str>, status: Option<&str>) -> Result<Vec<MemoryItemRecord>> {
        self.storage
            .list_memory_items(category, status)
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))
    }

    /// Formats accepted and user-confirmed memories for dynamic prompt context injection.
    pub async fn get_context_for_prompt(&self, max_items: usize) -> Result<String> {
        let active_items = self
            .storage
            .list_memory_items(Some("semantic"), Some("active"))
            .await
            .map_err(|e| MemoryError::Storage(e.to_string()))?;

        if active_items.is_empty() {
            return Ok(String::new());
        }

        let mut output = String::new();
        for item in active_items.into_iter().take(max_items) {
            // Provenance rules: Only state firm facts if explicit or user confirmed
            if item.provenance == "explicit" || item.user_confirmed {
                output.push_str(&format!("- {}\n", item.content));
            } else if item.provenance == "inferred" {
                output.push_str(&format!("- (Inferred): {}\n", item.content));
            }
        }

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_memory_service_semantic_and_confirmation() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let mut rx = event_bus.subscribe();
        let service = MemoryService::new(storage, event_bus);

        // 1. Record inferred fact
        let item = service
            .record_semantic_fact(
                "Prefers Rust over C++ for systems programming",
                None,
                Provenance::Inferred,
                0.75,
                0.8,
            )
            .await
            .unwrap();
        assert_eq!(item.category, "semantic");
        assert_eq!(item.provenance, "inferred");
        assert!(!item.user_confirmed);

        let event = rx.recv().await.unwrap();
        assert_eq!(event.kind, "memory.written");

        // 2. Check context formatting before confirmation (marked as Inferred)
        let ctx = service.get_context_for_prompt(5).await.unwrap();
        assert!(ctx.contains("(Inferred): Prefers Rust over C++"));

        // 3. Confirm fact
        let confirmed = service.confirm_memory(&item.id).await.unwrap();
        assert!(confirmed.user_confirmed);
        assert_eq!(confirmed.confidence, 0.95);

        // 4. Check context formatting after confirmation (stated directly as fact)
        let ctx_after = service.get_context_for_prompt(5).await.unwrap();
        assert!(ctx_after.contains("- Prefers Rust over C++"));
        assert!(!ctx_after.contains("(Inferred)"));
    }

    #[tokio::test]
    async fn test_working_context_with_ttl() {
        let storage = Storage::open_in_memory().unwrap();
        let event_bus = EventBus::new(16);
        let service = MemoryService::new(storage, event_bus);

        let item = service
            .record_working_context("task-abc", "Working on Phase 7 Persistent Memory", 3600)
            .await
            .unwrap();

        assert_eq!(item.category, "working");
        assert!(item.expires_at.is_some());
    }
}
