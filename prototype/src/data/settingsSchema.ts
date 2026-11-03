// Settings schema. Field defaults follow the spec where it gives a value.
// Prototype: values are held in memory for this browser session only. No daemon reads them.
// Each field declares how it would apply in the real system: "now" (takes effect immediately),
// "session" (kept for this session only), or "restart" (needs a daemon restart).
import type { SettingsValues, SettingValue } from '../services/contracts';

export type Apply = 'now' | 'session' | 'restart';

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  apply: Apply;
}

export type FieldDef =
  | (FieldBase & { kind: 'toggle'; def: boolean })
  | (FieldBase & { kind: 'select'; def: string; options: [string, string][] })
  | (FieldBase & { kind: 'text'; def: string })
  | (FieldBase & { kind: 'number'; def: number; min: number; max: number; step?: number; unit?: string });

export type PanelId =
  | 'general' | 'providers' | 'local-models' | 'routing' | 'voice' | 'memory' | 'mcp' | 'skills'
  | 'search' | 'autonomy' | 'tool-permissions' | 'system' | 'appearance' | 'logs';

export interface SectionDef {
  id: string;
  title: string;
  purpose: string;
  panel?: PanelId;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'general', title: 'General', purpose: 'Owner profile, time zone, startup and the behaviour preset.', panel: 'general',
    fields: [
      { key: 'ownerName', label: 'Owner name', kind: 'text', def: 'Owner', apply: 'now', help: 'Used only as a display label.' },
      { key: 'timezone', label: 'Time zone', kind: 'select', def: 'Asia/Dhaka', apply: 'now', options: [['Asia/Dhaka', 'Asia/Dhaka (UTC+6)'], ['UTC', 'UTC'], ['Europe/London', 'Europe/London']], help: 'Tier 0 time and date answers read this value.' },
      { key: 'language', label: 'Interface language', kind: 'select', def: 'en', apply: 'now', options: [['en', 'English (v1)']], help: 'Only English is available in v1.' },
      { key: 'startAtLogin', label: 'Start at login', kind: 'toggle', def: true, apply: 'restart' },
      { key: 'closeToTray', label: 'Keep running when the window closes', kind: 'toggle', def: true, apply: 'restart' },
    ],
  },
  {
    id: 'providers', title: 'Model providers', purpose: 'Which model servers EDITH may call, and what data each may receive.', panel: 'providers',
    fields: [
      { key: 'defaultLocal', label: 'Default local provider', kind: 'select', def: 'ollama', apply: 'session', options: [['ollama', 'Ollama'], ['llama_cpp', 'llama.cpp server']] },
      { key: 'allowCloud', label: 'Allow cloud model providers', kind: 'toggle', def: false, apply: 'session', help: 'Off by default. Each provider still needs its own consent.' },
      { key: 'cloudDailyLimit', label: 'Cloud spend limit per day', kind: 'number', def: 0, min: 0, max: 50, unit: 'USD', apply: 'session' },
    ],
  },
  {
    id: 'local-models', title: 'Local models', purpose: 'Installed models, residency and defaults. Sizes and names are candidates until gate G1 closes.', panel: 'local-models',
    fields: [
      { key: 'keepWarmMinutes', label: 'Keep models loaded after use', kind: 'number', def: 10, min: 0, max: 120, unit: 'min', apply: 'session' },
      { key: 'maxQueueDepth', label: 'Maximum queued model calls', kind: 'number', def: 4, min: 1, max: 16, apply: 'session' },
    ],
  },
  {
    id: 'routing', title: 'Model routing', purpose: 'Escalation and cloud policy. The tier table and route tester are on the Routing screen.', panel: 'routing',
    fields: [
      { key: 'tier1Confidence', label: 'Tier 1 confidence threshold', kind: 'number', def: 0.75, min: 0.5, max: 0.95, step: 0.05, apply: 'session', help: 'Hypothesis; to be measured against the router evaluation set.' },
      { key: 'cloudEscalation', label: 'Cloud escalation', kind: 'select', def: 'ask', apply: 'session', options: [['off', 'Off'], ['ask', 'Ask per task'], ['always_tier3', 'Always for Tier 3 (requires consent)']] },
    ],
  },
  {
    id: 'voice', title: 'Voice', purpose: 'Input and output devices, recognition engine, barge-in and privacy. The prototype never opens a microphone.', panel: 'voice',
    fields: [
      { key: 'listenMode', label: 'Listening mode', kind: 'select', def: 'push', apply: 'session', options: [['push', 'Push to talk (default)'], ['toggle', 'Toggle'], ['continuous', 'Continuous (later)']], help: 'Continuous listening is deferred. See the security policy.' },
      { key: 'speakReplies', label: 'Speak replies aloud', kind: 'toggle', def: true, apply: 'session' },
      { key: 'bargeIn', label: 'Allow interrupting speech', kind: 'toggle', def: true, apply: 'session', help: 'Reliable barge-in needs echo protection. Gate G5.' },
      { key: 'languageHint', label: 'Language hint', kind: 'select', def: 'en-US', apply: 'session', options: [['en-US', 'English (US)'], ['bn-BD', 'Bangla (Bangladesh)'], ['auto', 'Automatic']] },
      { key: 'speakingRate', label: 'Speaking rate', kind: 'number', def: 100, min: 60, max: 160, step: 5, unit: '%', apply: 'session' },
      { key: 'diagnosticRecording', label: 'Keep voice diagnostics', kind: 'toggle', def: false, apply: 'session', help: 'Off by default. Raw audio is never kept unless you turn this on.' },
    ],
  },
  {
    id: 'memory', title: 'Memory', purpose: 'What EDITH remembers, how long it lasts, and what answers may use. Browse items in the Memory explorer.', panel: 'memory',
    fields: [
      { key: 'autoExtract', label: 'Propose memories from conversation', kind: 'toggle', def: true, apply: 'session', help: 'Proposed items wait for review. Nothing is silently saved as fact.' },
      { key: 'useInferred', label: 'Allow unconfirmed inferred memory in answers', kind: 'toggle', def: false, apply: 'session' },
      { key: 'workingTtlHours', label: 'Working memory lifetime', kind: 'number', def: 24, min: 1, max: 168, unit: 'h', apply: 'session' },
      { key: 'inferredReviewDays', label: 'Review unconfirmed inferred memory after', kind: 'number', def: 180, min: 30, max: 365, unit: 'days', apply: 'session' },
    ],
  },
  {
    id: 'mcp', title: 'MCP integrations', purpose: 'Tool servers EDITH can use. Enable servers and tools in Capabilities.', panel: 'mcp',
    fields: [
      { key: 'startLazily', label: 'Start servers only when needed', kind: 'toggle', def: true, apply: 'session' },
      { key: 'maxRestarts', label: 'Maximum automatic restarts', kind: 'number', def: 5, min: 0, max: 20, apply: 'session' },
    ],
  },
  {
    id: 'skills', title: 'Skills', purpose: 'Instruction packs. Skills guide the model; they do not enforce anything. Manage them in Capabilities.', panel: 'skills',
    fields: [
      { key: 'autoSelect', label: 'Select skills automatically', kind: 'toggle', def: true, apply: 'session' },
      { key: 'maxInContext', label: 'Maximum skills per task', kind: 'number', def: 3, min: 1, max: 8, apply: 'session' },
    ],
  },
  {
    id: 'search', title: 'Search', purpose: 'Search providers, authority tiers and fetch limits. Results come from a simulated reference bank.', panel: 'search',
    fields: [
      { key: 'providerOrder', label: 'Provider order', kind: 'select', def: 'searxng', apply: 'session', options: [['searxng', 'SearXNG first'], ['direct', 'Direct source fetch only']] },
      { key: 'cacheHours', label: 'Cache results for', kind: 'number', def: 24, min: 0, max: 168, unit: 'h', apply: 'session' },
      { key: 'maxFetches', label: 'Fetches per task', kind: 'number', def: 12, min: 1, max: 200, apply: 'session' },
      { key: 'fetchTimeout', label: 'Fetch timeout', kind: 'number', def: 8, min: 1, max: 60, unit: 's', apply: 'session' },
    ],
  },
  {
    id: 'autonomy', title: 'Autonomy and permissions', purpose: 'Confirmation rules per action class, per-task limits, and trusted grants. Locked rules cannot be changed.', panel: 'autonomy',
    fields: [
      { key: 'batchConfirms', label: 'Batch related confirmations', kind: 'toggle', def: true, apply: 'session', help: 'Batching never hides which files or hosts are affected.' },
    ],
  },
  {
    id: 'tool-permissions', title: 'Tool permissions', purpose: 'Native tools and their permission class. Overrides link to the rule that governs them.', panel: 'tool-permissions',
    fields: [],
  },
  {
    id: 'system', title: 'System', purpose: 'Daemon, socket, overlay mode and platform facts. Read-only where the prototype cannot observe the platform.', panel: 'system',
    fields: [
      { key: 'overlayMode', label: 'Overlay mode preference', kind: 'select', def: 'auto', apply: 'restart', options: [['auto', 'Automatic (recommended)'], ['A', 'A — layer surface (where supported)'], ['B', 'B — XWayland window'], ['C', 'C — normal window (fallback)']], help: 'Automatic picks the best mode available at start. Gate G3.' },
      { key: 'autostart', label: 'Start the daemon at login', kind: 'toggle', def: true, apply: 'restart' },
      { key: 'logLevel', label: 'Log level', kind: 'select', def: 'info', apply: 'now', options: [['debug', 'Debug'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Error']] },
    ],
  },
  {
    id: 'appearance', title: 'Theme and appearance', purpose: 'Theme, accent, density, motion and text size. Applies immediately.', panel: 'appearance',
    fields: [
      { key: 'theme', label: 'Theme', kind: 'select', def: 'dark', apply: 'now', options: [['dark', 'Dark (default)'], ['light', 'Light'], ['system', 'Follow system']] },
      { key: 'accent', label: 'Accent', kind: 'select', def: 'cyan', apply: 'now', options: [['cyan', 'Cyan (default)'], ['blue', 'Blue'], ['neutral', 'Neutral'], ['ember', 'Ember (amber)']] },
      { key: 'density', label: 'Density', kind: 'select', def: 'comfortable', apply: 'now', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
      { key: 'fontScale', label: 'Text size', kind: 'number', def: 100, min: 90, max: 130, step: 5, unit: '%', apply: 'now' },
      { key: 'reducedMotion', label: 'Reduce motion', kind: 'toggle', def: false, apply: 'now', help: 'Stops continuous animation; state changes use colour and text.' },
    ],
  },
  {
    id: 'logs', title: 'Logs and diagnostics', purpose: 'Log stream, task traces and the diagnostic export preview. The export preview lists exactly what is removed.', panel: 'logs',
    fields: [
      { key: 'logPause', label: 'Pause log stream', kind: 'toggle', def: false, apply: 'now' },
    ],
  },
];

export function defaultSettings(): SettingsValues {
  const out: SettingsValues = {};
  for (const section of SECTIONS) {
    const values: Record<string, SettingValue> = {};
    for (const f of section.fields) values[f.key] = f.def;
    out[section.id] = values;
  }
  // Lists used by the panels. They are plain values so they go through the same store.
  out.search.authorityDomains = ['github.com|1', 'spec.modelcontextprotocol.io|1', 'ai.google.dev|1', 'code.claude.com|1', 'huggingface.co|2'];
  out.voice.vocabulary = ['EDITH', 'rmcp', 'Qwen3', 'Dhaka'];
  out.search.providerList = ['searxng', 'direct fetch'];
  return out;
}

export const APPLY_LABEL: Record<Apply, string> = {
  now: 'Applies now',
  session: 'Kept for this session',
  restart: 'Needs daemon restart',
};
