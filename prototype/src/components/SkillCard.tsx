import type { Skill } from '../types/contracts';
import { en } from '../i18n/en';
import { useServices } from '../app/services';
import { Badge } from './Badge';
import { Toggle } from './Toggle';
import { SimBadge } from './SimBadge';
import { CapabilityBadge } from './CapabilityBadge';

const ADAPTER: Record<Skill['adapter'], string> = { native: 'EDITH native', 'claude-code': 'Claude Code (read-only)', opencode: 'OpenCode (read-only)' };

/** Skill card. Instruction skills guide the model; "Instruction + tools" skills also declare tool use. */
export function SkillCard({ skill }: { skill: Skill }) {
  const { capabilities } = useServices();
  const changed = skill.hashStatus === 'changed';
  return (
    <section className="card card-skill" aria-labelledby={`skill-${skill.id}`}>
      <header className="card-head">
        <h3 id={`skill-${skill.id}`}>
          {skill.name} <span className="faint small">v{skill.version}</span>
        </h3>
        <CapabilityBadge kind={skill.kind === 'instruction' ? 'instruction' : 'native_tool'} />
        <SimBadge compact />
        <span className="spacer" />
        <Toggle label={`Enable skill ${skill.name}`} checked={skill.enabled} onChange={(v) => capabilities.setSkillEnabled(skill.id, v)} />
      </header>
      <p className="small">{skill.description}</p>
      <p className="small faint">
        {ADAPTER[skill.adapter]} · {skill.compatibility}
        {skill.requires.length ? ` · requires ${skill.requires.join(', ')}` : ''}
      </p>
      <div className="row gap wrap">
        <Badge tone={changed ? 'warn' : 'ok'}>{changed ? en.capabilities.hashChanged : en.capabilities.hashApproved}</Badge>
        {changed ? (
          <button type="button" className="btn" onClick={() => capabilities.approveSkillChange(skill.id)}>
            {en.capabilities.approveHash}
          </button>
        ) : null}
      </div>
    </section>
  );
}
