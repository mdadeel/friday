// Sample data for the prototype. Every record is SIMULATED and labelled as a sample.
// Nothing here is a real device, model, server, memory, approval or log entry. Counts and history
// that depend on activity start empty and fill only from what happens in this browser session.
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
import { CATALOG_MODELS } from './modelCatalog';
import { DEFAULT_TIER_MODELS } from '../services/mock/logic';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
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

/** Provider state. Nothing is probed in the prototype, so every provider starts as unknown or not configured. */
export const seedProviders: ProviderInfo[] = [
  { id: 'native', name: 'Built-in utilities (browser)', kind: 'native', endpoint: 'runs in this browser tab', health: 'up', reason: 'Clock and calculator run in the browser (Tier 0).', consent: ['Public', 'Personal', 'Project'], models: [], simulated: true },
  { id: 'ollama', name: 'Ollama (local server)', kind: 'local_server', endpoint: 'http://127.0.0.1:11434 (Ollama default port)', health: 'unknown', reason: 'Not probed. This prototype has no provider client and does not contact any server.', consent: ['Public', 'Personal', 'Project'], models: CATALOG_MODELS.map((m) => m.name), simulated: true },
  { id: 'llama_cpp', name: 'llama.cpp server (local)', kind: 'local_server', endpoint: 'not configured', health: 'not_configured', reason: 'No endpoint is set.', consent: [], models: [], simulated: true },
  { id: 'cloud_llm', name: 'Cloud model provider', kind: 'cloud', endpoint: 'not configured', health: 'not_configured', reason: 'Off by default. Needs consent per provider.', consent: [], models: [], simulated: true },
  { id: 'searxng', name: 'SearXNG (search)', kind: 'search', endpoint: 'not configured', health: 'not_configured', reason: 'No endpoint is set. Search results in this prototype come from a fixed list.', consent: ['Public'], models: [], simulated: true },
  { id: 'gemini_live', name: 'Gemini Live (speech, cloud)', kind: 'speech', endpoint: 'not configured — consent required', health: 'not_configured', reason: 'Cloud speech needs consent. Not configured.', consent: [], models: [], simulated: true },
];

export const seedModels: LocalModel[] = CATALOG_MODELS;

/** Tier table starts from the default tags. Every tier is a candidate until the benchmark gate closes. */
export const seedTiers: TierConfig[] = [
  { tier: 'T0', label: 'Deterministic', provider: 'native', model: '', fallbacks: [] },
  { tier: 'T1', label: 'Light', provider: 'ollama', model: DEFAULT_TIER_MODELS.T1, fallbacks: ['rules'] },
  { tier: 'T2', label: 'General', provider: 'ollama', model: DEFAULT_TIER_MODELS.T2, fallbacks: ['llama_cpp'] },
  { tier: 'T3', label: 'Advanced', provider: 'ollama', model: DEFAULT_TIER_MODELS.T3, fallbacks: ['llama_cpp', 'T2'] },
];

/** Categories are the route table itself. Call counts are filled in from this session's routes. */
export const seedCategories: CategoryStat[] = ['Deterministic', 'Conversation', 'Personal memory', 'Research', 'Coding', 'Continuation'].map((c) => ({
  category: c,
  route: '',
  calls: 0,
}));

/** No seeded events or routes: the timeline and recent list record only what happens in this session. */
export const seedRoutingEvents: RoutingEvent[] = [];
export const seedRecentRoutes: RouteInfo[] = [];

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

/** Audit starts empty. Only decisions made in this session are recorded. */
export const seedAudit: AuditEntry[] = [];

/** No trusted grants exist at start. */
export const seedTrusts: TrustGrant[] = [];

/** Sample configurations. Nothing is launched: every server starts as stopped, and no tool call is made. */
export const seedMcpServers: McpServer[] = [
  {
    id: 'project-files', name: 'project-files (sample)', transport: 'stdio', endpoint: 'sample configuration; no process is started', source: 'EDITH sample registry', state: 'stopped', reason: 'Sample only. The prototype cannot launch MCP servers.', enabled: false, simulated: true,
    tools: [
      { name: 'read_file', description: 'Read a text file inside the configured project root.', sideEffect: 'read', enabled: true, autonomy: 'automatic' },
      { name: 'list_directory', description: 'List entries of a directory inside the project root.', sideEffect: 'read', enabled: true, autonomy: 'automatic' },
      { name: 'write_file', description: 'Create or overwrite a file inside the project root.', sideEffect: 'write', enabled: true, autonomy: 'policy_controlled' },
    ],
    resources: [],
    prompts: [],
    history: [],
  },
  {
    id: 'web-docs', name: 'web-docs (sample)', transport: 'streamable_http', endpoint: 'sample configuration; no connection is made', source: 'EDITH sample registry', state: 'stopped', reason: 'Sample only. Not connected in the prototype.', enabled: false, simulated: true,
    tools: [
      { name: 'search_docs', description: 'Search documentation pages for a query.', sideEffect: 'network', enabled: true, autonomy: 'automatic' },
      { name: 'fetch_page', description: 'Fetch one documentation page as text.', sideEffect: 'network', enabled: true, autonomy: 'automatic' },
    ],
    resources: [],
    prompts: [],
    history: [],
  },
  {
    id: 'issue-tracker', name: 'issue-tracker (sample)', transport: 'stdio', endpoint: 'sample configuration; no process is started', source: 'EDITH sample registry', state: 'stopped', reason: 'Sample only. Not connected in the prototype.', enabled: false, simulated: true,
    tools: [
      { name: 'list_issues', description: 'List open issues for a repository.', sideEffect: 'network', enabled: false, autonomy: 'confirm_required' },
      { name: 'create_issue', description: 'Create an issue in a repository.', sideEffect: 'network', enabled: false, autonomy: 'confirm_required' },
    ],
    resources: [],
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

/** Session start notes. They state what the prototype does not do. */
export function seedLogs(): LogEntry[] {
  return [
    { id: 'lg-1', at: ago(2_000), level: 'info', subsystem: 'daemon', message: 'Prototype started. No daemon is connected; the status is unknown.', traceId: 'tr-0001' },
    { id: 'lg-2', at: ago(1_500), level: 'info', subsystem: 'models', message: 'Model catalogue loaded from published data (checked 2026-11-03). No provider was contacted.', traceId: 'tr-0002' },
    { id: 'lg-3', at: ago(1_000), level: 'info', subsystem: 'network', message: 'No network request made by the prototype.', traceId: 'tr-0003' },
  ];
}

export const DEMO_UTTERANCE = 'Research the best architecture for our MCP host, and compare two alternatives.';
