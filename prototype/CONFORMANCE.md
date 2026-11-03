# Prototype conformance

Checked against `docs/edith/EDITH_UI_UX_SPECIFICATION.md` (§3, §4, §5, §7, §8) and `docs/edith/EDITH_FRONTEND_DESIGN_SYSTEM.md` (§3–§9). Every item is marked as **Done**, **Partial**, or **Not done**. Nothing here claims a real model, search, tool, microphone or device.

## Honesty rules (UI spec §7)

| Rule | Status | Evidence |
|------|--------|----------|
| SIMULATED label in header and on every mock-backed panel | Done | `SimBadge` in page header, status bar, and every panel/card with mock data |
| No network calls to model, search or MCP | Done | Only `src/services/mock/*`; search uses a fixed bank in `src/data/searchBank.ts` |
| No microphone or camera access | Done | `voice.ts` never calls `getUserMedia`; "listening" reveals a canned phrase |
| Rule-based responses labelled as such | Done | Welcome notice and replies say "No model is connected" |
| Settings persist only in the session | Done | `settings.ts` holds values in memory; Settings footer says so |
| Tier 0 clock and calculator are real browser computations, labelled T0 | Done | `logic.ts` `tier0Match` / `evaluateExpression`; routes shown as T0 |

## Design tokens (design system §3)

| Item | Status | Notes |
|------|--------|-------|
| §3.1 dark colours | Done | `styles/tokens.css` uses the exact spec values |
| Light theme | Done (extra) | Defined from the same token names; selectable in Appearance. Spec §3.1 said "token definition only", so this goes beyond it |
| Accents: cyan (default), blue, neutral | Done | `data-accent` overrides |
| Accent: ember | Done (extra) | Not in spec §4.13; added as an option, matching the reference image |
| §3.2 type scale 11/13/14/16/20/28 | Done | Tokens `--fs-*`; Bengali-capable fallback stack in `--font-ui` |
| §3.3 spacing 4–48, radius ≤14 | Done | `--sp-*`, `--r-*` |
| §3.4 motion durations | Done | `--motion-*`; reduced motion stops loops via `data-motion="reduced"` |
| §3.5 glow only on core and active dot, ≤0.35 | Done | Core `drop-shadow` alpha 0.22; status dot pulse only |
| §3.5 glass only on settings sidebar and overlay panel | Not done | No `backdrop-filter` used at all (solid fallback everywhere) |

## Components (design system §4) and conventions (§9)

| Item | Status | Notes |
|------|--------|-------|
| `AppShell`, `Rail`, `SimBadge`, `StatusDot`, `Badge`, `Chip` | Done | |
| `Card` used only for task and approval items | Done | Prompt suggestions are `prompt-tile` buttons, not cards. This departs from the reference image on purpose, to keep §4 |
| `Table` with sticky header and row hover | Done | `DataTable` |
| `Toggle`, `Select`, `Slider`, `TextField` | Partial | Slider is not built. Speaking rate and thresholds use number fields |
| `Tabs` with arrow keys | Done | `Tabs`, `SegmentedControl` |
| `Dialog` with focus trap and Esc | Done | `Dialog` |
| `Timeline`, `Meter` | Done | |
| `Core` with four states | Done | Idle, listening, thinking, speaking, plus error (amber ring) |
| `ChatMessage`, `ApprovalCard`, `EvidenceCard` | Done | |
| One component per file | Done | Checked by file layout |
| `PascalCase.tsx`, `camelCase.ts`, `kebab-case.css` | Done | |
| No inline colours | Done | Colours come from tokens only. `OverlayPanel` and styles reference `var(--…)` |
| Strings centralised in `src/i18n/en.ts` | Partial | Most UI strings are there. Some labels are still inline (for example in settings panels, and in `NowPanel`) |

## Screens (UI spec §3, §4)

| Surface | Status | Notes |
|---------|--------|-------|
| 3.1 Conversation: single column ≤760 px, centred, Now panel | Done | |
| 3.1 Route footer on every EDITH answer, clickable to detail | Done | `RouteFooter` and detail dialog |
| 3.1 Composer: Enter sends, Shift+Enter newline, explicit context toggle, voice, cancel while running | Done | Context toggle marks the message but reads no context |
| 3.1 Follow-up chip linked to a task | Done | Matches "continue that", "that task", etc. |
| 3.1 Task card collapsed by default | Done | |
| 3.1 Evidence card | Done | Sources are not linked; they are simulated references |
| 3.2 Push-to-talk (hold or toggle), live caption, level meter, mic indicator, speaking waveform and stop | Done | Simulated; no microphone opened |
| 3.2 Continuous listening mode | Not done | Listed as "later" in spec. The setting shows it, but it behaves as toggle |
| 3.3 Activity: sections 1–8 | Done | Objective, plan, route, tools, operations, errors, verification, completion |
| 3.3 Cancel, state filter, search within task | Done | |
| 3.3 Rollback of changed files | Not done | Button is disabled with the reason stated (needs the daemon) |
| 3.3 Link memories from a task | Not done | Disabled with the reason stated |
| 3.4 Settings: 14 sections in spec order, search by label | Done | Search matches title, purpose and field labels |
| 3.4 "Applies now" and "Needs daemon restart" labels | Done | Each field declares `apply` in `settingsSchema.ts`. Labels also include "Kept for this session" |
| 3.4 Destructive settings with confirmation | Done | Reset all, forget everything (type FORGET), memory delete |
| 3.5 Notifications: max two, auto-dismiss 6 s, no toast stack | Done | Notifications fire on task done, blocked and approval needed. The "only when window unfocused" rule is not implemented |
| 3.6 Overlay core, caption, two notifications, 320×420 panel | Done | Browser preview only (see below) |
| 3.6 Visibility modes and platform mode A/B/C | Partial | Preview shows the visibility choice. The platform mode is documented but cannot be detected in a browser |
| 3.6 Click-through, corner position, monitor memory | Not done | Native overlay only. Documented in the desktop doc, not built |
| 4.1 General: presets (Focused, Builder, Researcher, Quiet) | Not done | Preset control is not in the schema yet |
| 4.2–4.14 settings panels | Partial | Each section has its panel or fields. Several controls are display-only and are labelled as such |
| 4.5 Memory review queue, side-by-side contradictions | Done | Review tab in Memory |
| 4.6 MCP tool list, history of last 20 calls | Done | `McpServerCard`. Servers are sample configurations and stay stopped; history is empty because nothing is called |
| 4.7 Routing summary, table, fallback timeline, filters | Done | Counts cover this session only. No latency, success-rate or 24-hour figures: they were never measured. Model calls are 0 by construction |
| 4.9 Search: authority tiers add/remove, test query | Done | `SearchPanel` |
| 4.10 Policy matrix with locked cells | Done | Locked cells show a lock and the reason |
| 4.12 System: socket path with copy | Done | Shows `$XDG_RUNTIME_DIR/edith/api.sock` (0600) |
| 4.14 Logs: filters, trace view, redacted export preview | Done | Export is a preview only |

## States and feedback (UI spec §5)

| Rule | Status | Notes |
|------|--------|-------|
| Single subtle pulse for working | Done | |
| Amber approval card, task paused | Done | |
| Route chip amber when degraded | Partial | Provider health is amber in Activity and Routing. The route chip itself is not coloured |
| Red blocker card with next action | Partial | Blocker text shown. The "next action" wording is not generated |
| Offline model: deterministic tools only, no fake answers | Done | Replies say no model is connected |

## Accessibility (UI spec §8, design system §7)

| Item | Status | Notes |
|------|--------|-------|
| Visible focus ring | Done | `:focus-visible` outline |
| Landmarks: main, navigation, status bar | Done | Verified in component tests |
| Live regions: polite for progress, assertive for blockers and approvals | Done | Notifications use `role="alert"` for warn and error; the Now panel is `aria-live="polite"` |
| Labels on every control | Done | Tests query by accessible names |
| Contrast: text ≥ 4.5:1 | Not verified | Spec §3.1 says verify in the audit. No audit was run |
| axe checks in CI | Not done | `axe` is not in the test set |

## Testing (design system §8)

| Item | Status | Command |
|------|--------|---------|
| Node logic tests (7) | Done | `npm test` (first part) |
| Service tests (12): task lifecycle, approvals, policy, memory | Done | `npm run test:services` |
| Component tests (Vitest and Testing Library, 27): Core, composer, approval card, memory detail, overlay state, app routes | Done | `npm run test:ui` |
| Visual regression snapshots | Not done | Browser screenshots were taken for review. They were not added as snapshots |
| E2E (Playwright) | Not done | A headless Chromium run covered all routes with zero console errors |

## Browser check

Headless Chromium, 1440×900, all routes. Covered: conversation hero, a simulated research task to completion, a code task paused at approval and then approved, activity, memory explorer and review queue, capabilities, routing, settings (general, voice, autonomy), overlay. Result: zero console errors or page errors. Screenshots are outside the repository, in `/tmp/browser`.

## Open items

- Phase 12a and 12b headings in `docs/edith/EDITH_IMPLEMENTATION_ROADMAP.md` are still open.
- Desktop overlay (Tauri/Rust) cannot be built or verified in this sandbox because crates.io is blocked. It is documented, not built.

## Accuracy revision (2026-11-03)

This revision removed invented content and made the screens describe only what the prototype does.

| Area | Before | Now | Status |
|------|--------|-----|--------|
| Provider health | Ollama `up`, llama.cpp `down`, fixed probe times | `unknown` with the reason "not probed"; the browser has no provider client. Built-in utilities are `up` because they run in the browser | Done |
| Models | `loaded` toggles, invented sizes, "candidate" tags, 32K context on all | Published qwen3 catalogue from the Ollama page (sizes, context, tags). Status "not checked". Load is disabled with the reason | Done. Read as "load available models": loading needs a provider client, which this prototype lacks |
| Routing figures | 128 requests, 31% no-model share, 740 ms median, 24-hour fallbacks, success rates | Session counts only: routes, browser-answered, model calls (0), fallbacks. Success and latency show "Not measured" | Done |
| Route latency | Per-route milliseconds | Replaced by "Ran in browser" or "No model called" | Done |
| Orchestration | Not shown | `direct`, `deterministic` or `dag`, computed from the plan. Shows steps, widest level (max parallel) and approval gates in the task card, Activity and the chat reply | Done |
| Capabilities | Enabling showed "Ready" after a timer; invented history | Enabling shows "Unavailable: not started"; history starts empty; servers are labelled sample configurations | Done |
| Activity / audit / logs | Seeded events, a "Health OK" log, "connection refused", timeouts of 8 s | Empty at start; session start notes say what is not connected | Done |
| Evidence and sources | `spans` counts, invented dates | Only the verified fixed list with check dates; claims written from the page (see `SOURCES.md`) | Done |
| Overlay mode table | Always-on-top ratings presented as facts | Labelled as design targets, not verified | Done |
| Settings: search, system | "Robots.txt is always respected", socket "active" wording | Labelled as design intent; socket marked "designed, not observed" | Done |
| Model catalogue | Not present | `src/data/modelCatalog.ts`, with the source and check date on every row | Done |
| Orchestration on DAG tasks | Parallel width fixed by the scheduler (max 3) | Width derived from the dependency graph; test covers research = 3 | Done |
| Real model, search or MCP calls | None | None (unchanged). Probes never contact a host | Not applicable |
| Install/load models locally | Not possible | Not in the prototype; needs a provider client and the user's machine | Not done (manual step for the user) |
| Live preview check | Preview pages return "Preview Unavailable" to the fetch tool | Not checked from this environment | Not checked |

