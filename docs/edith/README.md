# EDITH — Design Blueprint

EDITH is a planned persistent, local-first personal AI system. This folder contains the complete design blueprint: product vision, research, architecture, system design, UI/UX specification, and implementation plan. The interactive web prototype lives in [`../../prototype`](../../prototype/README.md).

**Status:** design and prototype only. No Rust implementation exists yet. The prototype is entirely simulated — see its banner and [CAPABILITY_MATRIX](EDITH_CAPABILITY_MATRIX.md).

## Reading order

| # | Document | What it answers |
|---|----------|-----------------|
| 1 | [EDITH_PRODUCT_VISION.md](EDITH_PRODUCT_VISION.md) | What EDITH is; principles; specification analysis (conflicts, ambiguities, risks) |
| 2 | [EDITH_PRODUCT_REQUIREMENTS.md](EDITH_PRODUCT_REQUIREMENTS.md) | Stable requirement IDs (FR, NFR) with priorities and verification |
| 3 | [EDITH_CAPABILITY_MATRIX.md](EDITH_CAPABILITY_MATRIX.md) | Every capability: design, prototype state, phase, dependency |
| 4 | [EDITH_RESEARCH_AND_COMPETITOR_ANALYSIS.md](EDITH_RESEARCH_AND_COMPETITOR_ANALYSIS.md) | Verified findings on Jarvis-style projects, MCP, skills, runtimes, shells, speech; sources |
| 5 | [EDITH_HIGH_LEVEL_ARCHITECTURE.md](EDITH_HIGH_LEVEL_ARCHITECTURE.md) | Subsystems, process model, context and layer diagrams |
| 6 | [EDITH_DETAILED_SYSTEM_DESIGN.md](EDITH_DETAILED_SYSTEM_DESIGN.md) | Per-subsystem contracts, failure modes, data-flow and recovery diagrams |
| 7 | [EDITH_AGENT_ORCHESTRATION_DESIGN.md](EDITH_AGENT_ORCHESTRATION_DESIGN.md) | 12-state task lifecycle, planning, parallelism, verification |
| 8 | [EDITH_MODEL_ROUTING_DESIGN.md](EDITH_MODEL_ROUTING_DESIGN.md) | Tiers 0–4, routing procedure, escalation, privacy, fallback |
| 9 | [EDITH_MCP_AND_SKILL_ARCHITECTURE.md](EDITH_MCP_AND_SKILL_ARCHITECTURE.md) | Capability model, MCP host, skill registry, compatibility adapters |
| 10 | [EDITH_MEMORY_ARCHITECTURE.md](EDITH_MEMORY_ARCHITECTURE.md) | Four memory types, provenance, lifecycle, retrieval, forgetting |
| 11 | [EDITH_VOICE_ARCHITECTURE.md](EDITH_VOICE_ARCHITECTURE.md) | Capture, streaming ASR, TTS, endpointing, barge-in |
| 12 | [EDITH_SEARCH_ARCHITECTURE.md](EDITH_SEARCH_ARCHITECTURE.md) | Search vs. evidence, providers, fetch, citations, verification |
| 13 | [EDITH_SECURITY_AND_AUTONOMY_POLICY.md](EDITH_SECURITY_AND_AUTONOMY_POLICY.md) | Autonomy classes, command policy, injection defence, audit, threat model |
| 14 | [EDITH_DATABASE_DESIGN.md](EDITH_DATABASE_DESIGN.md) | SQLite schema, event sourcing, migrations, backups |
| 15 | [EDITH_API_AND_EVENT_CONTRACTS.md](EDITH_API_AND_EVENT_CONTRACTS.md) | Local API routes, event kinds, error model, versioning |
| 16 | [EDITH_FRONTEND_DESIGN_SYSTEM.md](EDITH_FRONTEND_DESIGN_SYSTEM.md) | Tokens, components, service adapters, accessibility |
| 17 | [EDITH_UI_UX_SPECIFICATION.md](EDITH_UI_UX_SPECIFICATION.md) | Conversation, activity center, overlay modes, all 14 settings sections |
| 18 | [EDITH_PROJECT_STRUCTURE.md](EDITH_PROJECT_STRUCTURE.md) | Crate and package layout with ownership and dependency rules |
| 19 | [EDITH_TECHNOLOGY_DECISIONS.md](EDITH_TECHNOLOGY_DECISIONS.md) | Decisions D1–D24 with status, rationale and open gates G1–G6 |
| 20 | [EDITH_IMPLEMENTATION_ROADMAP.md](EDITH_IMPLEMENTATION_ROADMAP.md) | Phases 0–16 with objectives, dependencies, acceptance, definition of completion |
| 21 | [EDITH_TESTING_AND_EVALUATION_PLAN.md](EDITH_TESTING_AND_EVALUATION_PLAN.md) | Test levels, contract suites, scenario and evaluation sets, benchmarks |
| 22 | [EDITH_PERFORMANCE_REQUIREMENTS.md](EDITH_PERFORMANCE_REQUIREMENTS.md) | Latency and resource targets (hypotheses), measurement rules |
| 23 | [EDITH_RISK_REGISTER.md](EDITH_RISK_REGISTER.md) | Scored risks with mitigations and triggers |
| 24 | [EDITH_MASTER_IMPLEMENTATION_BACKLOG.md](EDITH_MASTER_IMPLEMENTATION_BACKLOG.md) | Epics and backlog items with acceptance criteria, ready for implementation |

## Conventions

- **Requirement IDs:** `FR-###` (functional), `NFR-###` (non-functional). Defined in the requirements document.
- **Decision IDs:** `D#` in the technology decisions; gates `G#`.
- **Claims:** research claims are labelled Verified, Recommendation, Assumption or Experimental.
- **Targets:** performance numbers are hypotheses until benchmarked.
- **Names:** subsystem and crate names are fixed across all documents. If a name changes, change every document.

## Five things to decide next

1. Which Qwen3 checkpoint the owner wants to benchmark (gate G1).
2. Whether the Antigravity configuration can be inspected locally (gate G6).
3. Cloud consent defaults for speech and reasoning (currently off).
4. Overlay acceptance: is mode B (XWayland) acceptable if mode A is unavailable on GNOME?
5. Languages required for voice on day one (English only, or English plus Bangla).
