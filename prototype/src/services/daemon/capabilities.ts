import { Store } from '../store';
import type { CapabilityService, CapabilityState } from '../contracts';
import type { CapabilityKind, McpServer, McpTool, Skill } from '../../types/contracts';
import { seedSkills } from '../../data/seed';
import type { DaemonClient } from './client';

export function createDaemonCapabilityService(client: DaemonClient): CapabilityService {
  const store = new Store<CapabilityState>({
    servers: [
      {
        id: 'edith-daemon',
        name: 'EDITH Native Daemon',
        state: 'ready',
        transport: 'stdio',
        endpoint: 'edith-daemon',
        source: 'builtin',
        enabled: true,
        tools: [],
        history: [],
        simulated: false,
      },
    ],
    skills: seedSkills,
  });

  async function refresh() {
    try {
      const data = await client.getJson<{ tools: any[]; count: number }>('/v1/tools');
      if (data && data.tools) {
        const tools: McpTool[] = data.tools.map((t: any) => ({
          name: t.name,
          description: t.description,
          sideEffect: (t.side_effects || 'none').toLowerCase() as any,
          enabled: true,
          autonomy: (t.default_autonomy || 'automatic').toLowerCase() as any,
        }));

        store.set((prev) => ({
          ...prev,
          servers: prev.servers.map((s) =>
            s.id === 'edith-daemon' ? { ...s, tools } : s
          ),
        }));
      }
    } catch (e) {
      console.warn('[DaemonCapabilities] Failed to fetch live tools:', e);
    }
  }

  refresh();

  const updateServer = (id: string, fn: (s: McpServer) => McpServer): void => {
    store.set((s) => ({ ...s, servers: s.servers.map((x) => (x.id === id ? fn(x) : x)) }));
  };

  const setServerEnabled = (id: string, enabled: boolean): void => {
    updateServer(id, (s) => ({ ...s, enabled, state: enabled ? 'ready' : 'stopped' }));
  };

  const restart = (id: string): void => {
    updateServer(id, (s) => ({ ...s, state: 'starting' }));
    setTimeout(() => {
      updateServer(id, (s) => ({ ...s, state: 'ready' }));
      refresh();
    }, 500);
  };

  const setToolEnabled = (serverId: string, toolName: string, enabled: boolean): void => {
    updateServer(serverId, (s) => ({
      ...s,
      tools: s.tools.map((t) => (t.name === toolName ? { ...t, enabled } : t)),
    }));
  };

  const setSkillEnabled = (id: string, enabled: boolean): void => {
    store.set((s) => ({
      ...s,
      skills: s.skills.map((k: Skill) => (k.id === id ? { ...k, enabled } : k)),
    }));
  };

  const approveSkillChange = (id: string): void => {
    store.set((s) => ({
      ...s,
      skills: s.skills.map((k: Skill) =>
        k.id === id ? { ...k, hashStatus: 'approved' as const } : k
      ),
    }));
  };

  const kindOf = (capability: string): CapabilityKind => {
    if (capability.startsWith('mcp:')) return 'mcp_tool';
    if (capability.startsWith('model:')) return 'external_service';
    if (capability.startsWith('skill:')) return 'instruction';
    return 'native_tool';
  };

  return {
    get: store.get,
    subscribe: store.subscribe,
    setServerEnabled,
    setToolEnabled,
    restart,
    setSkillEnabled,
    approveSkillChange,
    kindOf,
  };
}
