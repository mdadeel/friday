// Demo data. Every record is SIMULATED. Nothing here reflects a real device, model, server or memory.
import type {
  AuditEntry,
  CategoryStat,
  LocalModel,
  LogEntry,
  McpServer,
  MemoryItem,
  PolicyRule,
  ProviderInfo,
  RouteInfo,
  RoutingEvent,
  Skill,
  TierConfig,
  TrustGrant,
} from '../types/contracts';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const mem = (over: Partial<MemoryItem> & Pick<MemoryItem, 'id' | 'category' | 'content' | 'provenance' | 'status'>): MemoryItem => ({
  confidence: 0.8,
  importance: 0.5,
  userConfirmed: false,
  sources: [],
  related: [],
  history: [],
  createdAt: ago(10 * DAY),
  updatedAt: ago(10 * DAY),
  version: 1,
  simulated: true,
  ...over,
});

export function seedMemory(): MemoryItem[] {
  return [
    mem({ id: 'mem-01', category: 'semantic', content: "Owner's timezone is Asia/Dhaka.", provenance: 'explicit', confidence: 0.95, importance: 0.8, userConfirmed: true, status: 'active', sources: ['turn:setup-03'], related: ['mem-02'], createdAt: ago(40 * DAY), updatedAt: ago(40 * DAY) }),
    mem({ id: 'mem-02', category: 'semantic', content: 'Owner works mainly with Rust and TypeScript.', provenance: 'explicit', confidence: 0.9, importance: 0.7, status: 'active', sources: ['turn:setup-05'], related: ['mem-12'], createdAt: ago(38 * DAY), updatedAt: ago(38 * DAY) }),
    mem({ id: 'mem-03', category: 'semantic', content: 'Owner prefers short, direct answers.', provenance: 'inferred', confidence: 0.62, importance: 0.5, status: 'active', sources: ['turn:17', 'turn:22', 'turn:31'], createdAt: ago(20 * DAY), updatedAt: ago(3 * DAY) }),
    mem({ id: 'mem-04', category: 'semantic', content: 'Owner usually works in the evening.', provenance: 'inferred', confidence: 0.45, importance: 0.3, status: 'pending_review', sources: ['task-history:14 sessions'], createdAt: ago(12 * DAY), updatedAt: ago(12 * DAY) }),
    mem({ id: 'mem-05', category: 'semantic', content: "Owner's desktop runs GNOME on Wayland.", provenance: 'assumption', confidence: 0.5, importance: 0.6, status: 'active', sources: ['design-default'], createdAt: ago(30 * DAY), updatedAt: ago(30 * DAY) }),
    mem({ id: 'mem-06', category: 'semantic', content: 'Desktop shell is planned as Electron.', provenance: 'outdated', confidence: 0.3, importance: 0.2, status: 'superseded', sources: ['design-draft-1'], createdAt: ago(25 * DAY), updatedAt: ago(9 * DAY), version: 2, history: [{ version: 1, content: 'Desktop shell is planned as Electron (draft).', at: ago(25 * DAY) }] }),
    mem({ id: 'mem-07', category: 'semantic', content: 'Preferred listening mode is continuous.', provenance: 'explicit', confidence: 0.8, importance: 0.5, status: 'pending_review', sources: ['turn:88'], conflictsWith: 'mem-08', createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY) }),
    mem({ id: 'mem-08', category: 'semantic', content: 'Preferred listening mode is push-to-talk.', provenance: 'explicit', confidence: 0.9, importance: 0.5, userConfirmed: true, status: 'pending_review', sources: ['turn:41'], conflictsWith: 'mem-07', createdAt: ago(18 * DAY), updatedAt: ago(18 * DAY) }),
    mem({ id: 'mem-09', category: 'episodic', content: 'Chose rmcp as the MCP SDK candidate after comparing the official SDK with forks.', provenance: 'explicit', confidence: 0.9, importance: 0.7, status: 'active', sources: ['task:research-mcp-sdk'], related: ['mem-02'], createdAt: ago(4 * DAY), updatedAt: ago(4 * DAY) }),
    mem({ id: 'mem-10', category: 'episodic', content: 'Drafted the EDITH blueprint documents and recorded open gates G1–G6.', provenance: 'explicit', confidence: 0.9, importance: 0.6, status: 'active', sources: ['task:blueprint'], related: ['mem-09'], createdAt: ago(1 * DAY), updatedAt: ago(1 * DAY) }),
    mem({ id: 'mem-11', category: 'working', content: 'Current objective: review voice architecture before benchmarking ASR.', provenance: 'temporary', confidence: 0.9, importance: 0.4, status: 'active', sources: ['session:current'], createdAt: ago(20 * MIN), updatedAt: ago(5 * MIN) }),
    mem({ id: 'mem-12', category: 'procedural', content: 'For Rust repositories: run cargo test, then cargo clippy, before reporting success.', provenance: 'inferred', confidence: 0.7, importance: 0.6, status: 'pending_review', sources: ['task:fix-parser', 'task:fix-cache'], createdAt: ago(6 * DAY), updatedAt: ago(6 * DAY) }),
  ];
}

export const seedProviders: ProviderInfo[] = [
  { id: 'native', name: 'Native Rust utilities', kind: 'native', endpoint: 'in-process', health: 'up', lastProbe: ago(10_000), consent: ['Public', 'Personal', 'Project'], models: [], simulated: true },
  { id: 'ollama', name: 'Ollama (local server)', kind: 'local_server', endpoint: 'http://127.0.0.1:11434 (example)', health: 'up', lastProbe: ago(20_000), consent: ['Public', 'Personal', 'Project'], models: ['qwen3 · 1.7B (candidate)', 'qwen3 · 8B (candidate)', 'qwen3 · 32B (candidate)'], simulated: true },
  { id: 'llama_cpp', name: 'llama.cpp server (local)', kind: 'local_server', endpoint: 'http://127.0.0.1:8080 (example)', health: 'down', lastProbe: ago(90_000), consent: ['Public', 'Personal', 'Project'], models: ['qwen3-8b.gguf (candidate)'], simulated: true },
  { id: 'cloud_llm', name: 'Cloud model provider', kind: 'cloud', endpoint: 'not configured', health: 'not_configured', lastProbe: ago(0), consent: [], models: [], simulated: true },
  { id: 'gemini_live', name: 'Gemini Live (speech, cloud)', kind: 'speech', endpoint: 'not configured — consent required', health: 'not_configured', lastProbe: ago(0), consent: [], models: [], simulated: true },
  { id: 'searxng', name: 'SearXNG (self-hosted search)', kind: 'search', endpoint: 'http://127.0.0.1:8888 (example)', health: 'degraded', lastProbe: ago(60_000), consent: ['Public'], models: [], simulated: true },
];

export const seedModels: LocalModel[] = [
  { id: 'm-q17', provider: 'ollama', name: 'qwen3 · 1.7B', sizeGB: 1.1, quant: 'Q4_K_M', contextTokens: 32768, toolCalling: 'unknown', loaded: false, simulated: true },
  { id: 'm-q8', provider: 'ollama', name: 'qwen3 · 8B', sizeGB: 5.2, quant: 'Q4_K_M', contextTokens: 32768, toolCalling: 'declared', loaded: true, simulated: true },
  { id: 'm-q32', provider: 'ollama', name: 'qwen3 · 32B', sizeGB: 20.0, quant: 'Q4_K_M', contextTokens: 32768, toolCalling: 'declared', loaded: false, simulated: true },
  { id: 'm-llcpp', provider: 'llama_cpp', name: 'qwen3-8b.gguf', sizeGB: 5.2, quant: 'Q5_K_M', contextTokens: 16384, toolCalling: 'unknown', loaded: false, simulated: true },
];

export const seedTiers: TierConfig[] = [
  { tier: 'T0', label: 'Deterministic', provider: 'native', model: '—', fallbacks: [] },
  { tier: 'T1', label: 'Light', provider: 'ollama', model: 'qwen3 · 1.7B (candidate)', fallbacks: ['rules'] },
  { tier: 'T2', label: 'General', provider: 'ollama', model: 'qwen3 · 8B (candidate)', fallbacks: ['llama_cpp'] },
  { tier: 'T3', label: 'Advanced', provider: 'ollama', model: 'qwen3 · 32B (candidate)', fallbacks: ['llama_cpp', 'T2'] },
  { tier: 'T4', label: 'Specialist', provider: 'searxng', model: 'speech: whisper.cpp (planned)', fallbacks: ['direct fetch'] },
];

export const seedCategories: CategoryStat[] = [
  { category: 'Deterministic (time, calc)', route: 'T0 · native', successRate: 1, medianMs: 3 },
  { category: 'Conversation', route: 'T2 · qwen3 8B', successRate: 0.97, medianMs: 1900 },
  { category: 'Personal memory', route: 'T2 · qwen3 8B', successRate: 0.94, medianMs: 1500 },
  { category: 'Research', route: 'T3 · qwen3 32B → T2', successRate: 0.82, medianMs: 48000 },
  { category: 'Coding', route: 'T3 · qwen3 32B → T2', successRate: 0.78, medianMs: 62000 },
  { category: 'Continuation', route: 'T2 · qwen3 8B', successRate: 0.9, medianMs: 2600 },
];

export const seedRoutingEvents: RoutingEvent[] = [
  { id: 'ev-1', at: ago(3_600_000), severity: 'warn', kind: 'degraded', text: 'llama.cpp server unreachable; T3 fallback chain skipped it (simulated).' },
  { id: 'ev-2', at: ago(7_200_000), severity: 'info', kind: 'route_change', text: 'Ollama model qwen3 · 32B loaded for research task (simulated).' },
  { id: 'ev-3', at: ago(9_000_000), severity: 'error', kind: 'fallback', text: 'SearXNG timeout after 8 s; direct source fetch used (simulated).' },
  { id: 'ev-4', at: ago(12_600_000), severity: 'info', kind: 'route_change', text: 'Routing rule updated: coding tasks escalate to T3 before T2 (simulated).' },
];

export const seedRecentRoutes: RouteInfo[] = [
  { id: 'rt-101', at: ago(120_000), tier: 'T0', provider: 'native', model: null, dataClass: 'Public', locality: 'Local', reason: 'Deterministic utility; no model call', fallbacks: [], latencyMs: 3, category: 'Deterministic', outcome: 'ok', simulated: true },
  { id: 'rt-102', at: ago(900_000), tier: 'T2', provider: 'ollama', model: 'qwen3 · 8B (candidate)', dataClass: 'Personal', locality: 'Local', reason: 'Memory-grounded answer; explicit facts only', fallbacks: ['llama_cpp'], latencyMs: 1480, category: 'Personal memory', outcome: 'ok', simulated: true },
  { id: 'rt-103', at: ago(3_600_000), tier: 'T3', provider: 'ollama', model: 'qwen3 · 32B (candidate)', dataClass: 'Project', locality: 'Local', reason: 'Multi-step research', fallbacks: ['llama_cpp', 'T2 local model'], latencyMs: 47210, category: 'Research', outcome: 'fallback', simulated: true },
  { id: 'rt-104', at: ago(5_400_000), tier: 'T2', provider: 'ollama', model: 'qwen3 · 8B (candidate)', dataClass: 'Project', locality: 'Local', reason: 'Coding task; context from the project', fallbacks: ['llama_cpp'], latencyMs: 2210, category: 'Coding', outcome: 'ok', simulated: true },
  { id: 'rt-105', at: ago(7_000_000), tier: 'T4', provider: 'searxng', model: null, dataClass: 'Public', locality: 'Local', reason: 'Public search query (Public class only)', fallbacks: ['direct fetch'], latencyMs: 8000, category: 'Research', outcome: 'failed', simulated: true },
];

export const seedRules: PolicyRule[] = [
  { id: 'r-read', group: 'Read files', scope: 'inside_project', autonomy: 'automatic', locked: false, explanation: 'Reading permitted project files.' },
  { id: 'r-read-home', group: 'Read files', scope: 'inside_home', autonomy: 'policy_controlled', locked: false, explanation: 'Outside the project, reads are limited to configured roots.' },
  { id: 'r-read-else', group: 'Read files', scope: 'elsewhere', autonomy: 'confirm_required', locked: false, explanation: 'Reads outside known roots need approval.' },
  { id: 'r-write', group: 'Write project files', scope: 'inside_project', autonomy: 'policy_controlled', locked: false, explanation: 'Writes inside the project are allowed up to the per-task file limit.' },
  { id: 'r-write-home', group: 'Write project files', scope: 'inside_home', autonomy: 'confirm_required', locked: false, explanation: 'Writes outside the project need approval.' },
  { id: 'r-write-else', group: 'Write project files', scope: 'elsewhere', autonomy: 'blocked', locked: true, explanation: 'Blocked in v1. Writes to system paths are never allowed.' },
  { id: 'r-cmd', group: 'Run allowlisted commands', scope: 'inside_project', autonomy: 'automatic', locked: false, explanation: 'Typed templates only (git, cargo, npm test). No shell.' },
  { id: 'r-cmd-home', group: 'Run allowlisted commands', scope: 'inside_home', autonomy: 'policy_controlled', locked: false, explanation: 'Same templates, outside the project root.' },
  { id: 'r-cmd-else', group: 'Run allowlisted commands', scope: 'elsewhere', autonomy: 'confirm_required', locked: false, explanation: 'Unknown working directories need approval.' },
  { id: 'r-net-read', group: 'Network read (search, fetch)', scope: 'inside_project', autonomy: 'automatic', locked: false, explanation: 'Search and fetch with limits and robots handling.' },
  { id: 'r-net-read-home', group: 'Network read (search, fetch)', scope: 'inside_home', autonomy: 'automatic', locked: false, explanation: 'Same limits.' },
  { id: 'r-net-read-else', group: 'Network read (search, fetch)', scope: 'elsewhere', autonomy: 'policy_controlled', locked: false, explanation: 'Non-allowlisted hosts require policy approval.' },
  { id: 'r-net-write', group: 'Network write (send, post)', scope: 'inside_project', autonomy: 'confirm_required', locked: false, explanation: 'Any outbound write needs approval.' },
  { id: 'r-net-write-home', group: 'Network write (send, post)', scope: 'inside_home', autonomy: 'confirm_required', locked: false, explanation: 'Sending external communications is always confirmed.' },
  { id: 'r-net-write-else', group: 'Network write (send, post)', scope: 'elsewhere', autonomy: 'blocked', locked: true, explanation: 'Blocked when unattended in v1.' },
  { id: 'r-install', group: 'Install dependencies', scope: 'inside_project', autonomy: 'policy_controlled', locked: false, explanation: 'Only from lockfile-declared managers.' },
  { id: 'r-install-home', group: 'Install dependencies', scope: 'inside_home', autonomy: 'confirm_required', locked: false, explanation: 'Global installs need approval.' },
  { id: 'r-install-else', group: 'Install dependencies', scope: 'elsewhere', autonomy: 'blocked', locked: true, explanation: 'Blocked in v1.' },
  { id: 'r-delete', group: 'Delete files', scope: 'inside_project', autonomy: 'confirm_required', locked: false, explanation: 'Deletions always show a preview.' },
  { id: 'r-delete-home', group: 'Delete files', scope: 'inside_home', autonomy: 'confirm_required', locked: false, explanation: 'Deletions always show a preview.' },
  { id: 'r-delete-else', group: 'Delete files', scope: 'elsewhere', autonomy: 'blocked', locked: true, explanation: 'Deleting large directories or system paths is blocked.' },
  { id: 'r-system', group: 'System changes', scope: 'inside_project', autonomy: 'blocked', locked: true, explanation: 'Privileged commands and system settings are blocked in v1.' },
  { id: 'r-system-home', group: 'System changes', scope: 'inside_home', autonomy: 'blocked', locked: true, explanation: 'Privileged commands and system settings are blocked in v1.' },
  { id: 'r-system-else', group: 'System changes', scope: 'elsewhere', autonomy: 'blocked', locked: true, explanation: 'Privileged commands and system settings are blocked in v1.' },
];

export const seedAudit: AuditEntry[] = [
  { id: 'au-1', at: ago(4_000_000), kind: 'policy.decision', summary: 'fs.read on project file docs/edith/README.md', decision: 'allow (automatic)' },
  { id: 'au-2', at: ago(3_900_000), kind: 'approval.resolved', summary: 'Owner approved patch preview (2 files)', decision: 'approve · task scope' },
  { id: 'au-3', at: ago(3_000_000), kind: 'egress', summary: 'Search query sent to SearXNG (Public class, 9 words)', decision: 'allow (consent: Public)' },
  { id: 'au-4', at: ago(1_800_000), kind: 'policy.decision', summary: 'Network write attempted to unknown host', decision: 'confirm → denied by owner' },
  { id: 'au-5', at: ago(600_000), kind: 'memory.write', summary: 'Explicit fact stored: timezone', decision: 'allow' },
];

export const seedTrusts: TrustGrant[] = [
  { id: 'tr-1', scope: 'Run cargo test in this project', grantedAt: ago(2 * DAY), expiresAt: new Date(Date.now() + 5 * DAY).toISOString() },
];

export const seedMcpServers: McpServer[] = [
  {
    id: 'project-files', name: 'project-files', transport: 'stdio', endpoint: 'example child process (not launched)', source: 'EDITH registry', state: 'ready', enabled: true, simulated: true,
    tools: [
      { name: 'read_file', description: 'Read a text file inside the configured project root.', sideEffect: 'read', enabled: true, autonomy: 'automatic' },
      { name: 'list_directory', description: 'List entries of a directory inside the project root.', sideEffect: 'read', enabled: true, autonomy: 'automatic' },
      { name: 'write_file', description: 'Create or overwrite a file inside the project root.', sideEffect: 'write', enabled: true, autonomy: 'policy_controlled' },
    ],
    resources: ['project://README.md', 'project://docs/edith/'],
    prompts: ['summarise-module'],
    history: [
      { id: 'mc-1', at: ago(600_000), capability: 'mcp:project-files/read_file', durationMs: 14, status: 'ok', summary: 'docs/edith/README.md (simulated)' },
      { id: 'mc-2', at: ago(1_200_000), capability: 'mcp:project-files/list_directory', durationMs: 9, status: 'ok', summary: 'docs/edith (simulated)' },
    ],
  },
  {
    id: 'web-docs', name: 'web-docs', transport: 'streamable_http', endpoint: 'https://docs.example.invalid/mcp (example)', source: 'OpenCode opencode.json (read-only hint)', state: 'unavailable', reason: 'Authentication not configured. Add a secret reference in the registry (simulated).', enabled: true, simulated: true,
    tools: [
      { name: 'search_docs', description: 'Search documentation pages for a query.', sideEffect: 'network', enabled: true, autonomy: 'automatic' },
      { name: 'fetch_page', description: 'Fetch one documentation page as text.', sideEffect: 'network', enabled: true, autonomy: 'automatic' },
    ],
    resources: [],
    prompts: [],
    history: [{ id: 'mc-3', at: ago(7_200_000), capability: 'mcp:web-docs/search_docs', durationMs: 10000, status: 'timeout', summary: 'Timed out after 10 s (simulated)' }],
  },
  {
    id: 'issue-tracker', name: 'issue-tracker', transport: 'stdio', endpoint: 'example child process (not launched)', source: 'Claude Code settings (read-only hint)', state: 'degraded', reason: 'Two recent call errors (simulated). Health probe pending.', enabled: false, simulated: true,
    tools: [
      { name: 'list_issues', description: 'List open issues for a repository.', sideEffect: 'network', enabled: false, autonomy: 'confirm_required' },
      { name: 'create_issue', description: 'Create an issue in a repository.', sideEffect: 'network', enabled: false, autonomy: 'confirm_required' },
    ],
    resources: ['issues://open'],
    prompts: [],
    history: [],
  },
];

export const seedSkills: Skill[] = [
  { id: 'repo-architecture-report', name: 'repo-architecture-report', version: '1.2.0', kind: 'instruction+tools', description: 'Analyse a code repository and produce an architecture report. Use when the user asks for architecture review, module maps or dependency analysis.', adapter: 'claude-code', enabled: true, hashStatus: 'approved', requires: ['native:fs.read', 'native:git.status', 'mcp:project-files/list_directory'], compatibility: 'EDITH ≥ 0.1 · linux', simulated: true },
  { id: 'rust-test-triage', name: 'rust-test-triage', version: '0.4.1', kind: 'instruction', description: 'Triage failing Rust tests: group failures, propose minimal fixes. Use when cargo test fails.', adapter: 'native', enabled: true, hashStatus: 'approved', requires: ['native:process.run_template'], compatibility: 'EDITH ≥ 0.1', simulated: true },
  { id: 'research-evidence-check', name: 'research-evidence-check', version: '2.0.0', kind: 'instruction+tools', description: 'Check that each claim in a research draft maps to a source span. Use before publishing a research recommendation.', adapter: 'native', enabled: true, hashStatus: 'changed', requires: ['native:fetch.url', 'model:verifier'], compatibility: 'EDITH ≥ 0.2', simulated: true },
  { id: 'meeting-notes', name: 'meeting-notes', version: '0.2.0', kind: 'instruction', description: 'Turn raw meeting notes into decisions and action items. Use when the user shares meeting notes.', adapter: 'opencode', enabled: false, hashStatus: 'approved', requires: [], compatibility: 'EDITH ≥ 0.1', simulated: true },
];

export function seedLogs(): LogEntry[] {
  return [
    { id: 'lg-1', at: ago(5_000), level: 'info', subsystem: 'daemon', message: 'Health OK (simulated daemon, no backend in prototype)', traceId: 'tr-0001' },
    { id: 'lg-2', at: ago(4_000), level: 'debug', subsystem: 'router', message: 'T0 match: clock utility, no model call', traceId: 'tr-0002' },
    { id: 'lg-3', at: ago(3_500), level: 'debug', subsystem: 'router', message: 'T0 match: calculator, no model call', traceId: 'tr-0002' },
    { id: 'lg-4', at: ago(3_000), level: 'warn', subsystem: 'models', message: 'llama_cpp: connection refused (simulated)', traceId: 'tr-0003' },
    { id: 'lg-5', at: ago(2_000), level: 'info', subsystem: 'policy', message: 'Decision allow: fs.read project file (automatic)', traceId: 'tr-0004' },
    { id: 'lg-6', at: ago(1_500), level: 'info', subsystem: 'orchestrator', message: 'task created: research (8 subtasks, simulated)', traceId: 'tr-0005' },
    { id: 'lg-7', at: ago(1_000), level: 'error', subsystem: 'search', message: 'searxng timeout after 8 s (simulated)', traceId: 'tr-0005' },
    { id: 'lg-8', at: ago(500), level: 'info', subsystem: 'orchestrator', message: 'retry scheduled for one step (simulated)', traceId: 'tr-0005' },
  ];
}

export const DEMO_UTTERANCE = 'Research the best architecture for our MCP host, and compare two alternatives.';
