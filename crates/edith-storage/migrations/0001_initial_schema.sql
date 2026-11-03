-- EDITH 2.0 Core Schema (Initial Migration 0001)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    route_id    TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    session_id    TEXT REFERENCES sessions(id),
    origin        TEXT NOT NULL CHECK (origin IN ('text', 'voice', 'schedule', 'api')),
    objective     TEXT NOT NULL,
    state         TEXT NOT NULL,
    priority      TEXT NOT NULL CHECK (priority IN ('interactive', 'background', 'idle')),
    verification  TEXT NOT NULL CHECK (verification IN ('mechanical', 'evidence', 'user-confirmed', 'none-declared')),
    budget_json   TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    finished_at   TEXT,
    outcome       TEXT CHECK (outcome IN ('completed', 'failed', 'cancelled') OR outcome IS NULL),
    trace_id      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);

CREATE TABLE IF NOT EXISTS task_events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    id         TEXT NOT NULL UNIQUE,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    at         TEXT NOT NULL,
    trace_id   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, seq);

CREATE TABLE IF NOT EXISTS route_decisions (
    id           TEXT PRIMARY KEY,
    task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    subtask_id   TEXT,
    tier         TEXT NOT NULL CHECK (tier IN ('T0', 'T1', 'T2', 'T3', 'T4')),
    provider     TEXT NOT NULL,
    model        TEXT,
    data_class   TEXT NOT NULL CHECK (data_class IN ('Public', 'Personal', 'Project', 'Secret')),
    reason       TEXT NOT NULL,
    fallbacks    TEXT NOT NULL DEFAULT '[]',
    latency_json TEXT,
    outcome      TEXT NOT NULL,
    at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_items (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL CHECK (category IN ('episodic', 'semantic', 'procedural', 'working')),
    content         TEXT NOT NULL,
    structured      TEXT,
    provenance      TEXT NOT NULL CHECK (provenance IN ('explicit', 'inferred', 'temporary', 'assumption', 'outdated')),
    confidence      REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
    importance      REAL NOT NULL DEFAULT 0.5,
    user_confirmed  INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL CHECK (status IN ('active', 'pending_review', 'superseded', 'expired', 'deleted')),
    superseded_by   TEXT REFERENCES memory_items(id),
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_category_status ON memory_items(category, status);

CREATE TABLE IF NOT EXISTS settings (
    section         TEXT PRIMARY KEY,
    payload_json    TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
