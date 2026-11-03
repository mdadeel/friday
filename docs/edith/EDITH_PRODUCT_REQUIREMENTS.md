# EDITH — Product Requirements

Priority: **M** = must for v1, **S** = should, **C** = could / later. IDs are stable and referenced by the backlog ([MASTER_BACKLOG](EDITH_MASTER_IMPLEMENTATION_BACKLOG.md)).

## 1. Conversation and commands

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-001 | Accept text messages in a persistent session | M | UI and API test |
| FR-002 | Classify each request as deterministic (T0), simple or objective | M | Router tests |
| FR-003 | Answer deterministic requests (time, date, calculation, system status) without a model | M | Assert no model call in trace |
| FR-004 | Stream answers token by token into the conversation | M | Latency test |
| FR-005 | Show the route (tier, model, data class) for every answer | M | UI test |
| FR-006 | Cancel any running task from the UI, CLI or voice | M | Cancellation tests |
| FR-007 | Accept follow-up turns that refer to earlier turns and tasks | M | Scenario test 8 |
| FR-008 | Split large multi-part instructions into objectives and constraints | S | Scenario test 5 |

## 2. Tasks and autonomy

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-010 | Every objective becomes a task with the 12-state lifecycle | M | State machine tests |
| FR-011 | Each task declares a verification mode | M | Unit tests |
| FR-012 | A task is `Completed` only after verification passes or the mode is `none-declared` (shown as unverified) | M | Property tests |
| FR-013 | Independent subtasks execute concurrently within budget | S | Benchmark |
| FR-014 | Failed steps are retried, fall back, or are reported as blockers with evidence | M | Fault-injection tests |
| FR-015 | Tasks survive daemon restart and resume or ask to resume | M | Restart test |
| FR-016 | Background tasks run without blocking the UI | M | Responsiveness test |
| FR-017 | Activity center shows objective, plan, active model, tools, subtasks, errors and verification | M | UI test |
| FR-018 | Autonomy classes apply to every side-effecting call | M | Policy tests |
| FR-019 | Confirmation requests are batched per task and show a preview | M | UI test |
| FR-020 | Rollback is available for file changes made by EDITH within 7 days | S | Integration test |

## 3. Models and routing

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-030 | Add and remove model providers without code changes | M | Config test |
| FR-031 | Support Ollama and llama.cpp OpenAI-compatible endpoints | M | Contract tests |
| FR-032 | Route by tier with fallback chains | M | Router tests |
| FR-033 | Cloud providers are off by default and require per-data-class consent | M | Policy tests |
| FR-034 | Show provider health and fallback events | M | UI test |
| FR-035 | Allow user override of a route for a single task | S | UI test |

## 4. Memory

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-040 | Store episodic, semantic, procedural and working memory | M | Storage tests |
| FR-041 | Every memory item records provenance, sources and confidence | M | Schema test |
| FR-042 | Never present `Inferred`, `Assumption` or `Outdated` items as confirmed facts | M | Evaluation transcripts |
| FR-043 | Detect contradictions and route them to review | M | Synthetic tests |
| FR-044 | Deduplicate near-identical memories | M | Unit tests |
| FR-045 | Users can inspect, edit, confirm, reject and delete any item | M | UI and API tests |
| FR-046 | Working memory expires; temporary items expire on schedule | M | Time-travel tests |
| FR-047 | Secrets are never stored in memory | M | Redaction tests |
| FR-048 | Semantic search over memory | S | Retrieval benchmark |
| FR-049 | Background consolidation without changing `Explicit` items | S | Unit tests |

## 5. Capabilities (MCP and skills)

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-050 | Discover MCP servers from EDITH's registry and from OpenCode and Claude Code configurations (read-only) | M | Adapter fixture tests |
| FR-051 | Launch stdio MCP servers and connect to Streamable HTTP servers | M | Integration with fake server |
| FR-052 | Show connection status, reason for unavailability, tools, resources and prompts | M | UI test |
| FR-053 | Restart crashed servers with backoff | M | Fault tests |
| FR-054 | Load only the top-N relevant tool schemas per model call | M | Token-count test |
| FR-055 | Distinguish instructions, native tools, MCP tools and external services in UI and API | M | Type tests |
| FR-056 | Discover and enable or disable skills; show version, compatibility and content hash | M | UI test |
| FR-057 | Changed skill content requires re-approval | M | Hash tests |
| FR-058 | Execution history for every capability invocation | M | UI test |

## 6. Voice

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-060 | Push-to-talk voice input with partial transcripts | M | Latency test |
| FR-061 | Voice spoken responses | M | Listening test |
| FR-062 | Stop speech within 150 ms of barge-in | M | Timing test |
| FR-063 | Microphone selection and device recovery | M | Hardware tests |
| FR-064 | Local ASR by default; cloud ASR only with consent | M | Config and policy tests |
| FR-065 | Visible indicator whenever the microphone is open | M | UI test |
| FR-066 | Continuous listening or wake word | C | Later design review |

## 7. Search and research

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-070 | Pluggable search providers with fallback | M | Fault tests |
| FR-071 | Parallel independent queries | S | Benchmark |
| FR-072 | Source fetch with timeouts, robots handling and size limits | M | Fixture server |
| FR-073 | Evidence extraction with span identifiers | M | Golden tests |
| FR-074 | Every claim in a research answer maps to evidence; unsupported sentences are removed or marked | M | Verifier tests |
| FR-075 | Show sources, dates and authority tier | M | UI test |
| FR-076 | Browser-based page reading | C | Phase 12 |

## 8. Context and environment

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-080 | Git status and recent changes for a configured project | M | Integration test |
| FR-081 | Opt-in context sources, each with visible collection log | M | Policy test |
| FR-082 | Answer "what was I working on?" from episodic memory and project state | S | Scenario test 8 |
| FR-083 | No screen or keystroke capture | M | Architecture review (hard constraint) |

## 9. Interface

| ID | Requirement | Pri | Verification |
|----|-------------|-----|--------------|
| FR-090 | Main conversation and command interface | M | E2E |
| FR-091 | Transparent holographic overlay with listening, thinking and speaking states | S | Manual on target desktop |
| FR-092 | Separate settings application with 14 sections | M | E2E |
| FR-093 | Light and dark themes; reduced-motion mode | S | Visual test |
| FR-094 | Keyboard-first operation | M | Accessibility test |
| FR-095 | Log and diagnostics view with redacted export | M | UI test |

## 10. Non-functional requirements

| ID | Requirement | Pri | Target (hypothesis unless stated) |
|----|-------------|-----|-----------------------------------|
| NFR-001 | Privacy: no telemetry leaves the device by default | M | Verified by egress test |
| NFR-002 | Security: no open TCP listener by default | M | Port scan test |
| NFR-003 | Reliability: daemon uptime over 7 days without crash | S | Soak test |
| NFR-004 | Performance: see [PERFORMANCE_REQUIREMENTS](EDITH_PERFORMANCE_REQUIREMENTS.md) | M | Benchmarks |
| NFR-005 | Observability: every operation has a trace ID, latency and error | M | Trace coverage test |
| NFR-006 | Maintainability: subsystem crates with contract tests | M | CI |
| NFR-007 | Portability: models and providers replaceable without core changes | M | Adapter swap test |
| NFR-008 | Accessibility: WCAG 2.2 AA contrast; focus visible; screen-reader labels | S | Audit |
| NFR-009 | Localisation: English UI in v1; Bangla speech recognition evaluated | S | Evaluation |
| NFR-010 | Licensing: all dependencies checked by `cargo deny` | M | CI |

## 11. Out of scope for v1

- Multi-device sync; mobile clients; multi-user accounts.
- Screen capture or keystroke logging.
- Autonomous financial actions and external communications without confirmation.
- Privileged system changes.
- Interactive browser automation.
- Training pipelines run automatically from interactions.
