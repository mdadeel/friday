import { Store } from '../store';
import type { NotificationService } from '../contracts';
import type { NotificationItem } from '../../types/contracts';
import { nextId, nowIso } from './ids';

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 2;

/** Small contextual notifications: at most two visible, each auto-dismissed after 6 s (UI spec §3.6). */
export function createNotificationService(): NotificationService {
  const store = new Store<NotificationItem[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const dismiss = (id: string): void => {
    const h = timers.get(id);
    if (h) clearTimeout(h);
    timers.delete(id);
    store.set((list) => list.filter((n) => n.id !== id));
  };

  const push = (text: string, severity: NotificationItem['severity'], taskId?: string): void => {
    const id = nextId('ntf');
    store.set((list) => [...list, { id, at: nowIso(), severity, text, taskId }].slice(-MAX_VISIBLE));
    timers.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
  };

  return { get: store.get, subscribe: store.subscribe, push, dismiss };
}
