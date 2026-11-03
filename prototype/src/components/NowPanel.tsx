import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { isActive, stateLabel, stateTone, voiceTone, fmtDuration } from '../app/presentation';
import { StatusDot } from './StatusDot';
import { Meter } from './Meter';
import { Badge } from './Badge';
import { SimBadge } from './SimBadge';
import { Chip } from './Chip';
import { ApprovalCard } from './ApprovalCard';
import { navigate } from '../app/router';

/** Right panel: the current task in one glance. Shows the idle state when nothing runs. */
export function NowPanel() {
  const { tasks, voice, routing } = useServices();
  const all = useObservable(tasks);
  const v = useObservable(voice);
  const r = useObservable(routing);
  const task = all.find((t) => isActive(t.state));
  const approvals = useObservable(tasks.approvals).filter((a) => task && a.taskId === task.id && a.status === 'pending');
  const done = task ? task.subtasks.filter((s) => s.state === 'done').length : 0;
  const current = task?.subtasks.filter((s) => s.state === 'running').map((s) => s.label).join(', ');
  const last = r.recent[0];

  return (
    <aside className="now-panel" aria-labelledby="now-heading">
      <header className="now-head">
        <h2 id="now-heading">{en.now.heading}</h2>
        <SimBadge compact />
      </header>

      {task ? (
        <section className="now-section" aria-live="polite" aria-label="Current task">
          <StatusDot tone={stateTone(task.state)} label={stateLabel(task.state)} pulse={task.state === 'Executing'} />
          <p className="now-objective">{task.objective.length > 120 ? `${task.objective.slice(0, 120)}…` : task.objective}</p>
          <Meter value={task.subtasks.length ? done / task.subtasks.length : 0} label={`Progress: ${done} of ${task.subtasks.length}`} />
          <p className="small faint">
            {done}/{task.subtasks.length} {en.now.progress}
          </p>
          {current ? (
            <p className="small">
              <span className="faint">{en.now.current}: </span>
              {current}
            </p>
          ) : null}
          {task.blocker ? (
            <p className="small error-text">
              <span className="faint">{en.now.blocker}: </span>
              {task.blocker}
            </p>
          ) : null}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          <div className="row gap wrap">
            <button type="button" className="btn btn-danger" onClick={() => tasks.cancel(task.id)}>
              {en.composer.cancel}
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/activity/${task.id}`)}>
              {en.now.open}
            </button>
          </div>
        </section>
      ) : (
        <p className="now-idle">{en.now.idle}</p>
      )}

      <section className="now-section" aria-label="Voice">
        <h3 className="label-caps">{en.now.voice}</h3>
        <StatusDot tone={voiceTone(v.state)} label={en.voice[v.state]} pulse={v.state === 'Listening'} />
        {v.state === 'Speaking' ? (
          <button type="button" className="btn btn-ghost" onClick={() => voice.bargeIn()}>
            Stop speaking
          </button>
        ) : null}
      </section>

      {last ? (
        <section className="now-section" aria-label="Last route">
          <h3 className="label-caps">{en.now.lastRoute}</h3>
          <div className="row wrap gap">
            <Badge tone="accent">{last.tier}</Badge>
            <Chip>{last.model ?? en.route.noModel}</Chip>
            <Chip>{last.locality === 'Local' ? en.route.local : en.route.cloud}</Chip>
            <Chip>{fmtDuration(last.latencyMs)}</Chip>
          </div>
        </section>
      ) : null}

      <button type="button" className="btn btn-ghost now-link" onClick={() => navigate('/activity')}>
        {en.activity.heading} →
      </button>
    </aside>
  );
}
