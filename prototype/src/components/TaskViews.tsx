import type { ApprovalRequest, TaskRecord } from '../types/contracts';
import { navigate } from '../app/router';
import { useServices } from '../app/services';
import { Badge, Icon, SimBadge } from './ui';

export const TERMINAL_STATES = ['Completed', 'Failed', 'Cancelled'];

export function stateTone(state: TaskRecord['state']): 'ok' | 'warn' | 'error' | 'info' | 'muted' | 'accent' {
  if (state === 'Completed') return 'ok';
  if (state === 'Failed') return 'error';
  if (state === 'Cancelled') return 'muted';
  if (state === 'Waiting') return 'warn';
  if (state === 'Idle') return 'muted';
  return 'accent';
}

export function progressOf(task: TaskRecord): { done: number; total: number } {
  const total = task.subtasks.length;
  const done = task.subtasks.filter((s) => s.state === 'done').length;
  return { done, total };
}

export function TaskCard({ task }: { task: TaskRecord }) {
  const s = useServices();
  const { done, total } = progressOf(task);
  const terminal = TERMINAL_STATES.includes(task.state);
  return (
    <article className="task-card" aria-label={`Task: ${task.objective}`}>
      <header className="task-card-head">
        <Badge tone={stateTone(task.state)}>{task.state}</Badge>
        <span className="muted small">{done}/{total} steps</span>
        <SimBadge />
      </header>
      <p className="task-card-title">{task.objective}</p>
      <div className="task-card-actions">
        <button type="button" className="btn ghost small" onClick={() => navigate('#/activity')}>
          Open in Activity
        </button>
        {!terminal && (
          <button type="button" className="btn ghost small" onClick={() => s.tasks.cancel(task.id)}>
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}

export function ApprovalCard({ approval, objective }: { approval: ApprovalRequest; objective?: string }) {
  const s = useServices();
  return (
    <article className="approval-card" aria-label="Approval request">
      <header className="approval-head">
        <Icon name="shield" />
        <strong>Approval needed</strong>
        <Badge tone="warn">Confirm required</Badge>
      </header>
      {objective && <p className="small muted">For: {objective}</p>}
      <p className="small">
        <code>{approval.capability}</code>
      </p>
      <p className="approval-preview">{approval.preview}</p>
      <div className="approval-actions">
        <button type="button" className="btn primary small" onClick={() => s.tasks.decide(approval.id, 'approve')}>
          Approve
        </button>
        <button type="button" className="btn ghost small" onClick={() => s.tasks.decide(approval.id, 'deny')}>
          Deny
        </button>
      </div>
    </article>
  );
}
