import { useObservable, useServices } from '../app/services';
import { Icon } from './Icon';

const TONE = { info: 'accent', ok: 'ok', warn: 'warn', error: 'error' } as const;

/** At most two notifications, auto-dismissed after 6 s. Errors and warnings are announced assertively. */
export function NotificationStack() {
  const { notifications } = useServices();
  const items = useObservable(notifications);
  return (
    <div className="notify-stack" aria-live="off">
      {items.map((n) => {
        const urgent = n.severity === 'error' || n.severity === 'warn';
        return (
          <div key={n.id} className={`notify notify-${TONE[n.severity]}`} role={urgent ? 'alert' : 'status'}>
            <span className="notify-text">{n.text}</span>
            <button type="button" className="btn btn-icon btn-ghost" onClick={() => notifications.dismiss(n.id)} aria-label="Dismiss notification">
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
