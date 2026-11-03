import { useObservable, useServices } from '../../app/services';
import { AUTONOMY_LABEL, fmtDateTime } from '../../app/presentation';
import { en } from '../../i18n/en';
import type { AutonomyClass, PolicyLimits } from '../../types/contracts';
import { NumberField } from '../../components/NumberField';
import { Badge } from '../../components/Badge';
import { Icon } from '../../components/Icon';
import { SimBadge } from '../../components/SimBadge';

const GROUPS = ['Read files', 'Write project files', 'Run allowlisted commands', 'Network read', 'Network write', 'Install dependencies', 'Delete files', 'System changes'];
const SCOPES = [
  ['inside_project', 'Inside project'],
  ['inside_home', 'Inside home'],
  ['elsewhere', 'Elsewhere'],
] as const;
const LIMIT_FIELDS: { key: keyof PolicyLimits; label: string; unit: string; min: number; max: number }[] = [
  { key: 'filesPerTask', label: 'Files per task before confirmation', unit: 'files', min: 1, max: 50 },
  { key: 'writtenMB', label: 'Written per task', unit: 'MB', min: 1, max: 100 },
  { key: 'processRuns', label: 'Process runs per task', unit: 'runs', min: 1, max: 200 },
  { key: 'fetches', label: 'Fetches per task', unit: 'fetches', min: 1, max: 200 },
  { key: 'budgetMinutes', label: 'Wall-clock budget per task', unit: 'min', min: 1, max: 240 },
];

/** Policy matrix, per-task limits, trusted grants and the audit trail. Locked cells explain why they cannot change. */
export function AutonomyPanel() {
  const { policy } = useServices();
  const state = useObservable(policy);
  return (
    <div className="stack">
      <section className="panel stack" aria-labelledby="matrix-h">
        <div className="row gap"><h3 id="matrix-h">Policy matrix</h3><SimBadge compact /></div>
        <p className="small faint">Changes here are not enforced in the prototype. Locked cells cannot change.</p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Autonomy class per capability group and scope</caption>
            <thead>
              <tr>
                <th scope="col">Capability group</th>
                {SCOPES.map(([id, label]) => (
                  <th key={id} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <tr key={g}>
                  <th scope="row">{g}</th>
                  {SCOPES.map(([scope]) => {
                    const rule = state.rules.find((r) => r.group === g && r.scope === scope);
                    if (!rule) return <td key={scope}>—</td>;
                    if (rule.locked) {
                      return (
                        <td key={scope} title={rule.explanation}>
                          <Badge tone="error">
                            <Icon name="lock" size={12} /> {AUTONOMY_LABEL.blocked}
                          </Badge>
                          <span className="small faint"> {rule.explanation}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={scope}>
                        <select
                          className="control"
                          aria-label={`${g}, ${scope.replace('_', ' ')}`}
                          value={rule.autonomy}
                          onChange={(e) => policy.setAutonomy(rule.id, e.target.value as AutonomyClass)}
                        >
                          <option value="automatic">{AUTONOMY_LABEL.automatic}</option>
                          <option value="policy_controlled">{AUTONOMY_LABEL.policy_controlled}</option>
                          <option value="confirm_required">{AUTONOMY_LABEL.confirm_required}</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel stack" aria-labelledby="limits-h">
        <h3 id="limits-h">{en.settings.limits}</h3>
        <p className="small faint">Defaults are hypotheses until measured.</p>
        <div className="settings-fields">
          {LIMIT_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} unit={f.unit} min={f.min} max={f.max} value={state.limits[f.key]} onChange={(v) => policy.setLimit(f.key, v)} />
          ))}
        </div>
      </section>

      <section className="panel stack" aria-labelledby="trust-h">
        <h3 id="trust-h">{en.settings.trusts}</h3>
        {state.trusts.length === 0 ? <p className="empty">{en.settings.noTrusts}</p> : null}
        <ul className="stack gap-tight">
          {state.trusts.map((t) => (
            <li key={t.id} className="row between wrap gap">
              <span>
                {t.scope} <span className="small faint">until {fmtDateTime(t.expiresAt)}</span>
              </span>
              <button type="button" className="btn btn-small" onClick={() => policy.revokeTrust(t.id)}>
                {en.settings.revoke}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack" aria-labelledby="audit-h">
        <h3 id="audit-h">Approval and policy history</h3>
        <ol className="stack gap-tight small">
          {state.audit.slice(0, 12).map((a) => (
            <li key={a.id}>
              <span className="faint mono">{fmtDateTime(a.at)}</span> {a.summary}
              {a.decision ? <span className="faint"> — {a.decision}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
