# EDITH — Capability Matrix

Each row is a user-visible or system capability. Columns show the **design state** (documented), the **prototype state** (what the web prototype does), and the **target phase** for a real implementation. The prototype column is deliberately strict: anything not actually simulated in the UI is marked "Not in prototype".

Prototype legend: **Interactive (simulated)** — UI behaviour works, backing data is mock; **Display only** — static representation; **Not in prototype** — designed only.

| # | Capability | Design doc | Prototype state | Real implementation phase | Real-world dependency |
|---|-----------|------------|-----------------|---------------------------|-----------------------|
| C01 | Conversation with streaming text | API, UI_UX §3.1 | Interactive (simulated) | 7 | Model provider |
| C02 | Deterministic clock and calc (Tier 0) | MODEL_ROUTING §4.2 | Interactive — computed in browser, labelled Tier 0 | 5 | None |
| C03 | Route badge per answer | MODEL_ROUTING §9 | Interactive (simulated routing) | 6 | Router |
| C04 | Task lifecycle with 12 states | AGENT_ORCHESTRATION §3–4 | Interactive (simulated executor) | 7 | Orchestrator |
| C05 | Activity center: plan, subtasks, errors, verification | AGENT_ORCHESTRATION §10 | Interactive (simulated task) | 7 | Orchestrator, events |
| C06 | Task cancellation | AGENT_ORCHESTRATION §8 | Interactive (simulated) | 7 | Cancellation tree |
| C07 | Confirmation request and approval | SECURITY §4 | Interactive (simulated approval card) | 7 | Policy engine |
| C08 | Memory explorer: browse, filter, edit, confirm, delete | MEMORY §9 | Interactive (in-memory store) | 9 | Memory engine |
| C09 | Provenance labels on memory | MEMORY §3 | Interactive display | 9 | Memory engine |
| C10 | "Who am I?" answer using explicit facts only | MEMORY §7 | Interactive (rule-based over seed data, labelled) | 9 | Memory retrieval, Tier 2 |
| C11 | MCP server manager with states | MCP_AND_SKILL §4 | Interactive (simulated states) | 8 | `rmcp`, child processes |
| C12 | MCP tool list and per-tool permission | MCP_AND_SKILL §4.4, SECURITY §5 | Interactive (simulated toggles) | 8 | Policy |
| C13 | Skill registry with adapters, versions, enable | MCP_AND_SKILL §5–6 | Interactive (simulated) | 8 | Skill registry |
| C14 | Instruction vs executable distinction | MCP_AND_SKILL §2 | Display (type badges) | 8 | Type model |
| C15 | Routing dashboard: tiers, latency, fallbacks | MODEL_ROUTING §10 | Interactive (simulated stats) | 6 | Route records |
| C16 | Provider configuration and health | MODEL_ROUTING §7 | Interactive (simulated health) | 6 | Provider adapters |
| C17 | Local model management (list, load, unload) | UI_UX §4.3 | Interactive (simulated) | 6 | Ollama / llama.cpp |
| C18 | Voice push-to-talk with partial captions | VOICE §3, §5 | Not in prototype (state machine displayed only) | 11 | Microphone, ASR |
| C19 | Spoken responses and barge-in | VOICE §6, §8 | Not in prototype | 11 | TTS, audio output |
| C20 | Voice configuration (devices, ASR engine, consent) | VOICE §4–5 | Interactive (simulated device list) | 11 | Audio stack |
| C21 | Search providers and source list | SEARCH §2–3 | Interactive (simulated results, labelled) | 12 | Search APIs |
| C22 | Evidence and citation display | SEARCH §1, §3.7 | Interactive (simulated spans from seed text) | 12 | Extraction |
| C23 | Autonomy policy matrix | SECURITY §3 | Interactive (editable matrix) | 7 | Policy engine |
| C24 | Tool permission rules | SECURITY §5 | Interactive (editable, not enforced) | 7 | Policy engine |
| C25 | Audit log view | SECURITY §10 | Interactive (seeded entries) | 7 | Audit store |
| C26 | Holographic overlay with states | UI_UX §3.6 | Interactive (CSS animation, states switch on click) | 14 | Tauri overlay |
| C27 | Settings application, 14 sections | UI_UX §4 | Interactive (all sections render; values stored in memory) | 5–16 | Config store |
| C28 | Theme and appearance controls | FRONTEND §3, UI_UX §4.13 | Interactive | 14 | None |
| C29 | Logs and diagnostics | DETAILED §3.23 | Interactive (seeded log, filter) | 5 | Observability |
| C30 | Context sources (git, project, focus) | DETAILED §3.18 | Display (toggles only) | 10a | Context acquisition |
| C31 | Wake word | VOICE §10 | Not in prototype | Later | Design review |
| C32 | Fine-tuning pipeline | Vision §6 | Not in prototype | Later | Dataset review |
| C33 | Browser automation | SEARCH §7 | Not in prototype | 12 | Browser engine |
| C34 | Rollback of file changes | SECURITY §11 | Not in prototype | 7 | File snapshots |
| C35 | Real local model execution | MODEL_ROUTING | **Not in prototype (by rule)** | 6 | Local runtime |
| C36 | Real microphone access | VOICE | **Not in prototype (by rule)** | 11 | Audio stack |
| C37 | Real MCP connections | MCP_AND_SKILL | **Not in prototype (by rule)** | 8 | rmcp |
| C38 | Real search results | SEARCH | **Not in prototype (by rule)** | 12 | Providers |

Rule: rows C35–C38 are explicitly excluded from the prototype by the product brief. Any future change that makes a row "Interactive" must be a deliberate decision recorded in [TECHNOLOGY_DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md).
