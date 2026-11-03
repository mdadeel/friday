import { en } from '../i18n/en';
import { useServices, useObservable } from '../app/services';
import { Icon } from './Icon';

/** Recent tasks: a history sidebar. Selecting one opens its Activity view. */
export function HistoryList() {
  const { tasks, conversation } = useServices();
  const all = useObservable(tasks);
  return (
    <section className="history" aria-label={en.nav.history}>
      <div className="row between">
        <h2 className="label-caps">{en.nav.history}</h2>
      </div>
      <button type="button" className="btn history-new" onClick={() => conversation.reset()}>
        <Icon name="plus" size={14} />
        <span>{en.nav.newChat}</span>
      </button>
      <ul className="history-list">
        {all.slice(0, 8).map((t) => (
          <li key={t.id}>
            <a href={`#/activity/${t.id}`} className="history-item">
              <span className="history-title">{t.objective.length > 42 ? `${t.objective.slice(0, 42)}…` : t.objective}</span>
              <span className="faint small">{t.state}</span>
            </a>
          </li>
        ))}
        {all.length === 0 ? <li className="empty">None yet.</li> : null}
      </ul>
    </section>
  );
}
