use chrono::{DateTime, Utc};
use edith_core::Id;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::broadcast::{self, Receiver, Sender};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: Id,
    pub at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
    pub kind: String,
    pub payload: Value,
}

impl EventEnvelope {
    pub fn new(kind: impl Into<String>, payload: Value) -> Self {
        Self {
            id: Id::new(),
            at: Utc::now(),
            trace: None,
            task: None,
            kind: kind.into(),
            payload,
        }
    }

    pub fn with_task(mut self, task_id: impl Into<String>) -> Self {
        self.task = Some(task_id.into());
        self
    }

    pub fn with_trace(mut self, trace_id: impl Into<String>) -> Self {
        self.trace = Some(trace_id.into());
        self
    }
}

#[derive(Clone)]
pub struct EventBus {
    sender: Arc<Sender<EventEnvelope>>,
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender: Arc::new(sender),
        }
    }

    pub fn publish(&self, event: EventEnvelope) {
        // If there are no receivers, send returns an Err which we safely ignore
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> Receiver<EventEnvelope> {
        self.sender.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_publish_and_receive_event() {
        let bus = EventBus::new(16);
        let mut rx = bus.subscribe();

        let event = EventEnvelope::new("task.created", serde_json::json!({"objective": "test"}))
            .with_task("task-123");

        bus.publish(event.clone());

        let received = rx.recv().await.unwrap();
        assert_eq!(received.kind, "task.created");
        assert_eq!(received.task.as_deref(), Some("task-123"));
        assert_eq!(received.payload["objective"], "test");
    }

    #[tokio::test]
    async fn test_lagged_receiver() {
        let bus = EventBus::new(2);
        let mut rx = bus.subscribe();

        bus.publish(EventEnvelope::new("e1", Value::Null));
        bus.publish(EventEnvelope::new("e2", Value::Null));
        bus.publish(EventEnvelope::new("e3", Value::Null)); // causes lag on capacity 2

        match rx.recv().await {
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                assert!(missed > 0);
            }
            other => panic!("Expected lagged error, got {other:?}"),
        }
    }
}
