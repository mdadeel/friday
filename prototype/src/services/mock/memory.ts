import { Store } from '../store';
import type { DiagnosticsService, MemoryService } from '../contracts';
import type { MemoryItem } from '../../types/contracts';
import { seedMemory } from '../../data/seed';
import { answerWhoAmI } from './logic';
import { nowIso } from './ids';

export function createMemoryService(diag: DiagnosticsService): MemoryService {
  const store = new Store<MemoryItem[]>(seedMemory());

  const update = (id: string, fn: (m: MemoryItem) => MemoryItem): void => {
    store.set((list) => list.map((m) => (m.id === id ? { ...fn(m), updatedAt: nowIso() } : m)));
  };

  /** Editing creates a new version; the previous content stays in history. */
  const edit = (id: string, content: string): void => {
    const clean = content.trim();
    if (!clean) return;
    update(id, (m) => ({
      ...m,
      content: clean,
      provenance: 'explicit',
      userConfirmed: true,
      version: m.version + 1,
      history: [...m.history, { version: m.version, content: m.content, at: m.updatedAt }],
    }));
    diag.log('memory', 'info', `item ${id} edited by owner (new version)`, id);
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
    diag.log('memory', 'info', `item ${id} deleted (tombstone kept in the real system)`, id);
  };

  const forgetAll = (): void => {
    store.set((list) => list.map((m) => ({ ...m, status: 'deleted' as const })));
    diag.log('memory', 'warn', 'forget everything: all items deleted (simulated)');
  };

  const restoreSamples = (): void => {
    store.set(() => seedMemory());
    diag.log('memory', 'info', 'sample memory restored (prototype)');
  };

  // Deleted items stay in the store as tombstones; screens filter them out.
  return {
    get: store.get,
    subscribe: store.subscribe,
    edit,
    confirm,
    reject,
    remove,
    forgetAll,
    restoreSamples,
    whoAmI: () => answerWhoAmI(store.get()),
  };
}
