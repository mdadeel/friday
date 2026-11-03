// Service interfaces the UI depends on. Mirrors docs/edith/EDITH_FRONTEND_DESIGN_SYSTEM.md §5.
// Mock adapters live in ./mock. A future DaemonAdapters implementation replaces them without UI changes.

import type {
  ApprovalRequest,
  AuditEntry,
  CapabilityKind,
  ChatMessage,
  LogEntry,
  MemoryItem,
  McpServer,
  PolicyLimits,
  PolicyRule,
  RouteInfo,
  RoutingState,
  SearchResult,
  Skill,
  TaskIntent,
  TaskRecord,
  Tier,
  VoiceSnapshot,
} from '../types/contracts';

export interface Observable<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface ConversationService extends Observable<ChatMessage[]> {
  send(text: string, source?: 'text' | 'voice'): void;
  reset(): void;
}

export interface TaskService extends Observable<TaskRecord[]> {
  start(objective: string, intent: TaskIntent, origin: 'text' | 'voice', route: RouteInfo): string;
  cancel(taskId: string): void;
  approvals: Observable<ApprovalRequest[]>;
  decide(approvalId: string, decision: 'approve' | 'deny'): void;
}

export interface VoiceService extends Observable<VoiceSnapshot> {
  pressToTalk(): void;
  release(): void;
  bargeIn(): void;
  setEngine(engine: VoiceSnapshot['engine'], cloudConsent: boolean): void;
  speak(text: string): void;
}

export interface MemoryService extends Observable<MemoryItem[]> {
  edit(id: string, content: string): void;
  confirm(id: string): void;
  reject(id: string): void;
  remove(id: string): void;
  whoAmI(): { text: string; usedIds: string[] };
}

export interface RoutingService extends Observable<RoutingState> {
  record(route: RouteInfo): void;
  setTier(tier: Tier, patch: { provider?: string; model?: string }): void;
  probe(providerId: string): void;
  testRoute(text: string): RouteInfo | null;
}

export interface CapabilityState {
  servers: McpServer[];
  skills: Skill[];
}

export interface CapabilityService extends Observable<CapabilityState> {
  setServerEnabled(id: string, enabled: boolean): void;
  setToolEnabled(serverId: string, toolName: string, enabled: boolean): void;
  restart(id: string): void;
  setSkillEnabled(id: string, enabled: boolean): void;
  approveSkillChange(id: string): void;
  kindOf(capability: string): CapabilityKind;
}

export interface PolicyState {
  rules: PolicyRule[];
  limits: PolicyLimits;
  audit: AuditEntry[];
}

export interface PolicyService extends Observable<PolicyState> {
  setAutonomy(ruleId: string, autonomy: PolicyRule['autonomy']): void;
  setLimit(key: keyof PolicyLimits, value: number): void;
}

export type SettingValue = string | number | boolean;
export type SettingsValues = Record<string, Record<string, SettingValue>>;

export interface SettingsService extends Observable<SettingsValues> {
  set(section: string, key: string, value: SettingValue): void;
  reset(): void;
}

export interface SearchService {
  query(text: string): Promise<SearchResult[]>;
}

export interface DiagnosticsService extends Observable<LogEntry[]> {
  log(subsystem: string, level: LogEntry['level'], message: string, traceId?: string): void;
  exportPreview(): string;
}

export interface Services {
  conversation: ConversationService;
  tasks: TaskService;
  voice: VoiceService;
  memory: MemoryService;
  routing: RoutingService;
  capabilities: CapabilityService;
  policy: PolicyService;
  settings: SettingsService;
  search: SearchService;
  diagnostics: DiagnosticsService;
}
