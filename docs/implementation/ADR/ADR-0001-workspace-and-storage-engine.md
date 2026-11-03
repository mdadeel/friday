# ADR-0001: Workspace Layout and SQLite Storage Engine Architecture

## Context
EDITH requires a modular, high-performance, asynchronous Rust architecture with local persistence for conversations, tasks, events, routing records, and memory. The persistence engine must operate in single-user local desktop environments with zero administrative overhead and transaction isolation.

The original blueprint suggests `sqlx`. However, `sqlx` query validation macros require either a running database or a checked-in offline schema file (`sqlx-data.json`), which introduces build brittleness across clean checkouts and CI environments.

## Decision
1. Organize the repository as a Cargo workspace with dedicated crates having single responsibilities:
   - `crates/edith-core`: Pure domain types, IDs, enums, error hierarchy, configuration models.
   - `crates/edith-events`: In-process typed event bus using Tokio broadcast channels.
   - `crates/edith-storage`: SQLite storage engine using connection pooling, WAL mode, synchronous=NORMAL, foreign keys enabled, and embedded schema migrations.
   - `crates/edith-api`: Axum HTTP and WebSocket API server.
   - `apps/daemon`: Composition root, signal handler, and runtime lifecycle.
2. For storage, use `rusqlite` with `bundled` (compiling SQLite 3 directly into the binary with zero external dependency) coupled with `r2d2` or async worker channels for thread-safe pooled access, or `sqlx` with dynamic queries. We use `rusqlite` with `bundled` and `r2d2` connection pooling wrapped in asynchronous Tokio tasks to guarantee zero offline cache requirements, zero build dependencies, and robust transaction isolation.

## Status
Accepted.

## Consequences
- Clean, fast, deterministic compilation across any environment.
- Embedded migrations execute automatically upon database opening.
- Safe concurrent read access and serialized write transactions.
