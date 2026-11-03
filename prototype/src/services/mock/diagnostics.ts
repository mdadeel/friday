import { Store } from '../store';
import type { DiagnosticsService } from '../contracts';
import type { LogEntry } from '../../types/contracts';
import { seedLogs } from '../../data/seed';
import { nextId, nowIso } from './ids';

export function createDiagnosticsService(): DiagnosticsService {
  const store = new Store<LogEntry[]>(seedLogs());

  const log: DiagnosticsService['log'] = (subsystem, level, message, traceId) => {
    store.set((list) => [...list, { id: nextId('lg'), at: nowIso(), level, subsystem, message, traceId: traceId ?? nextId('tr') }].slice(-500));
  };

  /** Export preview: lists what the real redaction step would remove. Nothing is exported. */
  const exportPreview = (): string =>
    JSON.stringify(
      {
        note: 'Prototype export preview. Simulated entries only; nothing is written or sent.',
        removed: ['absolute file paths (replaced with project-relative paths)', 'secret references (none present)', 'raw audio (never recorded)', 'raw prompt and response bodies'],
        entries: store.get().slice(-50).map(({ at, level, subsystem, message, traceId }) => ({ at, level, subsystem, message, traceId })),
      },
      null,
      2,
    );

  return { get: store.get, subscribe: store.subscribe, log, exportPreview };
}
