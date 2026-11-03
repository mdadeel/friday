-- Migration 0003: Memory Enhancements (updated_at, expires_at, content_hash, memory_sources)

ALTER TABLE memory_items ADD COLUMN updated_at TEXT;
ALTER TABLE memory_items ADD COLUMN expires_at TEXT;
ALTER TABLE memory_items ADD COLUMN content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_memory_hash ON memory_items(content_hash);

CREATE TABLE IF NOT EXISTS memory_sources (
    memory_id   TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL,
    source_ref  TEXT NOT NULL,
    PRIMARY KEY (memory_id, source_kind, source_ref)
);
