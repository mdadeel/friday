import { Store } from '../store';
import type { CapabilityService, CapabilityState, DiagnosticsService } from '../contracts';
import type { CapabilityKind, McpServer } from '../../types/contracts';
import { seedMcpServers, seedSkills } from '../../data/seed';

export function createCapabilityService(diag: DiagnosticsService): CapabilityService {
  const store = new Store<CapabilityState>({ servers: seedMcpServers, skills: seedSkills });
  const timers: ReturnType<typeof setTimeout>[] = [];

  const updateServer = (id: string, fn: (s: McpServer) => McpServer): void => {
    store.set((s) => ({ ...s, servers: s.servers.map((x) => (x.id === id ? fn(x) : x)) }));
  };

  const setServerEnabled = (id: string, enabled: boolean): void => {
    updateServer(id, (s) => ({ ...s, enabled, state: enabled ? 'starting' : 'stopped', reason: undefined }));
    diag.log('mcp', 'info', `${id} ${enabled ? 'enabled — starting (simulated, nothing launched)' : 'disabled'}`);
    if (enabled) {
      timers.push(
        setTimeout(() => {
          // web-docs needs an auth secret that is not configured, so it stays unavailable.
          if (id === 'web-docs') updateServer(id, (s) => ({ ...s, state: 'unavailable', reason: 'Authentication not configured (simulated).' }));
          else updateServer(id, (s) => ({ ...s, state: 'ready' }));
        }, 1100),
      );
    }
  };

  const restart = (id: string): void => {
    updateServer(id, (s) => ({ ...s, state: 'starting' }));
    timers.push(setTimeout(() => updateServer(id, (s) => ({ ...s, state: id === 'web-docs' ? 'unavailable' : 'ready' })), 1100));
    diag.log('mcp', 'info', `${id} restart requested (simulated)`);
  };

  const setToolEnabled = (serverId: string, toolName: string, enabled: boolean): void => {
    updateServer(serverId, (s) => ({ ...s, tools: s.tools.map((t) => (t.name === toolName ? { ...t, enabled } : t)) }));
  };

  const setSkillEnabled = (id: string, enabled: boolean): void => {
    store.set((s) => ({ ...s, skills: s.skills.map((k) => (k.id === id ? { ...k, enabled } : k)) }));
  };

  const approveSkillChange = (id: string): void => {
    store.set((s) => ({ ...s, skills: s.skills.map((k) => (k.id === id ? { ...k, hashStatus: 'approved' as const } : k)) }));
    diag.log('skills', 'info', `${id} new content hash approved (simulated)`);
  };

  const kindOf = (capability: string): CapabilityKind => {
    if (capability.startsWith('mcp:')) return 'mcp_tool';
    if (capability.startsWith('model:') || capability.startsWith('search:')) return 'external_service';
    if (capability.startsWith('skill:')) return 'instruction';
    return 'native_tool';
  };

  return { get: store.get, subscribe: store.subscribe, setServerEnabled, setToolEnabled, restart, setSkillEnabled, approveSkillChange, kindOf };
}
