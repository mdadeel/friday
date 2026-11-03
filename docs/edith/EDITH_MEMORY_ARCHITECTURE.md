# EDITH — Memory Architecture

Companion: [DATABASE_DESIGN](EDITH_DATABASE_DESIGN.md) · [SECURITY](EDITH_SECURITY_AND_AUTONOMY_POLICY.md) §8 · [RESEARCH](EDITH_RESEARCH_AND_COMPETITOR_ANALYSIS.md) §2.1

## 1. Purpose

EDITH must keep coherent knowledge across conversations and tasks. Memory is **not** a transcript that is resent to a model. It is a structured store with types, provenance, confidence and lifecycle. Memory is independent of model weights (principle P5): the same memory works with any model.

Design influences: Letta/MemGPT's tiers (core, recall, archival) — adopted in concept; the specification's four categories; the user's requirement that inferred facts are never presented as confirmed.

## 2. Memory categories

| Category | Holds | Lifetime | Example |
|----------|-------|----------|---------|
| Episodic | Meaningful events: conversations, tasks, decisions, outcomes | Long; decays in retrieval rank, not deleted | "On 2026-10-28 we chose rmcp for the MCP host." |
| Semantic | Stable facts, preferences, relationships, knowledge | Until contradicted or deleted | "Owner's timezone is Asia/Dhaka." |
| Procedural | Successful workflows and strategies | Until superseded | "For Rust repos: run `cargo test` then `cargo clippy`." |
| Working | Current task context and temporary objectives | Task lifetime + TTL (default 24 h) | "Current objective: compare MCP SDKs." |

## 3. Provenance and confidence

Every memory item carries:

```rust
pub struct MemoryItem {
    pub id: MemoryId,
    pub category: MemoryCategory,        // Episodic | Semantic | Procedural | Working
    pub content: String,                 // short, normalised statement
    pub structured: Option<Json>,        // optional typed payload (entity, attribute, value)
    pub provenance: Provenance,          // Explicit | Inferred | Temporary | Assumption | Outdated
    pub confidence: f32,                 // 0..1, meaning depends on provenance (see below)
    pub sources: Vec<SourceRef>,         // conversation turn ids, task ids, files, URLs
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub status: MemoryStatus,            // Active | PendingReview | Superseded(by) | Expired | Deleted
    pub importance: f32,                 // 0..1, computed (section 6)
    pub user_confirmed: bool,
    pub embedding_ref: Option<EmbeddingId>,
}
```

Provenance meanings and rules:

| Provenance | Meaning | Confidence rule | May be stated to the user as fact? |
|------------|---------|-----------------|-------------------------------------|
| `Explicit` | The owner stated it directly | Starts at 0.9 | Yes |
| `Inferred` | Derived from repeated behaviour or indirect evidence | Starts at 0.4–0.7 by evidence count; never above 0.8 without confirmation | Only with hedging ("it seems you…") unless confirmed |
| `Temporary` | Relevant for a short time | Fixed by TTL | Only within its validity window |
| `Assumption` | EDITH's working assumption, not evidenced | ≤ 0.5 | No; shown as an assumption |
| `Outdated` | Was true, has been superseded or is past its validity | Frozen | No; kept for history |

A user confirmation sets `user_confirmed = true`, raises confidence to ≥ 0.95, and changes `Inferred` to `Explicit` with the confirmation turn as source.

## 4. Lifecycle

### 4.1 Extraction

- Runs after each completed turn and task, as a background job.
- Extractor is Tier 1 (small model) with a strict JSON schema; fallback is rules (for example explicit patterns "my name is", "I prefer", "remember that").
- Extractor outputs **candidates**, never direct writes. Candidates pass the write gate.

### 4.2 Write gate

1. Schema valid and content length within bounds.
2. Not sensitive: `DataClass::Secret` detection (regex and entropy checks) → reject. Passwords, tokens, private keys are never stored.
3. Deduplication: near-duplicate (cosine ≥ 0.92 or normalised string match) merges into the existing item and raises confidence by evidence, without duplicating.
4. Contradiction check (section 5).
5. Write with provenance and sources; emit `MemoryWritten` event.

### 4.3 Procedural candidates

A procedure becomes a candidate only when: the task completed with a passing verification, the same step pattern has succeeded at least twice, and the owner has not rejected it. Candidates appear in the review queue before activation.

### 4.4 Consolidation (background, idle)

- Merges episodic events of the same project into summaries with links to originals.
- Promotes repeated episodic facts to semantic `Inferred` candidates.
- Recomputes importance and decays unused working memory.
- Never rewrites an `Explicit` item without a user action.

### 4.5 Expiration and forgetting

- Working memory expires by TTL.
- Temporary items expire at `expires_at`.
- Inferred items with no supporting evidence for 180 days move to `PendingReview` (not deleted).
- Owner deletion is a hard delete from active stores and an entry in the audit log with the item's hash only. Vector index entries are removed in the same transaction where possible, and the index is compacted nightly.

## 5. Contradiction detection

- Facts are compared by (subject, attribute) when structured; otherwise by embedding similarity above 0.85 combined with a negation or value-change heuristic.
- Rules: an `Explicit` new statement supersedes an `Inferred` or `Assumption` item automatically (old item → `Superseded`). Two conflicting `Explicit` items go to `PendingReview` with both shown.
- EDITH never answers from a contested item without flagging it.

## 6. Retrieval and ranking

Retrieval is requested by the orchestrator, not by the model by default. The model may request `memory.search` through a tool when it needs more context.

Score for each candidate item:

```text
score = w_sem * semantic_similarity
      + w_kw  * keyword_match (BM25 on content)
      + w_rec * recency_decay(updated_at)
      + w_imp * importance
      + w_prov * provenance_weight (Explicit 1.0, Inferred 0.6, Temporary 0.7, Assumption 0.3)
      + w_task * same_task_or_project_bonus
```

Defaults: `w_sem 0.4, w_kw 0.2, w_rec 0.15, w_imp 0.1, w_prov 0.1, w_task 0.05`. Weights are tuned by evaluation, not by intuition ([TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md) §6.4).

Context budget: at most 8 items, at most 1,200 tokens, grouped by category, each tagged with provenance in the prompt.

## 7. Answering personal questions ("Who am I?")

Rule set (Scenario 2 in the specification):

1. Retrieve semantic items for the owner with `Explicit` provenance or `user_confirmed`.
2. If none exist: answer that EDITH does not have confirmed information about the owner, and list what it would need to know. Do **not** invent.
3. Inferred items may be mentioned only as hedged observations, and only when the user asks for "what you've noticed".
4. Every factual statement in the answer must map to a memory id; the UI shows the source on hover.

## 8. Security and privacy

- Stored locally in SQLite with the database file mode `0600`. Optional encryption at rest (SQLCipher or per-field encryption) is a Phase 15 decision (D13).
- Secrets rejected at the write gate (section 4.2).
- Memory content is never sent to a cloud model unless the request's data class allows it and the item is not `Personal`-restricted by the owner.
- Exports and diagnostics exclude memory content by default.

## 9. Owner controls (memory explorer)

The explorer ([UI_UX](EDITH_UI_UX_SPECIFICATION.md) §4.5) provides: search and filter by category, provenance, status, source, date; view sources and relationships; edit content (creates a new version and marks the old one `Superseded`); confirm or reject inferred items; delete; export.

## 10. Storage and indexing

- Tables: `memory_items`, `memory_sources`, `memory_links` (relationships), `memory_versions`, `memory_embeddings` (vector index), `memory_review_queue`.
- Full-text: SQLite FTS5.
- Vectors: an embedding index using a SQLite vector extension (candidate **sqlite-vec**, to be verified and benchmarked; fallback: brute-force cosine over a memory-mapped matrix, adequate for up to ~100k items). Decision D5.
- Embeddings from a local embedding model served through the same provider abstraction.

## 11. Metrics

- Retrieval precision at 5 on a labelled set of 200 queries (target ≥ 0.8 — hypothesis).
- Contradiction detection recall on a synthetic set (target ≥ 0.85 — hypothesis).
- Count of `Inferred` items presented as fact in evaluation transcripts (target 0; this is a hard requirement).

## 12. Relationship to the four-tier model in MCP and skills

Procedural memory stores *which* skill or tool sequence worked. It never stores executable code. Executable behaviour stays in skills and tools, subject to policy.

## 13. Prototype mapping

The memory explorer prototype uses seeded items covering all four categories and all five provenance values, with simulated edit and delete actions that update in-memory state only.
