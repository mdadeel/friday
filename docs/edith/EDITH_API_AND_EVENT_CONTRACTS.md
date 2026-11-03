# EDITH — API and Event Contracts

Companion: [HIGH_LEVEL_ARCHITECTURE](EDITH_HIGH_LEVEL_ARCHITECTURE.md) §7 · [FRONTEND_DESIGN_SYSTEM](EDITH_FRONTEND_DESIGN_SYSTEM.md) §6 · [DATABASE](EDITH_DATABASE_DESIGN.md)

These contracts are the boundary between the Rust daemon and every client (desktop UI, overlay, settings, CLI, tests). The prototype implements the **same TypeScript types** against mock adapters, so the UI does not change when the real daemon arrives.

## 1. Transport

- Local API served on a Unix domain socket at `$XDG_RUNTIME_DIR/edith/api.sock` (mode `0600`).
- Request/response: HTTP/1.1 JSON over the socket (`axum`/`hyper`), routes under `/v1`.
- Events: `GET /v1/events` upgraded to WebSocket (preferred) or served as Server-Sent Events (fallback). Each event is one JSON text frame.
- Client authentication: socket permissions plus a per-launch token written to a file readable only by the same user. The token is required on every request via `Authorization: Bearer`.
- Versioning: path prefix `/v1`; additive changes only within a major version; breaking changes create `/v2`.

## 2. Resources

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/health` | Daemon health, version, subsystem status |
| GET | `/v1/status` | Summary: active tasks, provider health, MCP and voice states |
| POST | `/v1/sessions` | Create a conversation session |
| GET | `/v1/sessions/{id}/turns` | List turns (paginated) |
| POST | `/v1/sessions/{id}/messages` | Submit a user message (`source`: text or voice) |
| POST | `/v1/tasks/{id}/cancel` | Cancel a task |
| POST | `/v1/tasks/{id}/resume` | Resume a `Waiting` task |
| GET | `/v1/tasks` | List tasks (filters: state, session) |
| GET | `/v1/tasks/{id}` | Task detail: plan, subtasks, routes, artifacts, verification |
| GET | `/v1/tasks/{id}/events` | Task event timeline |
| POST | `/v1/approvals/{id}` | Approve or deny a confirmation request |
| GET | `/v1/routes/summary?range=24h` | Routing dashboard data |
| GET | `/v1/providers` | Model providers and health |
| PUT | `/v1/providers/{id}` | Update provider config (no secrets in body) |
| GET | `/v1/memory/items` | Search and list memory |
| PATCH | `/v1/memory/items/{id}` | Edit or confirm |
| DELETE | `/v1/memory/items/{id}` | Delete |
| GET | `/v1/memory/review` | Review queue |
| GET | `/v1/capabilities` | All capabilities with status and autonomy |
| GET | `/v1/mcp/servers` | MCP servers and states |
| POST | `/v1/mcp/servers/{id}/restart` | Restart a server |
| PUT | `/v1/mcp/servers/{id}/enabled` | Enable or disable |
| GET | `/v1/skills` | Skills index |
| PUT | `/v1/skills/{id}/enabled` | Enable or disable a skill |
| GET | `/v1/policy` | Policy rules |
| PUT | `/v1/policy` | Replace policy (validated, versioned) |
| GET | `/v1/audit?since=` | Audit events |
| GET | `/v1/settings` | All settings sections |
| PATCH | `/v1/settings/{section}` | Update one section |
| POST | `/v1/voice/session` | Start or stop push-to-talk |
| GET | `/v1/diagnostics/bundle` | Redacted diagnostics export |

## 3. Event envelope and kinds

```json
{
  "id": "0195c1e0-…",
  "at": "2026-11-03T08:12:45.120Z",
  "trace": "0195c1e0-…",
  "task": "0195c1df-…",
  "kind": "task.state_changed",
  "payload": { "from": "Planning", "to": "Routing" }
}
```

| Kind | Payload (summary) |
|------|-------------------|
| `task.created` | objective, origin, verification mode |
| `task.state_changed` | from, to, reason |
| `task.plan_ready` | subtasks (id, kind, capability, depends_on) |
| `subtask.started` / `subtask.finished` | id, route id, duration, status |
| `route.decided` | tier, provider, model, reason, data class |
| `tool.invoked` / `tool.finished` | capability id, duration, status, summary (no raw payload) |
| `mcp.server_state` | server id, state, reason |
| `approval.requested` | request id, capability, preview, expiry time |
| `approval.resolved` | request id, decision |
| `verification.result` | criterion, verdict, evidence refs |
| `message.delta` | session id, turn id, text delta (not persisted) |
| `message.final` | session id, turn id, text, route id |
| `memory.written` | memory id, category, provenance |
| `memory.review_needed` | memory id, reason |
| `voice.state_changed` | state, device |
| `voice.partial` / `voice.final` | text, segment id |
| `provider.health` | provider id, status |
| `audit.appended` | audit seq |
| `daemon.warning` / `daemon.error` | code, message |
| `lagged` | count skipped; client must refetch |

Versioning: unknown event kinds are ignored by clients. Payload fields may be added; removals require a major version.

## 4. Command shapes

Examples:

```json
// POST /v1/sessions/{id}/messages
{ "text": "what time is it", "source": "text", "client_turn_id": "c-102" }

// Response 202
{ "turn_id": "0195…", "task_id": "0195…", "accepted_at": "…" }
```

```json
// POST /v1/approvals/{id}
{ "decision": "approve", "scope": "task" }   // scope: once | task | project_7d
```

```json
// PATCH /v1/memory/items/{id}
{ "content": "Owner's timezone is Asia/Dhaka.", "action": "confirm" }   // action: edit | confirm | reject
```

## 5. Error model

```json
{ "error": { "code": "POLICY_DENIED", "message": "Blocked by rule policy.rules[3]", "retryable": false, "trace": "…" } }
```

Stable codes (non-exhaustive): `INVALID_REQUEST`, `NOT_FOUND`, `CONFLICT`, `POLICY_DENIED`, `APPROVAL_REQUIRED`, `PROVIDER_UNAVAILABLE`, `CAPABILITY_UNAVAILABLE`, `CONSENT_REQUIRED`, `TIMEOUT`, `CANCELLED`, `INTERNAL`.

HTTP mapping: 400, 404, 409, 403 (policy), 409 (approval required), 503 (provider unavailable), 504 (timeout), 499-equivalent `CANCELLED` as 409, 500.

## 6. Streaming semantics

- `message.delta` events carry sequence numbers per turn; the UI reassembles and discards out-of-order deltas.
- Backpressure: the daemon keeps a per-client queue of 1,024 events. A slow client receives `lagged` and must refetch (`GET /v1/tasks/{id}` and `GET /v1/sessions/{id}/turns`).

## 7. Idempotency

- `client_turn_id` on message submission prevents duplicate turns on retry.
- Cancel and approve are idempotent: a second call returns the current state.

## 8. TypeScript contract (prototype)

The prototype declares these types in `src/types/contracts.ts` and implements `ServiceAdapter` interfaces. The real client will generate or hand-maintain the same shapes; a contract test compares the Rust serde types with the TypeScript types using JSON Schema exported from the daemon (`schemars`).

## 9. Compatibility and testing

- Golden JSON fixtures for every event kind and command, shared by the Rust and TypeScript test suites.
- Contract tests run on every pull request.
- A `GET /v1/health` response includes `api_version` and `build`; the UI refuses to run against an incompatible major version and shows a diagnostic screen.
