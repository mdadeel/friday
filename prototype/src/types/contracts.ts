// Typed DTOs for the EDITH local API. These mirror docs/edith/EDITH_API_AND_EVENT_CONTRACTS.md.
// In the prototype they are produced by mock services. Every object that originates from
// simulation carries `simulated: true` so that UI can label it.

export type TaskState =
  | 'Idle' | 'Understanding' | 'ContextRetrieval' | 'Planning' | 'Routing' | 'Executing'
  | 'Waiting' | 'Verifying' | 'Recovering' | 'Completed' | 'Failed' | 'Cancelled';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
export type DataClass = 'Public' | 'Personal' | 'Project' | 'Secret';
export type Provenance = 'explicit' | 'inferred' | 'temporary' | 'assumption' | 'outdated';
export type MemoryCategory = 'episodic' | 'semantic' | 'procedural' | 'working';
export type MemoryStatus = 'active' | 'pending_review' | 'superseded' | 'expired' | 'deleted';
export type CapabilityKind = 'instruction' | 'native_tool' | 'mcp_tool' | 'external_service';
export type AutonomyClass = 'automatic' | 'policy_controlled' | 'confirm_required' | 'blocked';
export type VerificationMode = 'mechanical' | 'evidence' | 'user_confirmed' | 'none_declared';
export type SideEffect = 'none' | 'read' | 'write' | 'network' | 'process' | 'system';
export type TaskIntent = 'time' | 'date' | 'calc' | 'personal' | 'research' | 'code' | 'continue' | 'chat';

export interface RouteInfo {
  id: string;
  at: string;
  tier: Tier;
  provider: string;
  model: string | null;
  dataClass: DataClass;
  reason: string;
  fallbacks: string[];
  latencyMs: number;
  category: string;
  outcome: 'ok' | 'fallback' | 'failed';
  simulated?: boolean;
}

export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  authorityTier: 1 | 2 | 3;
  date: string;
  spans: number;
  simulated?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'owner' | 'edith' | 'system';
  kind: 'text' | 'task' | 'approval' | 'notice';
  text: string;
  at: string;
  source: 'text' | 'voice';
  route?: RouteInfo;
  taskId?: string;
  approvalId?: string;
  streaming?: boolean;
  thinking?: string;
  toolCalls?: Array<{ name: string; input?: any; output?: any; status: 'running' | 'completed' | 'failed' }>;
  sources?: EvidenceSource[];
  simulated?: boolean;
}

export interface TaskEvent {
  id: string;
  at: string;
  kind: string;
  text: string;
}

export interface TaskSubtask {
  id: string;
  label: string;
  capability: string;
  deps: string[];
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  tier: Tier;
  needsApproval?: boolean;
  remainingTicks: number;
  note?: string;
}

export interface Verdict {
  criterion: string;
  verdict: 'pass' | 'fail' | 'pending';
  evidence?: string;
}

export interface TaskRecord {
  id: string;
  objective: string;
  intent: TaskIntent;
  origin: 'text' | 'voice';
  state: TaskState;
  verification: VerificationMode;
  createdAt: string;
  updatedAt: string;
  subtasks: TaskSubtask[];
  events: TaskEvent[];
  verdicts: Verdict[];
  route?: RouteInfo;
  outcome?: 'completed' | 'failed' | 'cancelled';
  blocker?: string;
  simulated?: boolean;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  subtaskId: string;
  capability: string;
  preview: string;
  autonomy: AutonomyClass;
  status: 'pending' | 'approved' | 'denied';
}

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  provenance: Provenance;
  confidence: number;
  importance: number;
  userConfirmed: boolean;
  status: MemoryStatus;
  sources: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  conflictsWith?: string;
  simulated?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  sideEffect: SideEffect;
  enabled: boolean;
  autonomy: AutonomyClass;
}

export interface CapabilityCall {
  id: string;
  at: string;
  capability: string;
  durationMs: number;
  status: 'ok' | 'error' | 'timeout';
  summary: string;
}

export type McpState = 'ready' | 'starting' | 'degraded' | 'unavailable' | 'stopped';

export interface McpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http';
  endpoint: string;
  source: string;
  state: McpState;
  reason?: string;
  enabled: boolean;
  tools: McpTool[];
  history: CapabilityCall[];
  simulated?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  kind: 'instruction' | 'instruction+tools';
  description: string;
  adapter: 'native' | 'claude-code' | 'opencode';
  enabled: boolean;
  hashStatus: 'approved' | 'changed';
  requires: string[];
  compatibility: string;
  simulated?: boolean;
}

export type ProviderHealth = 'up' | 'degraded' | 'down' | 'not_configured' | 'probing';

export interface ProviderInfo {
  id: string;
  name: string;
  kind: 'local_server' | 'cloud' | 'native' | 'speech' | 'search';
  endpoint: string;
  health: ProviderHealth;
  lastProbe: string;
  consent: DataClass[];
  models: string[];
  simulated?: boolean;
}

export interface TierConfig {
  tier: Tier;
  label: string;
  provider: string;
  model: string;
  fallbacks: string[];
}

export interface CategoryStat {
  category: string;
  route: string;
  successRate: number;
  medianMs: number;
}

export interface RoutingEvent {
  id: string;
  at: string;
  severity: 'info' | 'warn' | 'error';
  text: string;
}

export interface RoutingState {
  providers: ProviderInfo[];
  tiers: TierConfig[];
  recent: RouteInfo[];
  categories: CategoryStat[];
  events: RoutingEvent[];
  requests24h: number;
  noModelShare: number;
  medianFirstTokenMs: number;
  fallbacks24h: number;
  simulated?: boolean;
}

export interface PolicyRule {
  id: string;
  group: string;
  scope: 'inside_project' | 'inside_home' | 'elsewhere';
  autonomy: AutonomyClass;
  locked: boolean;
  explanation: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  kind: string;
  summary: string;
  decision?: string;
}

/** Per-task defaults from the policy design (hypotheses until measured). */
export interface PolicyLimits {
  filesPerTask: number;
  writtenMB: number;
  processRuns: number;
  fetches: number;
  budgetMinutes: number;
}

export interface VoiceSnapshot {
  state: 'Off' | 'Idle' | 'Listening' | 'Transcribing' | 'Finalising' | 'Dispatching' | 'Thinking' | 'Speaking' | 'Interrupted';
  partial: string;
  level: number;
  device: string;
  engine: 'whisper_local' | 'gemini_live_cloud';
  cloudConsent: boolean;
  micOpen: boolean;
  simulated?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  provider: string;
  authorityTier: 1 | 2 | 3;
  snippet: string;
  simulated?: boolean;
}

export interface LogEntry {
  id: string;
  at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  subsystem: string;
  message: string;
  traceId: string;
}
