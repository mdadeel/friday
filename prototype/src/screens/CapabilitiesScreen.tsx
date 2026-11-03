import { useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { Tabs } from '../components/Tabs';
import { McpServerCard } from '../components/McpServerCard';
import { SkillCard } from '../components/SkillCard';
import { CapabilityBadge } from '../components/CapabilityBadge';
import { SimBadge } from '../components/SimBadge';

type Tab = 'mcp' | 'skills';

/** Skills and MCP manager: one view of capabilities grouped by source, with the type badge on every item. */
export function CapabilitiesScreen() {
  const { capabilities } = useServices();
  const state = useObservable(capabilities);
  const [tab, setTab] = useState<Tab>('mcp');
  return (
    <div className="stack screen">
      <p className="screen-intro">{en.capabilities.intro}</p>
      <div className="row gap wrap legend" aria-label="Badge legend">
        <CapabilityBadge kind="instruction" />
        <CapabilityBadge kind="native_tool" />
        <CapabilityBadge kind="mcp_tool" />
        <CapabilityBadge kind="external_service" />
        <span className="small faint">Instruction is knowledge. The other three can act.</span>
        <SimBadge compact />
      </div>
      <Tabs<Tab>
        label="Capability types"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mcp', label: en.capabilities.mcp, count: state.servers.length },
          { id: 'skills', label: en.capabilities.skills, count: state.skills.length },
        ]}
      />
      {tab === 'mcp' ? (
        <div className="grid-cards" role="tabpanel" id="panel-mcp" aria-labelledby="tab-mcp">
          {state.servers.length === 0 ? <p className="empty">{en.capabilities.empty}</p> : null}
          {state.servers.map((s) => (
            <McpServerCard key={s.id} server={s} />
          ))}
        </div>
      ) : (
        <div className="grid-cards" role="tabpanel" id="panel-skills" aria-labelledby="tab-skills">
          {state.skills.map((s) => (
            <SkillCard key={s.id} skill={s} />
          ))}
        </div>
      )}
    </div>
  );
}
