# EDITH 2.0 — Engineering Master Backlog
**Tracking Document for Milestones & Tasks**

---

## Epic 1: Rust Workspace & Foundation (Phase 1)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-101** | `Cargo.toml` | Root workspace configuration with members and shared dependency profiles | **Completed** | `cargo metadata` parses cleanly |
| **TSK-102** | `edith-core` | Shared domain types (`TaskState`, `Tier`, `CapabilityKind`, `AutonomyClass`, `Provenance`, `DataClass`, UUIDv7 IDs, Configuration structs) | **Completed** | Serde round-trip unit tests pass |
| **TSK-103** | `edith-events` | In-process typed event bus using Tokio broadcast with lag detection and envelopes | **Completed** | Multiple subscriber and lag handling tests pass |
| **TSK-104** | `edith-storage` | SQLite storage engine in WAL mode, embedded migrations (`0001_initial_schema.sql`), connection pool (`r2d2`), task & event repositories | **Completed** | In-memory and file-based SQLite tests pass |
| **TSK-105** | `edith-api` | Axum HTTP and WebSocket API server, `/v1/health`, `/v1/status`, bearer token middleware, CORS | **Completed** | HTTP endpoint integration tests pass |
| **TSK-106** | `apps/daemon` | Composition root, configuration loading (`edith.toml`), lifecycle management, signal handling (`SIGINT`, `SIGTERM`), dual Unix/TCP sockets | **Completed** | Daemon boots cleanly, initializes DB, and gracefully shuts down |

---

## Epic 2: Model Providers & Inference (Phase 2)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-201** | `edith-models` | Define `ModelProvider` trait, request/response structures, streaming tokens, error types | **Completed** | Mock provider tests pass |
| **TSK-202** | `edith-models` | Implement Ollama adapter connecting to `http://127.0.0.1:11434` supporting local Qwen models | **Completed** | Live integration test with local Ollama passes |
| **TSK-203** | `edith-models` | Capability detection, token counting, Qwen3 thinking extraction, timeout handling | **Completed** | Real Qwen3 response evaluated with thinking extracted |
| **TSK-204** | `edith-models` | Thread-safe `ProviderRegistry` with parallel health check auditing | **Completed** | Concurrent health checks verify all providers |

---

## Epic 3: Conversation Engine (Phase 3)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-301** | `edith-storage` | Migration `0002_add_thinking_to_turns.sql`, sessions and turns repository with full CRUD, cascade cleanup | **Completed** | Repository CRUD & migration tests pass |
| **TSK-302** | `edith-api` | Session and turn endpoints: `GET/POST /v1/sessions`, `GET/PATCH/DELETE /v1/sessions/{id}`, `GET/PATCH/DELETE /v1/sessions/{id}/turns/{turn_id}`, `POST /v1/sessions/{id}/messages` | **Completed** | API integration tests pass |
| **TSK-303** | `edith-api` | Asynchronous streaming conversation worker (`process_conversation`) with `CancellationToken` cancellation and `POST /v1/sessions/{id}/cancel` | **Completed** | In-flight cancellation verified |
| **TSK-304** | `edith-daemon` | Streaming response delivery via WebSocket (`message.delta`, `message.final`) and live Qwen3 chat verification | **Completed** | Live stream and thinking persistence verified |

---

## Epic 4: Agent Runtime & Orchestration (Phase 4)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-401** | `edith-agent` | Task state machine (`discovered` -> `planning` -> `executing` -> `verifying` -> `completed` / `failed`) | Planned | State transition unit tests pass |
| **TSK-402** | `edith-agent` | Context builder assembling working context, user preferences, and history | Planned | Token budget bounded context tests pass |
| **TSK-403** | `edith-agent` | Plan generation and step execution loop | Planned | Multi-step mock plan execution passes |
| **TSK-404** | `edith-agent` | Verification engine enforcing mechanical, evidence-based, or user-confirmed gates | Planned | Verification failure stops execution before completion |
