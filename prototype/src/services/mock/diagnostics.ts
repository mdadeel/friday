import { Store } from '../store';
import type { DiagnosticsService } from '../contracts';
import type { LogEntry } from '../../types/contracts';
import { seedLogs } from '../../data/seed';
import { nextId, nowIso } from './ids';

export function createDiagnosticsService(): DiagnosticsService {
  const store = new Store<LogEntry[]>(seedLogs);

  const log: DiagnosticsService['log'] = (subsystem, level, message, traceId) => {
    store.set((list) => [...list, { id: nextId('lg'), at: nowIso(), level, subsystem, message, traceId: traceId ?? nextId('tr') }].slice(-500));
  };

  const exportPreview = (): string =>
    JSON.stringify(
      {
        note: 'Prototype export preview. Simulated data only. The real export redacts secrets and content.',
        entries: store.get().slice(-50).map(({ at, level, subsystem, message, traceId }) => ({ at, level, subsystem, message, traceId })),
      },
      null,
      2,
    );

  return { get: store.get, subscribe: store.subscribe, log, exportPreview };
}
