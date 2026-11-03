// Settings schema for the Settings screen. Field defaults follow the spec where it gives a value.
// Prototype: values are held in memory only. Nothing is persisted and no daemon reads them.
import type { SettingsValues, SettingValue } from '../services/contracts';

export type FieldDef =
  | { key: string; label: string; help?: string; kind: 'toggle'; def: boolean }
  | { key: string; label: string; help?: string; kind: 'select'; def: string; options: [string, string][] }
  | { key: string; label: string; help?: string; kind: 'text'; def: string }
  | { key: string; label: string; help?: string; kind: 'number'; def: number; min: number; max: number; step?: number; unit?: string };

export interface SectionDef {
  id: string;
  title: string;
  purpose: string;
  /** Optional panel rendered in addition to the fields. */
  panel?: 'providers' | 'local-models' | 'routing' | 'mcp' | 'skills' | 'search' | 'autonomy' | 'tool-permissions' | 'system' | 'logs';
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'general', title: 'General', purpose: 'Owner profile, time zone and startup behaviour.',
    fields: [
      { key: 'ownerName', label: 'Owner name', kind: 'text', def: 'Owner' },
      { key: 'timezone', label: 'Time zone', kind: 'select', def: 'Asia/Dhaka', options: [['Asia/Dhaka', 'Asia/Dhaka (UTC+6)'], ['UTC', 'UTC'], ['Europe/London', 'Europe/London']], help: 'Used for time and date answers. Tier 0 reads this value.' },
      { key: 'preset', label: 'Preset', kind: 'select', def: 'builder', options: [['focused', 'Focused'], ['builder', 'Builder'], ['researcher', 'Researcher'], ['quiet', 'Quiet']], help: 'Presets change defaults only. They never widen permissions.' },
      { key: 'startAtLogin', label: 'Start at login', kind: 'toggle', def: true },
      { key: 'closeToTray', label: 'Keep running when the window closes', kind: 'toggle', def: true },
    ],
  },
  {
    id: 'providers', title: 'Model providers', purpose: 'Which model servers EDITH may call, and what data each may receive.', panel: 'providers',
    fields: [
      { key: 'defaultLocal', label: 'Default local provider', kind: 'select', def: 'ollama', options: [['ollama', 'Ollama'], ['llama_cpp', 'llama.cpp server']] },
      { key: 'allowCloud', label: 'Allow cloud model providers', kind: 'toggle', def: false, help: 'Off by default. Turning it on still requires per-provider consent.' },
      { key: 'cloudDailyLimit', label: 'Cloud spend limit per day', kind: 'number', def: 0, min: 0, max: 50, unit: 'USD' },
    ],
  },
  {
    id: 'local-models', title: 'Local models', purpose: 'Local model residency and queueing. Model sizes are candidates until gate G1 closes.', panel: 'local-models',
    fields: [
      { key: 'keepWarmMinutes', label: 'Keep models loaded after use', kind: 'number', def: 10, min: 0, max: 120, unit: 'min' },
      { key: 'maxQueueDepth', label: 'Maximum queued model calls', kind: 'number', def: 4, min: 1, max: 16 },
    ],
  },
  {
    id: 'routing', title: 'Routing', purpose: 'Escalation and fallback behaviour. Tier table is in the Routing screen.', panel: 'routing',
    fields: [
      { key: 'tier1Confidence', label: 'Tier 1 confidence threshold', kind: 'number', def: 0.75, min: 0.5, max: 0.95, step: 0.05, help: 'Hypothesis; measured against the router evaluation set.' },
      { key: 'cloudEscalation', label: 'Cloud escalation', kind: 'select', def: 'ask', options: [['off', 'Off'], ['ask', 'Ask per task'], ['always_tier3', 'Always for Tier 3 (requires consent)']] },
    ],
  },
  {
    id: 'voice', title: 'Voice', purpose: 'Listening mode, speech output and barge-in. The prototype never opens a microphone.',
    fields: [
      { key: 'listenMode', label: 'Listening mode', kind: 'select', def: 'push', options: [['push', 'Push to talk'], ['toggle', 'Toggle'], ['continuous', 'Continuous (not in v1)']], help: 'Continuous listening is deferred. See security policy.' },
      { key: 'speakReplies', label: 'Speak replies aloud', kind: 'toggle', def: true },
      { key: 'bargeIn', label: 'Allow interrupting speech', kind: 'toggle', def: true, help: 'Needs echo protection to be reliable. Gate G5.' },
      { key: 'diagnosticRecording', label: 'Keep voice diagnostics', kind: 'toggle', def: false, help: 'Off by default. Raw audio is never kept unless you turn this on.' },
    ],
  },
  {
    id: 'memory', title: 'Memory', purpose: 'What EDITH remembers, how long, and what it may use in answers.',
    fields: [
      { key: 'autoExtract', label: 'Propose memories from conversation', kind: 'toggle', def: true, help: 'Proposed items wait for review. Nothing is silently saved as fact.' },
      { key: 'useInferred', label: 'Allow unconfirmed inferred memory in answers', kind: 'toggle', def: false },
      { key: 'workingTtlHours', label: 'Working memory lifetime', kind: 'number', def: 24, min: 1, max: 168, unit: 'h' },
      { key: 'inferredReviewDays', label: 'Review unconfirmed inferred memory after', kind: 'number', def: 180, min: 30, max: 365, unit: 'days' },
    ],
  },
  {
    id: 'mcp', title: 'MCP servers', purpose: 'Tool servers EDITH can use. Enable or disable them in Capabilities.', panel: 'mcp',
    fields: [
      { key: 'startLazily', label: 'Start servers only when needed', kind: 'toggle', def: true },
      { key: 'maxRestarts', label: 'Maximum automatic restarts', kind: 'number', def: 5, min: 0, max: 20 },
    ],
  },
  {
    id: 'skills', title: 'Skills', purpose: 'Instruction packs. Skills guide the model; they do not enforce anything.', panel: 'skills',
    fields: [
      { key: 'autoSelect', label: 'Select skills automatically', kind: 'toggle', def: true },
      { key: 'maxInContext', label: 'Maximum skills per task', kind: 'number', def: 3, min: 1, max: 8 },
    ],
  },
  {
    id: 'search', title: 'Search', purpose: 'Search providers and fetch limits. Results come from a simulated bank in this prototype.', panel: 'search',
    fields: [
      { key: 'providerOrder', label: 'Provider order', kind: 'select', def: 'searxng', options: [['searxng', 'SearXNG first'], ['direct', 'Direct source fetch only']] },
      { key: 'cacheHours', label: 'Cache results for', kind: 'number', def: 24, min: 0, max: 168, unit: 'h' },
      { key: 'maxFetches', label: 'Fetches per task', kind: 'number', def: 12, min: 1, max: 200 },
    ],
  },
  {
    id: 'autonomy', title: 'Autonomy', purpose: 'Confirmation rules per action class. Locked rules cannot be changed.', panel: 'autonomy',
    fields: [
      { key: 'batchConfirms', label: 'Batch related confirmations', kind: 'toggle', def: true, help: 'Batching never hides which files or hosts are affected.' },
    ],
  },
  {
    id: 'tool-permissions', title: 'Tool permissions', purpose: 'Native tools and their permission class.', panel: 'tool-permissions',
    fields: [],
  },
  {
    id: 'system', title: 'System', purpose: 'Daemon, overlay and platform facts.', panel: 'system',
    fields: [
      { key: 'overlayMode', label: 'Overlay mode', kind: 'select', def: 'auto', options: [['auto', 'Automatic (recommended)'], ['layer', 'Layer surface (where supported)'], ['xwayland', 'XWayland always-on-top'], ['window', 'Plain window']], help: 'Automatic picks the best available mode at start. Gate G3.' },
      { key: 'logLevel', label: 'Log level', kind: 'select', def: 'info', options: [['debug', 'Debug'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Error']] },
    ],
  },
  {
    id: 'appearance', title: 'Appearance', purpose: 'Theme, density and accessibility. Applies immediately.',
    fields: [
      { key: 'theme', label: 'Theme', kind: 'select', def: 'dark', options: [['dark', 'Dark'], ['light', 'Light']] },
      { key: 'accent', label: 'Accent', kind: 'select', def: 'cyan', options: [['cyan', 'Cyan'], ['blue', 'Blue'], ['neutral', 'Neutral']] },
      { key: 'density', label: 'Density', kind: 'select', def: 'comfortable', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
      { key: 'fontScale', label: 'Text size', kind: 'number', def: 100, min: 90, max: 130, step: 5, unit: '%' },
      { key: 'reducedMotion', label: 'Reduce motion', kind: 'toggle', def: false },
    ],
  },
  {
    id: 'logs', title: 'Logs', purpose: 'Diagnostics. The export preview contains simulated entries only.', panel: 'logs',
    fields: [],
  },
];

export function defaultSettings(): SettingsValues {
  const out: SettingsValues = {};
  for (const section of SECTIONS) {
    const values: Record<string, SettingValue> = {};
    for (const f of section.fields) values[f.key] = f.def;
    out[section.id] = values;
  }
  return out;
}
