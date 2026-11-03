import { useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import type { MemoryCategory, MemoryItem, Provenance } from '../types/contracts';
import { PROVENANCE_LABEL, provenanceTone, fmtDateTime } from '../app/presentation';
import { Tabs } from '../components/Tabs';
import { TextField } from '../components/TextField';
import { SelectField } from '../components/SelectField';
import { Badge } from '../components/Badge';
import { MemoryDetail } from '../components/MemoryDetail';
import { SimBadge } from '../components/SimBadge';

type Tab = 'explorer' | 'review';

/** Memory explorer: filters, searchable list, detail pane. The review queue shows candidates and contradictions. */
export function MemoryScreen() {
  const { memory } = useServices();
  const all = useObservable(memory);
  const [tab, setTab] = useState<Tab>('explorer');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [provenance, setProvenance] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const live = all.filter((m) => m.status !== 'deleted');

  const filtered = useMemo(
    () =>
      live.filter(
        (m) =>
          (category === 'all' || m.category === category) &&
          (provenance === 'all' || m.provenance === provenance) &&
          (status === 'all' || m.status === status) &&
          m.content.toLowerCase().includes(query.toLowerCase()),
      ),
    [live, category, provenance, status, query],
  );
  const selected = live.find((m) => m.id === selectedId) ?? filtered[0];
  const queueInferred = live.filter((m) => (m.provenance === 'inferred' || m.provenance === 'assumption' || m.provenance === 'temporary') && m.status !== 'superseded');
  const conflicts = live.filter((m) => m.conflictsWith);

  return (
    <div className="stack screen">
      <p className="screen-intro">{en.memory.intro}</p>
      <Tabs<Tab>
        label="Memory views"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'explorer', label: en.memory.explorer, count: live.length },
          { id: 'review', label: en.memory.review, count: queueInferred.length + conflicts.length },
        ]}
      />

      {tab === 'explorer' ? (
        <div className="memory-layout" role="tabpanel" id="panel-explorer" aria-labelledby="tab-explorer">
          <aside className="memory-filters stack" aria-label="Filters">
            <TextField label={en.memory.search} type="search" value={query} onChange={setQuery} placeholder={en.memory.search} />
            <SelectField
              label={en.memory.category}
              value={category}
              onChange={setCategory}
              options={[['all', en.memory.all], ['episodic', 'Episodic'], ['semantic', 'Semantic'], ['procedural', 'Procedural'], ['working', 'Working']]}
            />
            <SelectField
              label={en.memory.provenance}
              value={provenance}
              onChange={setProvenance}
              options={[['all', en.memory.all], ...(Object.entries(PROVENANCE_LABEL) as [Provenance, string][])]}
            />
            <SelectField
              label={en.memory.status}
              value={status}
              onChange={setStatus}
              options={[['all', en.memory.all], ['active', 'Active'], ['pending_review', 'Pending review'], ['superseded', 'Superseded'], ['expired', 'Expired']]}
            />
            <SimBadge compact />
          </aside>
          <section className="memory-list-pane" aria-label="Memory items">
            {filtered.length === 0 ? <p className="empty">{en.memory.empty}</p> : null}
            <ul className="memory-list">
              {filtered.map((m) => (
                <MemoryRow key={m.id} item={m} selected={selected?.id === m.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </ul>
          </section>
          <section className="memory-detail-pane" aria-label="Selected memory">
            {selected ? <MemoryDetail item={selected} /> : <p className="empty">{en.memory.empty}</p>}
          </section>
        </div>
      ) : (
        <div className="stack" role="tabpanel" id="panel-review" aria-labelledby="tab-review">
          <section aria-labelledby="queue-inferred" className="panel">
            <h2 id="queue-inferred">{en.memory.inferredQueue}</h2>
            {queueInferred.length === 0 ? <p className="empty">{en.memory.queueEmpty}</p> : null}
            <ul className="memory-list">
              {queueInferred.map((m) => (
                <MemoryRow key={m.id} item={m} selected={selected?.id === m.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="queue-conflicts" className="panel">
            <h2 id="queue-conflicts">{en.memory.conflicts}</h2>
            {conflicts.length === 0 ? <p className="empty">{en.memory.queueEmpty}</p> : null}
            <div className="conflict-grid">
              {conflicts.map((m) => {
                const other = live.find((x) => x.id === m.conflictsWith);
                return (
                  <div key={m.id} className="conflict-pair">
                    <div className="conflict-side">
                      <Badge tone={provenanceTone(m.provenance)}>{PROVENANCE_LABEL[m.provenance]}</Badge>
                      <p>{m.content}</p>
                      <span className="faint small">{fmtDateTime(m.updatedAt)}</span>
                    </div>
                    <div className="conflict-side">
                      {other ? (
                        <>
                          <Badge tone={provenanceTone(other.provenance)}>{PROVENANCE_LABEL[other.provenance]}</Badge>
                          <p>{other.content}</p>
                          <span className="faint small">{fmtDateTime(other.updatedAt)}</span>
                        </>
                      ) : (
                        <p className="faint">Other item no longer exists.</p>
                      )}
                    </div>
                    <div className="row gap wrap">
                      <button type="button" className="btn btn-primary" onClick={() => memory.confirm(m.id)}>
                        Keep this one
                      </button>
                      <button type="button" className="btn" onClick={() => memory.reject(m.id)}>
                        Reject this one
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MemoryRow({ item, selected, onSelect }: { item: MemoryItem; selected: boolean; onSelect: () => void }) {
  const pctText = `${Math.round(item.confidence * 100)}%`;
  return (
    <li>
      <button type="button" className={`memory-row${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
        <span className="row gap wrap">
          <Badge tone={provenanceTone(item.provenance)}>{PROVENANCE_LABEL[item.provenance]}</Badge>
          <Badge tone="muted">{item.category as MemoryCategory}</Badge>
        </span>
        <span className="memory-row-text">{item.content.length > 110 ? `${item.content.slice(0, 110)}…` : item.content}</span>
        <span className="faint small">Confidence {pctText}</span>
      </button>
    </li>
  );
}
