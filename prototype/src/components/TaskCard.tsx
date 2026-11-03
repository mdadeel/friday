import { useState } from 'react';
import type { TaskRecord } from '../types/contracts';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { isActive, stateLabel, stateTone } from '../app/presentation';
import { StatusDot } from './StatusDot';
import { Meter } from './Meter';
import { Badge } from './Badge';
import { SimBadge } from './SimBadge';
import { ApprovalCard } from './ApprovalCard';
import { EvidenceCard } from './EvidenceCard';
import { navigate } from '../app/router';

/** Task card in the conversation. Collapsed by default: objective, state, progress, cancel. */
export function TaskCard({ task }: { task: TaskRecord }) {
  const { tasks } = useServices();
  const approvals = useObservable(tasks.approvals).filter((a) => a.taskId === task.id);
  const [open, setOpen] = useState(false);
  const active = isActive(task.state);
  const done = task.subtasks.filter((s) => s.state === 'done').length;
  const total = task.subtasks.length;
  const passed = task.verdicts.filter((v) => v.verdict === 'pass').length;
  const headingId = `task-${task.id}`;
  const short = task.objective.length > 90 ? `${task.objective.slice(0, 90)}…` : task.objective;

  return (
    <section className={`card card-task${task.outcome === 'failed' ? ' is-blocked' : ''}`} aria-labelledby={headingId}>
      <header className="card-head">
        <StatusDot tone={stateTone(task.state)} label={stateLabel(task.state)} pulse={active && task.state === 'Executing'} />
        <Badge tone="muted">{task.intent}</Badge>
        <SimBadge compact />
        <span className="spacer" />
        {active ? (
          <button type="button" className="btn btn-ghost" onClick={() => tasks.cancel(task.id)} aria-label={`${en.composer.cancel}: ${short}`}>
            {en.composer.cancel}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" aria-expanded={open} aria-controls={`${headingId}-details`} onClick={() => setOpen((o) => !o)}>
          {open ? en.task.collapse : en.task.expand}
        </button>
      </header>
      <h3 id={headingId} className="task-title">
        {short}
      </h3>
      <Meter value={total ? done / total : 0} label={`Progress: ${done} of ${total} steps`} tone={task.state === 'Failed' ? 'warn' : 'accent'} />
      <p className="small faint">
        {done}/{total} {en.now.progress} · {en.task.verification}: {task.verification.replace(/_/g, '-')}
      </p>

      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}

      {task.outcome === 'completed' ? (
        <p className="outcome ok-text">
          {en.task.done} {task.changedFiles.length ? `${task.changedFiles.length} files changed; ` : ''}
          {task.verdicts.length ? `${passed}/${task.verdicts.length} checks pass.` : ''} (simulated)
        </p>
      ) : null}
      {task.outcome === 'failed' ? (
        <p className="outcome error-text">
          <strong>{en.task.blocked}</strong> {task.blocker ?? 'a step could not complete.'}
        </p>
      ) : null}
      {task.outcome === 'cancelled' ? <p className="outcome muted">{en.task.cancelled}</p> : null}

      {open ? (
        <div id={`${headingId}-details`} className="card-details">
          <h4 className="label-caps">{en.task.steps}</h4>
          <ol className="steps">
            {task.subtasks.map((s) => (
              <li key={s.id} className={`step state-${s.state}${s.deps.length ? ' is-dependent' : ''}`}>
                <span className="step-state">{s.state}</span> {s.label}
                {s.note ? <span className="faint"> — {s.note}</span> : null}
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/activity/${task.id}`)}>
            {en.now.open}
          </button>
        </div>
      ) : null}

      {task.outcome === 'completed' && task.evidence.length ? <EvidenceCard sources={task.evidence} /> : null}
      {task.outcome === 'completed' && task.unresolved.length ? (
        <p className="small">
          <span className="faint">{en.task.unresolved}: </span>
          {task.unresolved.join(' ')}
        </p>
      ) : null}
    </section>
  );
}
