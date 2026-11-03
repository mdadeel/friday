# EDITH prototype (simulated)

An interactive web prototype of the EDITH screens described in `docs/edith/`.
**Every capability is simulated.** No model, microphone, search engine, MCP server, file system or device is used.

## What it shows

| Screen | Spec | Simulated behaviour |
|---|---|---|
| Conversation | UI_UX §3.1 | Tier 0 answers (time in Asia/Dhaka, safe arithmetic) run locally. "Who am I?" uses only explicit or confirmed memory. Research and code requests start a simulated task. Other requests get a clearly labelled "no model connected" reply. Push-to-talk reveals a canned phrase; no microphone is opened. |
| Activity | UI_UX §3.3 | Task lifecycle, plan with dependencies, parallel-limited execution, approval gate, verification verdicts, event log. |
| Memory | UI_UX §3.4 | Filter, review, edit, confirm, reject, delete. Conflicts supersede each other. Inferred items stay out of answers unless confirmed. |
| Capabilities | UI_UX §3.5 | MCP server states and per-tool toggles; skills with content-hash re-approval. |
| Routing | UI_UX §3.7 | Tier table, provider probes (fixed results, no network), route tester (preview only), recent routes and events. |
| Settings | UI_UX §3.8 | Sections from the spec, policy matrix with locked rules, limits, native-tool table, system facts, logs and export preview. |
| Overlay | UI_UX §3.6 | Same-tab preview of the overlay states. The desktop overlay (layer surface, XWayland, plain window) is not implemented. |

## Structure

- `src/types/contracts.ts`: DTOs that mirror `docs/edith/EDITH_API_AND_EVENT_CONTRACTS.md`. Simulated objects carry `simulated: true`.
- `src/services/contracts.ts`: service interfaces the UI depends on. A real daemon adapter would implement the same interfaces.
- `src/services/mock/`: simulated implementations. `logic.ts` holds the pure rules (Tier 0 matcher, safe calculator, intent classifier, plans); the other files hold stateful services.
- `src/services/store.ts`: small observable store used with `useSyncExternalStore`.
- `src/data/`: seed records and the settings schema. All seed data is fictional.
- `src/screens/`, `src/components/`: React screens and shared UI.
- `src/styles/`: design tokens (dark and light themes, accents, density) and layout.
- `tests/`: logic tests (`node --test`) and service lifecycle tests (bundled with esbuild, Node mock timers).

## Commands

```bash
npm install
npm run dev        # http://0.0.0.0:5173
npm run typecheck
npm test           # logic + service tests
npm run build      # typecheck + production build to dist/
```

## Limits

- State lives in memory only. Reloading the page resets everything.
- Settings, policy edits, memory edits and route changes are not persisted and are not enforced.
- Timings (latency, first-token, search p50/p95) are fixed illustrative numbers, not measurements.
- Model names marked "candidate" depend on gate G1 in the roadmap.
- The Tier 0 calculator is a restricted parser for `+ - * / % ^`, parentheses and decimals. It does not call `eval`.


## Redesign status

The UI was rebuilt in the redesign pass. The screens, components and token mapping are listed in `CONFORMANCE.md`, which records what is done, partial or not done against the UI spec and design system. Run the checks with `npm run typecheck`, `npm test`, and `npm run build`. Component tests use Vitest and Testing Library (`npm run test:ui`).
