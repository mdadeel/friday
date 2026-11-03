# EDITH — Risk Register

Scoring: Likelihood (L) and Impact (I) on 1–5. Score = L × I. Owner: EDITH core team unless noted. Review: at each phase gate.

| ID | Risk | L | I | Score | Mitigation | Owner | Trigger / check |
|----|------|---|---|-------|-----------|-------|-----------------|
| R1 | Local model cannot meet quality or latency targets on owner hardware | 4 | 4 | 16 | Gate G1 with three checkpoints; tiered routing; cloud escalation (opt-in); honest quality indicator | Core | Phase 6 benchmark |
| R2 | Agent executes an unintended destructive action | 2 | 5 | 10 | Policy engine on every side effect; `Blocked` class; rollback snapshots; batched confirmations; no shell | Security | Policy tests; audit review |
| R3 | Sandboxing insufficient for third-party MCP servers and skill scripts | 3 | 4 | 12 | Environment allowlist; cwd jail; hash pinning; process limits; OS sandbox evaluation in Phase 15 (bubblewrap or landlock — to verify) | Security | Phase 15 review |
| R4 | Prompt injection from web or files causes unauthorised actions | 4 | 4 | 16 | Untrusted tagging; no authority from content; stricter policy for tainted writes; injection suite | Security | Injection suite pass rate |
| R5 | Memory accumulates wrong or contradictory facts | 4 | 3 | 12 | Provenance; write gate; contradiction review; forgetting; user edit | Memory | Review queue size; evaluation |
| R6 | Overlay cannot stay on top on GNOME Wayland | 4 | 3 | 12 | Three overlay modes; G3 spike early; settings show active mode; GNOME Shell extension as fallback option | Desktop | Phase 14 spike |
| R7 | Tauri/webview rendering or transparency issues (for example backdrop-filter, multi-monitor placement) | 3 | 3 | 9 | Avoid blur over transparency; manual multi-monitor tests; fallback to solid panels | Desktop | Hardware checklist |
| R8 | MCP SDK or spec churn breaks integrations | 3 | 3 | 9 | `McpClient` wrapper; pinned version; conformance tests; upgrade gate | Core | Dependency update |
| R9 | Audio echo causes self-triggered barge-in loops | 4 | 3 | 12 | Echo cancellation evaluation (G5); automatic disable when correlated; push-to-talk default | Voice | Phase 11 hardware test |
| R10 | Continuous ASR too heavy for CPU or battery | 3 | 3 | 9 | Push-to-talk first; measured budget; model size choice | Voice | Resource budget |
| R11 | Bangla or mixed-language recognition accuracy inadequate | 4 | 3 | 12 | Measure on owner set (G4); choose multilingual model; cloud option with consent | Voice | WER target set after baseline |
| R12 | Cloud provider receives data it should not | 2 | 5 | 10 | Data classes; adapter-level refusal; egress records; consent UI; default off | Security | Egress audit |
| R13 | Search provider terms, cost or rate limits block research | 3 | 3 | 9 | Provider abstraction; caches; fallback; budget caps | Research | Provider health |
| R14 | Dataset for fine-tuning contains private or low-quality data | 3 | 4 | 12 | Human review; `Secret` exclusion; evaluation gate before promotion | Learning | Phase 10 review |
| R15 | Scope breadth delays v1 | 4 | 4 | 16 | Capability matrix; out-of-scope list; phase gates; prototype as design validation | Product | Roadmap review |
| R16 | Licence incompatibility of a dependency | 2 | 4 | 8 | `cargo deny`; licence review per dependency; decision log | Core | CI |
| R17 | Antigravity configuration not accessible or unstable | 3 | 2 | 6 | Adapter deferred until verified (G6); native MCP config as primary path | Core | Phase 8 spike |
| R18 | Claude Code / OpenCode configuration formats change | 3 | 2 | 6 | Adapter fixtures; version pins; graceful "unknown format" state | Core | Adapter tests |
| R19 | SQLite corruption or lock contention | 2 | 4 | 8 | WAL; single writer; backups; integrity checks; restore drill | Core | Corruption drill |
| R20 | Latency targets are unrealistic and frustrate the user | 3 | 4 | 12 | Targets as hypotheses; measure; tiered fast path; streaming; honest status | Core | Performance suite |
| R21 | Owner over-trusts inferred memory or unverified answers | 3 | 4 | 12 | Visible provenance; verification labels; unverified tag; UI rules §5 of UI_UX | Product | Owner acceptance sessions |
| R22 | Simulated prototype is mistaken for real capability | 3 | 4 | 12 | SIMULATED labels; no real integrations; capability matrix | Product | Prototype audit |
| R23 | Notifications and voice interrupt the owner excessively | 3 | 2 | 6 | Quiet defaults; notification rules; presets | Product | Owner feedback |
| R24 | Gemini model identifiers change or are deprecated | 4 | 2 | 8 | Model ID in configuration; adapter test against live endpoint nightly | Voice | Nightly contract test |

## Top risks requiring action before Phase 7

1. **R1** — gate G1 must be measured before routing thresholds are fixed.
2. **R4** — injection defences must exist before tools with write access are enabled.
3. **R15** — keep the scope list current; defer anything that is not on the v1 list.

## Risk review log

| Date | Change | By |
|------|--------|----|
| 2026-11-03 | Initial register from specification analysis and research | Blueprint author |
