import { Store } from '../store';
import type { DiagnosticsService, MemoryService } from '../contracts';
import type { MemoryItem } from '../../types/contracts';
import { seedMemory } from '../../data/seed';
import { answerWhoAmI } from './logic';
import { nowIso } from './ids';

export function createMemoryService(diag: DiagnosticsService): MemoryService {
  const store = new Store<MemoryItem[]>(seedMemory.map((m) => ({ ...m })));

  const update = (id: string, fn: (m: MemoryItem) => MemoryItem): void => {
    store.set((list) => list.map((m) => (m.id === id ? { ...fn(m), version: m.version + 1, updatedAt: nowIso() } : m)));
  };

  const edit = (id: string, content: string): void => {
    const clean = content.trim();
    if (!clean) return;
    update(id, (m) => ({ ...m, content: clean, provenance: 'explicit', userConfirmed: true }));
    diag.log('memory', 'info', `item ${id} edited by owner (version bump)`, id);
  };

  const confirm = (id: string): void => {
    const target = store.get().find((m) => m.id === id);
    if (!target) return;
    update(id, (m) => ({ ...m, provenance: 'explicit', userConfirmed: true, confidence: Math.max(m.confidence, 0.95), status: 'active', conflictsWith: undefined }));
    if (target.conflictsWith) {
      const other = target.conflictsWith;
      update(other, (m) => ({ ...m, status: 'superseded', conflictsWith: undefined }));
    }
    diag.log('memory', 'info', `item ${id} confirmed by owner`, id);
  };

  const reject = (id: string): void => {
    update(id, (m) => ({ ...m, status: 'deleted' }));
    diag.log('memory', 'info', `item ${id} rejected by owner`, id);
  };

  const remove = (id: string): void => {
    update(id, (m) => ({ ...m, status: 'deleted' }));
    diag.log('memory', 'info', `item ${id} deleted (tombstone kept in real system)`, id);
  };

  // Deleted items stay in the store as tombstones; screens filter them out.
  // Returning the raw store array keeps the snapshot stable for useSyncExternalStore.
  return {
    get: store.get,
    subscribe: store.subscribe,
    edit,
    confirm,
    reject,
    remove,
    whoAmI: () => answerWhoAmI(store.get()),
  };
}
