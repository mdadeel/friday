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
        note: 'Prototype preview. Nothing is redacted, written or sent. The list below is the intended rule set, not an implemented one.',
        intendedRemovals: ['absolute file paths (to be replaced with project-relative paths)', 'secret references', 'raw audio', 'raw prompt and response bodies'],
        entries: store.get().slice(-50).map(({ at, level, subsystem, message, traceId }) => ({ at, level, subsystem, message, traceId })),
      },
      null,
      2,
    );

  return { get: store.get, subscribe: store.subscribe, log, exportPreview };
}
