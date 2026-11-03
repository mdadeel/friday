import type { MemoryItem } from '../../types/contracts';
import type { MemoryService } from '../contracts';
import { Store } from '../store';
import type { DaemonClient } from './client';

export function createDaemonMemoryService(client: DaemonClient): MemoryService {
  const store = new Store<MemoryItem[]>([]);

  async function refresh(): Promise<void> {
    try {
      const items = await client.getJson<any[]>('/v1/memory/items');
      const mapped: MemoryItem[] = items.map((it) => {
        const prov = (it.provenance || 'explicit').toLowerCase() as any;
        return {
          id: it.id,
          category: (it.category || 'semantic').toLowerCase() as any,
          content: it.content,
          provenance: prov,
          confidence: it.confidence ?? 1.0,
          importance: it.importance ?? 0.8,
          userConfirmed: prov === 'explicit',
          status: (it.status || 'active').toLowerCase() as any,
          sources: it.sources || ['daemon'],
          createdAt: it.created_at || new Date().toISOString(),
          updatedAt: it.updated_at || new Date().toISOString(),
          version: it.version || 1,
          simulated: false,
        };
      });
      store.set(mapped);
    } catch (e) {
      console.warn('[DaemonMemory] Failed to refresh memory items:', e);
    }
  }

  // Initial fetch
  refresh();

  return {
    get: store.get,
    subscribe: store.subscribe,

    async edit(id: string, content: string) {
      store.set((items) =>
        items.map((it) => (it.id === id ? { ...it, content, updatedAt: new Date().toISOString() } : it))
      );
      try {
        await client.fetch(`/v1/memory/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        });
      } catch (e) {
        console.warn(`[DaemonMemory] Failed to edit item ${id}:`, e);
      }
    },

    async confirm(id: string) {
      store.set((items) =>
        items.map((it) =>
          it.id === id
            ? { ...it, provenance: 'explicit', userConfirmed: true, confidence: 1.0, updatedAt: new Date().toISOString() }
            : it
        )
      );
      try {
        await client.fetch(`/v1/memory/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ provenance: 'explicit', confidence: 1.0 }),
        });
      } catch (e) {
        console.warn(`[DaemonMemory] Failed to confirm item ${id}:`, e);
      }
    },

    async reject(id: string) {
      this.remove(id);
    },

    async remove(id: string) {
      store.set((items) => items.filter((it) => it.id !== id));
      try {
        await client.fetch(`/v1/memory/items/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.warn(`[DaemonMemory] Failed to delete item ${id}:`, e);
      }
    },

    whoAmI(): { text: string; usedIds: string[] } {
      const explicit = store
        .get()
        .filter((it) => it.status === 'active' && it.provenance === 'explicit');

      if (explicit.length === 0) {
        return { text: 'No confirmed facts on record.', usedIds: [] };
      }

      const text = explicit.map((it) => it.content).join(' ');
      const usedIds = explicit.map((it) => it.id);
      return { text, usedIds };
    },
  };
}
