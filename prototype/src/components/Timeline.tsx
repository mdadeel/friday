import type { TaskEvent } from '../types/contracts';

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Dhaka' });

/** Human-readable task events. Times are shown in Asia/Dhaka. */
export function Timeline({ events }: { events: TaskEvent[] }) {
  if (events.length === 0) return <p className="empty">No events yet.</p>;
  return (
    <ol className="timeline" aria-label="Task events">
      {events.map((e) => (
        <li key={e.id} className={`timeline-item kind-${e.kind.replace(/[^a-z]/gi, '')}`}>
          <time dateTime={e.at} className="faint mono">
            {TIME.format(new Date(e.at))}
          </time>
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
