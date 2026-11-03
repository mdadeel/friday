# EDITH — Frontend Design System

Companion: [UI_UX](EDITH_UI_UX_SPECIFICATION.md) · [API_AND_EVENT_CONTRACTS](EDITH_API_AND_EVENT_CONTRACTS.md) · [TECHNOLOGY_DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md) D15–D17, D24

## 1. Visual direction

Premium desktop software with a quiet intelligence aesthetic. The product must feel operationally serious. Atmosphere comes from restraint: deep charcoal surfaces, precise cyan highlights used sparingly, thin separators, generous type hierarchy, and motion that explains state.

Avoid: generic SaaS card grids, saturated gradients, decorative neon borders, glow on every element, chat-bubble clichés, emoji as iconography.

## 2. Stack

- React 18+ with TypeScript (strict mode).
- Vite for dev server and build.
- CSS custom properties from a single tokens file; plain CSS modules or a single stylesheet organised by layer.
- Icons: a single consistent stroke icon set (inline SVG components in the prototype).
- No UI component framework in v1; components are built to the rules below so that a framework can be adopted later if needed.

## 3. Tokens

### 3.1 Colour (dark theme, default)

| Token | Value | Use |
|-------|-------|-----|
| `--surface-0` | `#0B0D10` | App background |
| `--surface-1` | `#12151A` | Sidebar, panels |
| `--surface-2` | `#1A1E25` | Inputs, raised rows |
| `--surface-3` | `#232933` | Hover, selected |
| `--line-1` | `rgba(255,255,255,0.08)` | Separators |
| `--line-2` | `rgba(255,255,255,0.14)` | Input borders |
| `--text-1` | `#E8ECF2` | Primary text |
| `--text-2` | `#A4ADBB` | Secondary text |
| `--text-3` | `#6B7487` | Tertiary, metadata |
| `--accent` | `#4FC3E0` | Primary accent (cyan) |
| `--accent-2` | `#6C8CFF` | Secondary accent (blue) |
| `--ok` | `#4CC38A` | Success |
| `--warn` | `#E0B04F` | Degraded, approval needed |
| `--error` | `#E06C6C` | Failure, blocked |
| `--sim` | `#B58CFF` | SIMULATED label only |

Contrast: text-1 on surface-0 ≈ 16:1; text-2 ≈ 8:1; text-3 ≈ 4.6:1 (meets AA for body text on surface-0 and surface-1 — verify in prototype audit).

Light theme: defined in the same token file with inverted surfaces and darker accents; not shipped in the prototype beyond the token definition.

### 3.2 Typography

- UI font: system stack (`Inter` if installed, else `system-ui`, `Cantarell` on GNOME).
- Monospace: `JetBrains Mono` if installed, else `ui-monospace`.
- Scale (px): 11 (meta), 13 (body small), 14 (body), 16 (lead), 20 (section), 28 (display).
- Line height: 1.5 body, 1.2 display. Letter spacing: +0.02em on uppercase labels only.

### 3.3 Space, radius, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Radius: 6 (controls), 10 (panels), 14 (overlay panel). No radius above 14.
- Elevation: one shadow token for floating panels; separators preferred to shadows.

### 3.4 Motion

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| `--motion-fast` | 120 ms | ease-out | Hover, toggles |
| `--motion-base` | 200 ms | cubic-bezier(.2,.8,.2,1) | Panel open, list changes |
| `--motion-slow` | 420 ms | cubic-bezier(.2,.8,.2,1) | Overlay state transitions |
| Core loops | 2.4–8 s | linear / ease-in-out | Overlay idle, thinking |

Reduced motion: all loops stop; state changes use colour and label only.

### 3.5 Effects

- Glass effect: `backdrop-filter` only on the settings sidebar and overlay panel, with a solid fallback. Overlay avoids blur over transparent regions (reported rendering issue).
- Glow: only on the overlay core and the active-state dot. Maximum opacity 0.35.

## 4. Components

| Component | Purpose | Notes |
|-----------|---------|-------|
| `AppShell` | Layout: rail, content, status bar | Status bar shows daemon, model route, mic state, SIMULATED label |
| `Rail` | Main navigation | Keyboard navigable; labels visible |
| `SimBadge` | Marks simulated data | Always present when mock data is shown |
| `StatusDot` | State colour and text | Never colour alone |
| `Badge` | Provenance, kind, autonomy, tier | Text required |
| `Chip` | Route footer items | Clickable where it opens detail |
| `Card` | Only for task and approval items | Not used for layout grids |
| `Table` | Dense data (routing, audit) | Sticky header; row hover |
| `Toggle`, `Select`, `Slider`, `TextField` | Settings controls | Labelled; keyboard |
| `Tabs` | Within sections | Arrow-key navigation |
| `Dialog` | Confirmations | Focus trap; `Esc` closes |
| `Timeline` | Task events | Human-readable entries |
| `Meter` | Level and confidence | Non-animated fallback |
| `Core` | Overlay visualisation | SVG and CSS; four states |
| `ChatMessage` | Conversation messages | Route footer; streaming cursor |
| `ApprovalCard` | Confirmation request | Preview; approve once, task, or project scope |
| `EvidenceCard` | Sources and spans | Shows authority tier and date |

## 5. State and data flow

- **Service layer:** typed interfaces (`ServiceContracts`) for each domain: `TaskService`, `ConversationService`, `RoutingService`, `MemoryService`, `CapabilityService`, `PolicyService`, `SettingsService`, `VoiceService`, `SearchService`, `DiagnosticsService`, `EventService`.
- **Adapters:** `MockAdapters` (prototype) and `DaemonAdapters` (later) implement the same interfaces. Components import only the interfaces, obtained through a React context provider.
- **Store:** a small external store (Zustand-class) per domain with selectors. Event subscription updates the store; components never subscribe directly.
- **Optimistic updates:** only for local settings; all task and policy changes wait for the daemon's confirmation event.

## 6. Event handling

- `EventService.subscribe(filter, handler)` returns an unsubscribe function.
- The UI reconciles on `lagged`: refetches affected resources.
- Event payloads are validated at the boundary with runtime type guards in development builds.

## 7. Accessibility rules

- Every interactive element has an accessible name.
- Focus order follows visual order; no focus traps except dialogs.
- Live regions: `aria-live="polite"` for task progress; `assertive` for blockers and approvals.
- Form fields have visible labels; helper text is linked with `aria-describedby`.

## 8. Testing

- Component tests (Vitest + Testing Library) for controls and state badges.
- Visual regression snapshots for the overlay states and the activity center.
- E2E (Playwright) for: conversation with simulated task, approval flow, memory edit, settings change persistence in session, MCP toggle.
- Accessibility checks with axe in CI.

## 9. Project conventions

- File naming: `PascalCase.tsx` for components; `camelCase.ts` for services; `kebab-case.css` for styles.
- One component per file; colocate tests as `*.test.tsx`.
- No inline colours; use tokens.
- Strings: centralised in `src/i18n/en.ts` to ease localisation later.
