# EDITH — Database Design

Companion: [MEMORY](EDITH_MEMORY_ARCHITECTURE.md) · [AGENT_ORCHESTRATION](EDITH_AGENT_ORCHESTRATION_DESIGN.md) · [TECHNOLOGY_DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md) D5

## 1. Choice

SQLite in WAL mode, accessed through `sqlx` with embedded migrations. Reasons: local-first single-user system; transactional guarantees for event logs; zero operations; widely understood backups. Storage is behind repository traits so PostgreSQL can be added if a multi-device or server mode is ever designed (not in v1).

Engine constraints:

- `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`
- One writer task, with writes serialised through a bounded channel; read connections pooled (size 4).
- Database file mode `0600`; directory `0700`.

## 2. Logical areas

| Area | Tables | Written by |
|------|--------|------------|
| Conversation | `sessions`, `turns`, `turn_parts` | Conversation manager |
| Tasks | `tasks`, `subtasks`, `task_events`, `checkpoints`, `artifacts` | Orchestrator |
| Routing | `route_decisions`, `provider_health_samples` | Router |
| Memory | `memory_items`, `memory_sources`, `memory_links`, `memory_versions`, `memory_review_queue`, `memory_embeddings` | Memory engine |
| Capabilities | `capability_sources`, `capabilities`, `mcp_servers`, `mcp_calls`, `skills`, `skill_versions` | MCP runtime, skill registry |
| Policy | `policy_rules`, `policy_decisions`, `approvals`, `audit_events` | Policy engine |
| Search | `search_queries`, `search_results`, `documents`, `document_spans`, `evidence` | Search subsystem |
| Context | `context_snapshots`, `context_sources` | Context acquisition |
| Voice | `voice_sessions`, `asr_segments` (text only) | Voice engine |
| Observability | `metrics_rollups`, `errors` | Observability |
| Meta | `schema_migrations`, `settings`, `secret_refs` (names only) | Daemon |

## 3. Core schema (abbreviated DDL)

```sql
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,           -- UUID v7
  session_id    TEXT REFERENCES sessions(id),
  origin        TEXT NOT NULL CHECK (origin IN ('text','voice','schedule','api')),
  objective     TEXT NOT NULL,
  state         TEXT NOT NULL,              -- TaskState
  priority      TEXT NOT NULL CHECK (priority IN ('interactive','background','idle')),
  verification  TEXT NOT NULL CHECK (verification IN ('mechanical','evidence','user-confirmed','none-declared')),
  budget_json   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  finished_at   TEXT,
  outcome       TEXT CHECK (outcome IN ('completed','failed','cancelled') OR outcome IS NULL),
  trace_id      TEXT NOT NULL
);

CREATE TABLE task_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,   -- global order
  id         TEXT NOT NULL UNIQUE,
  task_id    TEXT NOT NULL REFERENCES tasks(id),
  kind       TEXT NOT NULL,                       -- e.g. state_changed, step_started, tool_called
  payload    TEXT NOT NULL,                       -- JSON, redacted
  at         TEXT NOT NULL,
  trace_id   TEXT NOT NULL
);
CREATE INDEX task_events_task ON task_events(task_id, seq);

CREATE TABLE subtasks (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  capability   TEXT,                            -- capability id if applicable
  state        TEXT NOT NULL,
  depends_on   TEXT NOT NULL DEFAULT '[]',      -- JSON array of subtask ids
  attempt      INTEGER NOT NULL DEFAULT 1,
  route_id     TEXT REFERENCES route_decisions(id),
  started_at   TEXT, finished_at TEXT,
  error_code   TEXT
);

CREATE TABLE route_decisions (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  subtask_id   TEXT REFERENCES subtasks(id),
  tier         TEXT NOT NULL CHECK (tier IN ('T0','T1','T2','T3','T4')),
  provider     TEXT NOT NULL,
  model        TEXT,
  data_class   TEXT NOT NULL CHECK (data_class IN ('Public','Personal','Project','Secret')),
  reason       TEXT NOT NULL,
  fallbacks    TEXT NOT NULL DEFAULT '[]',
  latency_json TEXT,
  outcome      TEXT NOT NULL,
  at           TEXT NOT NULL
);

CREATE TABLE memory_items (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL CHECK (category IN ('episodic','semantic','procedural','working')),
  content       TEXT NOT NULL,
  structured    TEXT,
  provenance    TEXT NOT NULL CHECK (provenance IN ('explicit','inferred','temporary','assumption','outdated')),
  confidence    REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  importance    REAL NOT NULL DEFAULT 0.5,
  user_confirmed INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL CHECK (status IN ('active','pending_review','superseded','expired','deleted')),
  superseded_by TEXT REFERENCES memory_items(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  expires_at    TEXT,
  content_hash  TEXT NOT NULL
);
CREATE INDEX memory_status ON memory_items(status, category);
CREATE VIRTUAL TABLE memory_fts USING fts5(content, content='memory_items', content_rowid='rowid');

CREATE TABLE memory_sources (
  memory_id  TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,                    -- turn | task | file | url | user_edit
  source_ref TEXT NOT NULL,
  PRIMARY KEY (memory_id, source_kind, source_ref)
);

CREATE TABLE policy_decisions (
  id          TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  capability  TEXT NOT NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('allow','confirm','deny')),
  rule_id     TEXT,
  reason      TEXT NOT NULL,
  task_id     TEXT REFERENCES tasks(id),
  at          TEXT NOT NULL
);

CREATE TABLE audit_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref_id     TEXT,
  summary    TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL                    -- SHA-256 over (prev_hash || canonical row)
);
```

Remaining tables follow the same conventions: text UUID v7 primary keys, ISO-8601 UTC timestamps, JSON columns validated in code, `CHECK` constraints on enums.

## 4. Indexes and query patterns

| Query | Index |
|-------|-------|
| Tasks by state (activity center) | `tasks(state, updated_at)` |
| Events for a task (timeline) | `task_events(task_id, seq)` |
| Memory by category and status | `memory_items(status, category)` |
| Full-text memory search | `memory_fts` |
| Route stats for dashboard | `route_decisions(at, tier)` |
| Audit by time | `audit_events(at)` |

## 5. Event sourcing usage

- `task_events` is the source of truth for task history. Current state in `tasks.state` is a projection, updated in the same transaction as the event.
- Replay: on restart, in-flight tasks are rebuilt from events and the last checkpoint.
- Retention: events kept 180 days by default; summarised into `tasks` rows before pruning.

## 6. Migrations

- Embedded SQL migrations numbered `0001_…`. Each migration is transactional and idempotent in tests.
- Before any migration, the daemon copies the database to `edith.db.bak-<version>` and verifies integrity (`PRAGMA integrity_check`).
- A failed migration leaves the backup in place and refuses to start with a clear error.

## 7. Backup

- Hourly online backup via the SQLite backup API to `$XDG_DATA_HOME/edith/backups/`, keeping 7 daily and 4 weekly copies.
- Backups are encrypted if database encryption is enabled.

## 8. Vector storage

- `memory_embeddings(memory_id, model_id, dim, vector BLOB)` as the baseline.
- Preferred: sqlite-vec virtual table for approximate search, if verified and stable at implementation time (decision D5). Fallback: brute-force cosine over a contiguous in-memory matrix loaded at startup and updated incrementally.
- Embedding model ID stored per row; changing the model triggers a background re-embed job.

## 9. Storage budget

| Data | Expected size (1 year, heavy use) |
|------|-----------------------------------|
| Task events | 200–500 MB |
| Memory items and embeddings | 50–200 MB |
| Search documents and spans | up to 2 GB (capped; LRU) |
| Audit | 20–50 MB |

Document cache lives in a separate file (`cache.db`) so it can be deleted without touching memory or audit.

## 10. Data retention and deletion

- Owner-initiated deletion of a task removes its events, subtasks and artefacts; audit rows remain with the `ref_id` nulled and summary redacted.
- Memory deletion follows §4.5 of [MEMORY](EDITH_MEMORY_ARCHITECTURE.md).
- A "forget everything" command clears all tables except `audit_events` (which is kept with a single "data reset" entry) and schema metadata.

## 11. Testing

- Migration tests from every released schema version.
- Property tests on event replay producing the same projection.
- Concurrency tests: many readers while the writer commits; no `SQLITE_BUSY` surfaced to callers under load tests.
- Corruption drill: truncated file triggers restore from backup.
