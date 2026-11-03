import type { ApprovalRequest } from '../types/contracts';
import { en } from '../i18n/en';
import { Badge } from './Badge';
import { SimBadge } from './SimBadge';
import { AUTONOMY_LABEL } from '../app/presentation';
import { useServices } from '../app/services';

/** Amber approval card with a preview. The task is paused until a decision. Nothing is written by the prototype. */
export function ApprovalCard({ approval }: { approval: ApprovalRequest }) {
  const { tasks, policy } = useServices();
  const decided = approval.status !== 'pending';
  const approveProject = () => {
    policy.grantTrust('Write project files in src/auth/', 7);
    tasks.decide(approval.id, 'approve', 'project');
  };
  return (
    <section className="card card-approval" aria-labelledby={`appr-${approval.id}`} role="region">
      <header className="card-head">
        <h3 id={`appr-${approval.id}`}>{en.approval.heading}</h3>
        <Badge tone="warn">{AUTONOMY_LABEL[approval.autonomy]}</Badge>
        <SimBadge compact />
      </header>
      <p className="small">
        <span className="faint">{en.approval.preview}: </span>
        {approval.preview}
      </p>
      <p className="small mono faint">{approval.capability}</p>
      {decided ? (
        <p className="small">
          {en.approval.decided}: {approval.status}
          {approval.scope ? ` (${approval.scope})` : ''}
        </p>
      ) : (
        <div className="row wrap gap" role="group" aria-label="Approval options">
          <button type="button" className="btn btn-primary" onClick={() => tasks.decide(approval.id, 'approve', 'once')}>
            {en.approval.once}
          </button>
          <button type="button" className="btn" onClick={() => tasks.decide(approval.id, 'approve', 'task')}>
            {en.approval.task}
          </button>
          <button type="button" className="btn" onClick={approveProject}>
            {en.approval.project}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => tasks.decide(approval.id, 'deny')}>
            {en.approval.deny}
          </button>
        </div>
      )}
    </section>
  );
}
