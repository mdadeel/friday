import { useObservable, useServices } from '../../app/services';
import { Badge } from '../../components/Badge';
import { Toggle } from '../../components/Toggle';
import { SimBadge } from '../../components/SimBadge';

/** Skills summary. Content hashes are shown so a changed skill is reviewed before use. */
export function SkillsPanel() {
  const { capabilities } = useServices();
  const skills = useObservable(capabilities).skills;
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Installed skills</h3><SimBadge compact /></div>
      <ul className="stack gap-tight">
        {skills.map((s) => (
          <li key={s.id} className="row between wrap gap">
            <span>
              {s.name} <Badge tone={s.hashStatus === 'approved' ? 'ok' : 'warn'}>{s.hashStatus === 'approved' ? 'Hash approved' : 'Changed — review'}</Badge>
            </span>
            <Toggle label={`Enable skill ${s.name}`} checked={s.enabled} onChange={(v) => capabilities.setSkillEnabled(s.id, v)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
