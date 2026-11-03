import type { LogEntry } from '../../types/contracts';
import type { DiagnosticsService } from '../contracts';
import { Store } from '../store';
import type { DaemonClient } from './client';

export function createDaemonDiagnosticsService(client: DaemonClient): DiagnosticsService {
  const logStore = new Store<LogEntry[]>([]);

  // Periodic poll of live daemon desktop telemetry
  async function pollMetrics() {
    try {
      const metrics = await client.getJson<any>('/v1/desktop/metrics');
      if (metrics) {
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        logStore.set((logs) => [
          {
            id: `log-${Date.now()}`,
            at: now,
            level: 'info',
            subsystem: 'edith-desktop',
            message: `CPU: ${metrics.cpu_usage_percent}% | RAM: ${(metrics.memory_percent || 0).toFixed(1)}% | Load: ${metrics.load_average?.join(', ')}`,
            traceId: 'sys-metrics',
          },
          ...logs.slice(0, 99),
        ]);
      }
    } catch {
      // offline or disconnected
    }
  }

  // Subscribe to live WebSocket events
  client.onEvent((envelope: any) => {
    if (!envelope || !envelope.topic) return;

    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    logStore.set((logs) => [
      {
        id: `evt-${Date.now()}`,
        at: now,
        level: 'debug',
        subsystem: envelope.topic.split('.')[0] || 'edith-daemon',
        message: `${envelope.topic}: ${JSON.stringify(envelope.payload || {})}`,
        traceId: envelope.id || 'daemon-evt',
      },
      ...logs.slice(0, 99),
    ]);
  });

  // Start polling every 5s if in browser
  if (typeof window !== 'undefined') {
    setInterval(pollMetrics, 5000);
    pollMetrics();
  }

  return {
    get: logStore.get,
    subscribe: logStore.subscribe,

    log(subsystem: string, level: LogEntry['level'], message: string, traceId: string = 'client') {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      logStore.set((logs) => [
        {
          id: `log-${Date.now()}`,
          at: now,
          level,
          subsystem,
          message,
          traceId,
        },
        ...logs.slice(0, 99),
      ]);
    },

    exportPreview(): string {
      return logStore
        .get()
        .map((l) => `[${l.at}] [${l.level.toUpperCase()}] [${l.subsystem}] ${l.message}`)
        .join('\n');
    },
  };
}
