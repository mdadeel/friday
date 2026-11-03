use chrono::Utc;
use edith_core::{EdithError, Id, Result, TaskOrigin, TaskPriority, VerificationMode};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use tracing::info;

pub const MIGRATION_0001: &str = include_str!("../migrations/0001_initial_schema.sql");
pub const MIGRATION_0002: &str = include_str!("../migrations/0002_add_thinking_to_turns.sql");

#[derive(Clone)]
pub struct Storage {
    pool: Pool<SqliteConnectionManager>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    pub session_id: Option<String>,
    pub origin: String,
    pub objective: String,
    pub state: String,
    pub priority: String,
    pub verification: String,
    pub budget_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
    pub trace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEventRecord {
    pub seq: i64,
    pub id: String,
    pub task_id: String,
    pub kind: String,
    pub payload: Value,
    pub at: String,
    pub trace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDecisionRecord {
    pub id: String,
    pub task_id: String,
    pub subtask_id: Option<String>,
    pub tier: String,
    pub provider: String,
    pub model: Option<String>,
    pub data_class: String,
    pub reason: String,
    pub fallbacks: String,
    pub latency_json: Option<String>,
    pub outcome: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnRecord {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub route_id: Option<String>,
    pub created_at: String,
}

impl Storage {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        let manager = SqliteConnectionManager::file(path).with_init(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )
        });

        let pool = Pool::builder()
            .max_size(4)
            .build(manager)
            .map_err(|e| EdithError::Storage(format!("Failed to build connection pool: {e}")))?;

        let storage = Self { pool };
        storage.migrate()?;
        Ok(storage)
    }

    pub fn open_in_memory() -> Result<Self> {
        let manager = SqliteConnectionManager::memory().with_init(|conn| {
            conn.execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )
        });

        let pool = Pool::builder()
            .max_size(1)
            .build(manager)
            .map_err(|e| EdithError::Storage(format!("Failed to build memory pool: {e}")))?;

        let storage = Self { pool };
        storage.migrate()?;
        Ok(storage)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self
            .pool
            .get()
            .map_err(|e| EdithError::Storage(format!("DB pool error: {e}")))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version     INTEGER PRIMARY KEY,
                name        TEXT NOT NULL,
                applied_at  TEXT NOT NULL
            );",
        )
        .map_err(|e| EdithError::Storage(format!("Failed to create schema_migrations: {e}")))?;

        let mut stmt = conn
            .prepare("SELECT version FROM schema_migrations")
            .map_err(|e| EdithError::Storage(e.to_string()))?;

        let applied_versions: std::collections::HashSet<i32> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| EdithError::Storage(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        if !applied_versions.contains(&1) {
            conn.execute_batch(MIGRATION_0001)
                .map_err(|e| EdithError::Storage(format!("Failed to execute migration 0001: {e}")))?;
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![1, "0001_initial_schema", Utc::now().to_rfc3339()],
            )
            .map_err(|e| EdithError::Storage(format!("Failed to record migration 0001: {e}")))?;
        }

        if !applied_versions.contains(&2) {
            conn.execute_batch(MIGRATION_0002)
                .map_err(|e| EdithError::Storage(format!("Failed to execute migration 0002: {e}")))?;
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![2, "0002_add_thinking_to_turns", Utc::now().to_rfc3339()],
            )
            .map_err(|e| EdithError::Storage(format!("Failed to record migration 0002: {e}")))?;
        }

        info!("Storage migrations completed successfully");
        Ok(())
    }

    // --- Sessions Repository ---

    pub async fn create_session(&self, title: &str) -> Result<SessionRecord> {
        let pool = self.pool.clone();
        let title = title.to_string();
        let session_id = Id::new().to_string();
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![session_id, title, now, now],
            )
            .map_err(|e| EdithError::Storage(format!("Insert session error: {e}")))?;

            Ok(SessionRecord {
                id: session_id,
                title,
                created_at: now.clone(),
                updated_at: now,
            })
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn list_sessions(&self) -> Result<Vec<SessionRecord>> {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare("SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let rows = stmt
                .query_map([], |row| {
                    Ok(SessionRecord {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        created_at: row.get(2)?,
                        updated_at: row.get(3)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut sessions = Vec::new();
            for session in rows {
                sessions.push(session.map_err(|e| EdithError::Storage(e.to_string()))?);
            }
            Ok(sessions)
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<SessionRecord>> {
        let pool = self.pool.clone();
        let id = id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare("SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?1")
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut rows = stmt
                .query_map(params![id], |row| {
                    Ok(SessionRecord {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        created_at: row.get(2)?,
                        updated_at: row.get(3)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            if let Some(session) = rows.next() {
                Ok(Some(session.map_err(|e| EdithError::Storage(e.to_string()))?))
            } else {
                Ok(None)
            }
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn update_session_title(&self, id: &str, title: &str) -> Result<()> {
        let pool = self.pool.clone();
        let id = id.to_string();
        let title = title.to_string();
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, id],
            )
            .map_err(|e| EdithError::Storage(format!("Update session title error: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn delete_session(&self, id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let id = id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute("DELETE FROM turns WHERE session_id = ?1", params![id])
                .map_err(|e| EdithError::Storage(format!("Delete session turns error: {e}")))?;
            conn.execute("UPDATE tasks SET session_id = NULL WHERE session_id = ?1", params![id])
                .map_err(|e| EdithError::Storage(format!("Unlink session tasks error: {e}")))?;
            conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
                .map_err(|e| EdithError::Storage(format!("Delete session error: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    // --- Turns Repository ---

    pub async fn append_turn(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        thinking: Option<&str>,
        route_id: Option<&str>,
    ) -> Result<TurnRecord> {
        let pool = self.pool.clone();
        let turn_id = Id::new().to_string();
        let session_id = session_id.to_string();
        let role = role.to_string();
        let content = content.to_string();
        let thinking = thinking.map(|s| s.to_string());
        let route_id = route_id.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "INSERT INTO turns (id, session_id, role, content, thinking, route_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![turn_id, session_id, role, content, thinking, route_id, now],
            )
            .map_err(|e| EdithError::Storage(format!("Insert turn error: {e}")))?;

            conn.execute(
                "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
                params![now, session_id],
            )
            .map_err(|e| EdithError::Storage(format!("Update session timestamp error: {e}")))?;

            Ok(TurnRecord {
                id: turn_id,
                session_id,
                role,
                content,
                thinking,
                route_id,
                created_at: now,
            })
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn get_turn(&self, turn_id: &str) -> Result<Option<TurnRecord>> {
        let pool = self.pool.clone();
        let turn_id = turn_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare("SELECT id, session_id, role, content, thinking, route_id, created_at FROM turns WHERE id = ?1")
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut rows = stmt
                .query_map(params![turn_id], |row| {
                    Ok(TurnRecord {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        thinking: row.get(4)?,
                        route_id: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            if let Some(turn) = rows.next() {
                Ok(Some(turn.map_err(|e| EdithError::Storage(e.to_string()))?))
            } else {
                Ok(None)
            }
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn update_turn(&self, turn_id: &str, content: &str) -> Result<()> {
        let pool = self.pool.clone();
        let turn_id = turn_id.to_string();
        let content = content.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "UPDATE turns SET content = ?1 WHERE id = ?2",
                params![content, turn_id],
            )
            .map_err(|e| EdithError::Storage(format!("Update turn error: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn delete_turn(&self, turn_id: &str) -> Result<()> {
        let pool = self.pool.clone();
        let turn_id = turn_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute("DELETE FROM turns WHERE id = ?1", params![turn_id])
                .map_err(|e| EdithError::Storage(format!("Delete turn error: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn list_turns(&self, session_id: &str) -> Result<Vec<TurnRecord>> {
        let pool = self.pool.clone();
        let session_id = session_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare("SELECT id, session_id, role, content, thinking, route_id, created_at FROM turns WHERE session_id = ?1 ORDER BY created_at ASC")
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let rows = stmt
                .query_map(params![session_id], |row| {
                    Ok(TurnRecord {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        thinking: row.get(4)?,
                        route_id: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut turns = Vec::new();
            for turn in rows {
                turns.push(turn.map_err(|e| EdithError::Storage(e.to_string()))?);
            }
            Ok(turns)
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn update_task_state(
        &self,
        task_id: &str,
        state: &str,
        outcome: Option<&str>,
    ) -> Result<()> {
        let pool = self.pool.clone();
        let task_id = task_id.to_string();
        let state = state.to_string();
        let outcome = outcome.map(|s| s.to_string());
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            if outcome.is_some() {
                conn.execute(
                    "UPDATE tasks SET state = ?1, outcome = ?2, updated_at = ?3, finished_at = ?4 WHERE id = ?5",
                    params![state, outcome, now, now, task_id],
                )
            } else {
                conn.execute(
                    "UPDATE tasks SET state = ?1, updated_at = ?2 WHERE id = ?3",
                    params![state, now, task_id],
                )
            }
            .map_err(|e| EdithError::Storage(format!("Update task state error: {e}")))?;
            Ok(())
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    // --- Tasks Repository ---

    pub async fn create_task(
        &self,
        session_id: Option<&str>,
        origin: TaskOrigin,
        objective: &str,
        priority: TaskPriority,
        verification: VerificationMode,
        trace_id: &str,
    ) -> Result<TaskRecord> {
        let pool = self.pool.clone();
        let task_id = Id::new().to_string();
        let session_id = session_id.map(|s| s.to_string());
        let origin_str = serde_json::to_string(&origin).unwrap().trim_matches('"').to_string();
        let objective = objective.to_string();
        let state_str = "discovered".to_string();
        let priority_str = serde_json::to_string(&priority).unwrap().trim_matches('"').to_string();
        let verification_str = match verification {
            VerificationMode::Mechanical => "mechanical",
            VerificationMode::Evidence => "evidence",
            VerificationMode::UserConfirmed => "user-confirmed",
            VerificationMode::NoneDeclared => "none-declared",
        }
        .to_string();
        let now = Utc::now().to_rfc3339();
        let trace_id = trace_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "INSERT INTO tasks (id, session_id, origin, objective, state, priority, verification, budget_json, created_at, updated_at, trace_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '{}', ?8, ?9, ?10)",
                params![task_id, session_id, origin_str, objective, state_str, priority_str, verification_str, now, now, trace_id],
            )
            .map_err(|e| EdithError::Storage(format!("Insert task error: {e}")))?;

            Ok(TaskRecord {
                id: task_id,
                session_id,
                origin: origin_str,
                objective,
                state: state_str,
                priority: priority_str,
                verification: verification_str,
                budget_json: "{}".to_string(),
                created_at: now.clone(),
                updated_at: now,
                finished_at: None,
                outcome: None,
                trace_id,
            })
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn get_task(&self, task_id: &str) -> Result<Option<TaskRecord>> {
        let pool = self.pool.clone();
        let task_id = task_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, session_id, origin, objective, state, priority, verification, budget_json, created_at, updated_at, finished_at, outcome, trace_id
                     FROM tasks WHERE id = ?1",
                )
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut rows = stmt
                .query_map(params![task_id], |row| {
                    Ok(TaskRecord {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        origin: row.get(2)?,
                        objective: row.get(3)?,
                        state: row.get(4)?,
                        priority: row.get(5)?,
                        verification: row.get(6)?,
                        budget_json: row.get(7)?,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                        finished_at: row.get(10)?,
                        outcome: row.get(11)?,
                        trace_id: row.get(12)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            if let Some(task) = rows.next() {
                Ok(Some(task.map_err(|e| EdithError::Storage(e.to_string()))?))
            } else {
                Ok(None)
            }
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn list_tasks(&self, limit: usize) -> Result<Vec<TaskRecord>> {
        let pool = self.pool.clone();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, session_id, origin, objective, state, priority, verification, budget_json, created_at, updated_at, finished_at, outcome, trace_id
                     FROM tasks ORDER BY updated_at DESC LIMIT ?1",
                )
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let rows = stmt
                .query_map(params![limit as i64], |row| {
                    Ok(TaskRecord {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        origin: row.get(2)?,
                        objective: row.get(3)?,
                        state: row.get(4)?,
                        priority: row.get(5)?,
                        verification: row.get(6)?,
                        budget_json: row.get(7)?,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                        finished_at: row.get(10)?,
                        outcome: row.get(11)?,
                        trace_id: row.get(12)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut tasks = Vec::new();
            for task in rows {
                tasks.push(task.map_err(|e| EdithError::Storage(e.to_string()))?);
            }
            Ok(tasks)
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn record_task_event(
        &self,
        task_id: &str,
        kind: &str,
        payload: Value,
        trace_id: &str,
    ) -> Result<TaskEventRecord> {
        let pool = self.pool.clone();
        let event_id = Id::new().to_string();
        let task_id = task_id.to_string();
        let kind = kind.to_string();
        let payload_str = serde_json::to_string(&payload).unwrap();
        let now = Utc::now().to_rfc3339();
        let trace_id = trace_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "INSERT INTO task_events (id, task_id, kind, payload, at, trace_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![event_id, task_id, kind, payload_str, now, trace_id],
            )
            .map_err(|e| EdithError::Storage(format!("Insert task_event error: {e}")))?;

            let seq = conn.last_insert_rowid();

            Ok(TaskEventRecord {
                seq,
                id: event_id,
                task_id,
                kind,
                payload,
                at: now,
                trace_id,
            })
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    // --- Route Decisions Repository ---

    pub async fn record_route_decision(
        &self,
        task_id: &str,
        subtask_id: Option<&str>,
        tier: &str,
        provider: &str,
        model: Option<&str>,
        data_class: &str,
        reason: &str,
        fallbacks: &str,
        outcome: &str,
    ) -> Result<RouteDecisionRecord> {
        let pool = self.pool.clone();
        let id = Id::new().to_string();
        let task_id = task_id.to_string();
        let subtask_id = subtask_id.map(|s| s.to_string());
        let tier = tier.to_string();
        let provider = provider.to_string();
        let model = model.map(|s| s.to_string());
        let data_class = data_class.to_string();
        let reason = reason.to_string();
        let fallbacks = fallbacks.to_string();
        let outcome = outcome.to_string();
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            conn.execute(
                "INSERT INTO route_decisions (id, task_id, subtask_id, tier, provider, model, data_class, reason, fallbacks, latency_json, outcome, at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{}', ?10, ?11)",
                params![id, task_id, subtask_id, tier, provider, model, data_class, reason, fallbacks, outcome, now],
            )
            .map_err(|e| EdithError::Storage(format!("Insert route_decision error: {e}")))?;

            Ok(RouteDecisionRecord {
                id,
                task_id,
                subtask_id,
                tier,
                provider,
                model,
                data_class,
                reason,
                fallbacks,
                latency_json: Some("{}".to_string()),
                outcome,
                at: now,
            })
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }

    pub async fn list_route_decisions(&self, task_id: &str) -> Result<Vec<RouteDecisionRecord>> {
        let pool = self.pool.clone();
        let task_id = task_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = pool
                .get()
                .map_err(|e| EdithError::Storage(format!("Pool error: {e}")))?;
            let mut stmt = conn
                .prepare(
                    "SELECT id, task_id, subtask_id, tier, provider, model, data_class, reason, fallbacks, latency_json, outcome, at
                     FROM route_decisions WHERE task_id = ?1 ORDER BY at ASC",
                )
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let rows = stmt
                .query_map(params![task_id], |row| {
                    Ok(RouteDecisionRecord {
                        id: row.get(0)?,
                        task_id: row.get(1)?,
                        subtask_id: row.get(2)?,
                        tier: row.get(3)?,
                        provider: row.get(4)?,
                        model: row.get(5)?,
                        data_class: row.get(6)?,
                        reason: row.get(7)?,
                        fallbacks: row.get(8)?,
                        latency_json: row.get(9)?,
                        outcome: row.get(10)?,
                        at: row.get(11)?,
                    })
                })
                .map_err(|e| EdithError::Storage(e.to_string()))?;

            let mut list = Vec::new();
            for r in rows {
                list.push(r.map_err(|e| EdithError::Storage(e.to_string()))?);
            }
            Ok(list)
        })
        .await
        .map_err(|e| EdithError::Internal(e.to_string()))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_storage_lifecycle_in_memory() {
        let storage = Storage::open_in_memory().unwrap();

        // 1. Sessions and turns
        let session = storage.create_session("Test Session").await.unwrap();
        assert_eq!(session.title, "Test Session");

        let turn = storage
            .append_turn(&session.id, "user", "Hello EDITH", Some("Thinking about greeting"), None)
            .await
            .unwrap();
        assert_eq!(turn.content, "Hello EDITH");
        assert_eq!(turn.thinking.as_deref(), Some("Thinking about greeting"));

        let turns = storage.list_turns(&session.id).await.unwrap();
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].content, "Hello EDITH");

        // 2. Turn editing & retrieval
        storage.update_turn(&turn.id, "Hello EDITH 2.0").await.unwrap();
        let updated_turn = storage.get_turn(&turn.id).await.unwrap().unwrap();
        assert_eq!(updated_turn.content, "Hello EDITH 2.0");

        // 3. Session updates & retrieval
        storage.update_session_title(&session.id, "Updated Briefing").await.unwrap();
        let fetched_session = storage.get_session(&session.id).await.unwrap().unwrap();
        assert_eq!(fetched_session.title, "Updated Briefing");

        // 4. Tasks and task events
        let task = storage
            .create_task(
                Some(&session.id),
                TaskOrigin::Text,
                "Audit system files",
                TaskPriority::Interactive,
                VerificationMode::Mechanical,
                "trace-001",
            )
            .await
            .unwrap();
        assert_eq!(task.objective, "Audit system files");
        assert_eq!(task.state, "discovered");

        storage.update_task_state(&task.id, "completed", Some("completed")).await.unwrap();
        let completed_task = storage.get_task(&task.id).await.unwrap().unwrap();
        assert_eq!(completed_task.state, "completed");
        assert_eq!(completed_task.outcome.as_deref(), Some("completed"));

        let fetched = storage.get_task(&task.id).await.unwrap().unwrap();
        assert_eq!(fetched.id, task.id);

        let event = storage
            .record_task_event(
                &task.id,
                "task.state_changed",
                serde_json::json!({"from": "discovered", "to": "planning"}),
                "trace-001",
            )
            .await
            .unwrap();
        assert_eq!(event.kind, "task.state_changed");
        assert_eq!(event.seq, 1);

        // 5. Deletion
        storage.delete_turn(&turn.id).await.unwrap();
        assert!(storage.get_turn(&turn.id).await.unwrap().is_none());

        storage.delete_session(&session.id).await.unwrap();
        assert!(storage.get_session(&session.id).await.unwrap().is_none());
    }
}
