import { useMemo, useState } from 'react';
import type { MemoryCategory, MemoryItem, MemoryStatus, Provenance } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { Badge, Empty, Meter, Panel, SimBadge, pct, fmtDateTime } from '../components/ui';

const PROVENANCE_TONE: Record<Provenance, 'ok' | 'warn' | 'info' | 'muted' | 'accent'> = {
  explicit: 'ok',
  inferred: 'warn',
  temporary: 'info',
  assumption: 'muted',
  outdated: 'muted',
};

const PROVENANCE_HELP: Record<Provenance, string> = {
  explicit: 'You stated it or confirmed it.',
  inferred: 'EDITH concluded it from behaviour. Not used in answers until you confirm it.',
  temporary: 'Session-only working context. Expires.',
  assumption: 'A default assumption. Not a fact about you.',
  outdated: 'Replaced by newer information.',
};

export function MemoryScreen() {
  const s = useServices();
  const all = useObservable(s.memory);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MemoryCategory | 'all'>('all');
  const [provenance, setProvenance] = useState<Provenance | 'all'>('all');
  const [status, setStatus] = useState<MemoryStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [whoAmI, setWhoAmI] = useState<{ text: string; usedIds: string[] } | null>(null);

  const visible = useMemo(
    () =>
      all.filter(
        (m) =>
          m.status !== 'deleted' &&
          (category === 'all' || m.category === category) &&
          (provenance === 'all' || m.provenance === provenance) &&
          (status === 'all' || m.status === status) &&
          (!query.trim() || m.content.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [all, category, provenance, status, query],
  );
  const selected = all.find((m) => m.id === (selectedId ?? visible[0]?.id));

  return (
    <div className="memory">
      <div className="toolbar">
        <p className="muted small">Memory is reviewable. Inferred items are labelled and stay out of answers until confirmed. Edits here are not persisted in the prototype.</p>
        <button type="button" className="btn primary small" onClick={() => setWhoAmI(s.memory.whoAmI())}>
          Ask “Who am I?”
        </button>
      </div>

      {whoAmI && (
        <Panel title="Answer from memory" actions={<SimBadge />} className="whoami">
          <p>{whoAmI.text}</p>
          <p className="small muted">
            Cited items: {whoAmI.usedIds.length ? whoAmI.usedIds.join(', ') : 'none'}
          </p>
          <button type="button" className="btn ghost small" onClick={() => setWhoAmI(null)}>
            Dismiss
          </button>
        </Panel>
      )}

      <div className="filters" role="group" aria-label="Filters">
        <label className="field-inline">
          <span className="sr-only">Search memory</span>
          <input type="search" placeholder="Search memory" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory | 'all')}>
          <option value="all">All categories</option>
          <option value="semantic">Semantic (facts)</option>
          <option value="episodic">Episodic (events)</option>
          <option value="procedural">Procedural (how-to)</option>
          <option value="working">Working (session)</option>
        </select>
        <select aria-label="Provenance" value={provenance} onChange={(e) => setProvenance(e.target.value as Provenance | 'all')}>
          <option value="all">Any provenance</option>
          {(Object.keys(PROVENANCE_HELP) as Provenance[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as MemoryStatus | 'all')}>
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="pending_review">Pending review</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>

      <div className="split">
        <Panel title={`Items (${visible.length})`} className="list-panel">
          {visible.length === 0 && <Empty>No items match these filters.</Empty>}
          <ul className="item-list" aria-label="Memory items">
            {visible.map((m) => (
              <li key={m.id}>
                <button type="button" className={`item ${selected?.id === m.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === m.id} onClick={() => setSelectedId(m.id)}>
                  <span className="row gap wrap">
                    <Badge tone={PROVENANCE_TONE[m.provenance]}>{m.provenance}</Badge>
                    <span className="small muted">{m.category}</span>
                    {m.status === 'pending_review' && <Badge tone="warn">review</Badge>}
                    {m.status === 'superseded' && <Badge tone="muted">superseded</Badge>}
                  </span>
                  <span className="item-text">{m.content}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="detail">
          {selected ? <MemoryDetail key={selected.id} item={selected} all={all} /> : <Panel><Empty>Select an item.</Empty></Panel>}
        </div>
      </div>
    </div>
  );
}

function MemoryDetail({ item, all }: { item: MemoryItem; all: MemoryItem[] }) {
  const s = useServices();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.content);
  const conflict = item.conflictsWith ? all.find((m) => m.id === item.conflictsWith) : undefined;

  return (
    <Panel
      title="Details"
      actions={<SimBadge label="Not persisted" />}
    >
      {conflict && (
        <div className="conflict" role="alert">
          <strong>Conflict:</strong> this item disagrees with <em>{conflict.content}</em>. Confirm one; the other becomes superseded.
        </div>
      )}
      {editing ? (
        <div className="stack">
          <label htmlFor="mem-edit" className="small muted">Edit content (saving marks it as explicit, owner-stated)</label>
          <textarea id="mem-edit" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row gap">
            <button type="button" className="btn primary small" onClick={() => { s.memory.edit(item.id, text); setEditing(false); }}>Save</button>
            <button type="button" className="btn ghost small" onClick={() => { setText(item.content); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="memory-content">{item.content}</p>
      )}

      <dl className="kv small">
        <dt>Provenance</dt>
        <dd><Badge tone={PROVENANCE_TONE[item.provenance]}>{item.provenance}</Badge> <span className="muted">{PROVENANCE_HELP[item.provenance]}</span></dd>
        <dt>Confidence</dt>
        <dd><Meter value={item.confidence} label="Confidence" /> <span className="muted">{pct(item.confidence)}</span></dd>
        <dt>Importance</dt>
        <dd><Meter value={item.importance} label="Importance" /> <span className="muted">{pct(item.importance)}</span></dd>
        <dt>Owner confirmed</dt>
        <dd>{item.userConfirmed ? 'Yes' : 'No'}</dd>
        <dt>Sources</dt>
        <dd>{item.sources.join(', ')}</dd>
        <dt>Version</dt>
        <dd>v{item.version} · updated {fmtDateTime(item.updatedAt)}</dd>
        <dt>Status</dt>
        <dd>{item.status}</dd>
      </dl>

      <div className="row gap wrap">
        {!editing && <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>Edit</button>}
        {!item.userConfirmed && item.status !== 'superseded' && (
          <button type="button" className="btn primary small" onClick={() => s.memory.confirm(item.id)}>Confirm</button>
        )}
        {item.status === 'pending_review' && (
          <button type="button" className="btn ghost small" onClick={() => s.memory.reject(item.id)}>Reject</button>
        )}
        <button type="button" className="btn danger small" onClick={() => s.memory.remove(item.id)}>Delete</button>
      </div>
      <p className="small muted">Inferred items are excluded from “Who am I?” answers unless confirmed.</p>
    </Panel>
  );
}
