import { Store } from '../store';
import type { CapabilityService, CapabilityState, DiagnosticsService } from '../contracts';
import type { CapabilityKind, McpServer } from '../../types/contracts';
import { seedMcpServers, seedSkills } from '../../data/seed';

const NOT_STARTED = 'Not started: this prototype cannot launch MCP servers or contact their endpoints.';

/**
 * Capability state is a record of intent, not a running process. Enabling a server never reports it as ready:
 * the prototype has no MCP client, so the honest state is 'unavailable' with the reason.
 */
export function createCapabilityService(diag: DiagnosticsService): CapabilityService {
  const store = new Store<CapabilityState>({ servers: seedMcpServers, skills: seedSkills });

  const updateServer = (id: string, fn: (s: McpServer) => McpServer): void => {
    store.set((s) => ({ ...s, servers: s.servers.map((x) => (x.id === id ? fn(x) : x)) }));
  };

  const setServerEnabled = (id: string, enabled: boolean): void => {
    updateServer(id, (s) => ({
      ...s,
      enabled,
      state: enabled ? 'unavailable' : 'stopped',
      reason: enabled ? NOT_STARTED : 'Stopped. Nothing was running.',
    }));
    diag.log('mcp', 'info', `${id} ${enabled ? 'enable requested: not started (no MCP client)' : 'disabled'}`);
  };

  const restart = (id: string): void => {
    updateServer(id, (s) => ({ ...s, state: 'unavailable', reason: NOT_STARTED }));
    diag.log('mcp', 'info', `${id} restart requested: not started (no MCP client)`);
  };

  const setToolEnabled = (serverId: string, toolName: string, enabled: boolean): void => {
    updateServer(serverId, (s) => ({ ...s, tools: s.tools.map((t) => (t.name === toolName ? { ...t, enabled } : t)) }));
  };

  const setSkillEnabled = (id: string, enabled: boolean): void => {
    store.set((s) => ({ ...s, skills: s.skills.map((k) => (k.id === id ? { ...k, enabled } : k)) }));
  };

  const approveSkillChange = (id: string): void => {
    store.set((s) => ({ ...s, skills: s.skills.map((k) => (k.id === id ? { ...k, hashStatus: 'approved' as const } : k)) }));
    diag.log('skills', 'info', `${id} content change marked approved (session only; no hash was computed)`);
  };

  const kindOf = (capability: string): CapabilityKind => {
    if (capability.startsWith('mcp:')) return 'mcp_tool';
    if (capability.startsWith('model:') || capability.startsWith('search:')) return 'external_service';
    if (capability.startsWith('skill:')) return 'instruction';
    return 'native_tool';
  };

  return { get: store.get, subscribe: store.subscribe, setServerEnabled, setToolEnabled, restart, setSkillEnabled, approveSkillChange, kindOf };
}
