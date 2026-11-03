# EDITH 2.0 — Architecture Gap Analysis & Technical Feasibility
**Date:** 2026-11-03  
**Status:** Approved for Implementation

---

## 1. Purpose

This document analyzes the 24 Arena.ai architecture blueprint documents against actual Linux environment constraints, software dependencies, and runtime characteristics. It documents identified contradictions, risks, and proposed engineering corrections.

---

## 2. Identified Contradictions & Corrections

### Gap 1: Socket-Only Transport vs. Web Prototype / Frontend Development
- **Blueprint Statement:** `EDITH_API_AND_EVENT_CONTRACTS.md §1` specifies that the local API is served exclusively on a Unix domain socket at `$XDG_RUNTIME_DIR/edith/api.sock` (mode `0600`), with no TCP listener.
- **The Reality:** Standard web browsers and Vite development servers cannot initiate raw Unix domain socket HTTP connections or WebSocket upgrades via browser `fetch()` or `new WebSocket(...)`. Standard browser runtimes only support HTTP/HTTPS and WS/WSS over TCP (`http://127.0.0.1:<port>`). While a production Tauri desktop app can bridge Unix sockets via Tauri IPC, standard development workflows and UI testing require direct HTTP/WS access.
- **Resolution (ADR-0002):** The daemon must support dual listener configuration:
  1. Primary default for local IPC: Unix domain socket at `$XDG_RUNTIME_DIR/edith/api.sock` (mode 0600).
  2. Local development & web client mode: Loopback TCP listener bound exclusively to `127.0.0.1:<port>` with mandatory per-launch bearer token authentication and strict CORS origin headers.
  3. The listener mode is configurable via `edith.toml` (`transport = "both" | "unix" | "tcp"`).

### Gap 2: Wayland Transparent Click-Through Overlay on GNOME Shell
- **Blueprint Statement:** `EDITH_UI_UX_SPECIFICATION.md §4` and Gate G3 in `EDITH_TECHNOLOGY_DECISIONS.md` describe a transparent, click-through desktop overlay HUD.
- **The Reality:** The host is running GNOME Wayland (`Ubuntu 26.04.1`, Wayland session). In pure Wayland, clients cannot freely position transparent overlay windows across screens, ignore pointer events conditionally, or grab global key combinations without compositor-specific protocols. GNOME Mutter intentionally does not implement `wlr-layer-shell`.
- **Resolution:**
  - Acknowledge Decision D19 Gate G3: Do not attempt to force unstable low-level compositor hacks into core architecture.
  - Deliver the primary user experience as a crisp, floating responsive windowed interface (compact HUD mode) with Wayland system tray and global shortcut registration via XDG Desktop Portal (`org.freedesktop.portal.GlobalShortcuts`).
  - Keep transparent overlay (Mode B via XWayland or GNOME extension) as an optional visual enhancement flag, never as a blocker to core intelligence and agent operations.

### Gap 3: SQLite Compile-Time Query Verification vs. Build Reliability
- **Blueprint Statement:** `EDITH_DATABASE_DESIGN.md` suggests `sqlx` with embedded migrations.
- **The Reality:** `sqlx::query!` macros require an active `DATABASE_URL` during `cargo build` or a checked-in `sqlx-data.json` offline cache. This causes build brittleness in CI, across different developer machines, and during initial checkout.
- **Resolution (ADR-0001):**
  - Use `rusqlite` with `bundled` feature or `sqlx` with dynamic runtime queries and embedded migrations (`include_str!` or `rust-embed`).
  - `rusqlite` with `bundled` compiles SQLite 3 directly into the binary with zero external system library dependencies, runs embedded migrations synchronously on startup with foreign keys and WAL mode, and allows completely deterministic offline builds without network or database dependencies.

### Gap 4: Resource-Constrained Inference on Shared Hardware
- **Blueprint Statement:** High concurrency agent tasks executing simultaneous embedding, ASR, and reasoning.
- **The Reality:** The host has 16 GB of unified RAM and an AMD Ryzen 5 5600GT APU with integrated graphics. Concurrently loading a 4B parameter model (~2.5 GB RAM), Faster-Whisper Medium (~1.5 GB RAM), and browser processes will easily consume 70-80% of available memory.
- **Resolution:**
  - Implement Tier 0 native deterministic evaluation first (zero model load, zero RAM footprint, instantaneous sub-millisecond execution).
  - Enforce serialized local inference or dynamic model unloading where appropriate.
  - Implement strict timeout and cancellation propagation using Tokio cancellation tokens.

---

## 3. Architecture Validation Matrix

| Subsystem | Blueprint Reference | Implementation Feasibility | Risk Level | Mitigation Strategy |
|-----------|---------------------|----------------------------|------------|---------------------|
| **Core Types** | `edith-core` | High | Minimal | Pure Rust types, serde serialization |
| **Event Bus** | `edith-events` | High | Low | Tokio broadcast channel with bounded buffers |
| **Storage Engine** | `edith-storage` | High | Low | SQLite in WAL mode with connection pooling & transaction isolation |
| **API & IPC** | `edith-api` | High | Low | Axum HTTP/1.1 + WebSocket over loopback / Unix socket |
| **Model Inference** | `edith-models` | High | Medium | HTTP client to Ollama (`http://127.0.0.1:11434`) |
| **Model Router** | `edith-router` | High | Low | Pure rule-based Tier 0 -> Tier 4 matcher |
| **Agent Orchestrator** | `edith-orchestrator` | High | Medium | 12-state state machine with Tokio tasks |
| **Voice Engine** | `edith-voice` | High | Medium | Separate worker process / thread; Faster-Whisper integration |
| **Security / Policy** | `edith-policy` | High | Low | Pure function evaluator + audit hash chain |
