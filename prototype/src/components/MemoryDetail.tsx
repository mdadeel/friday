import { useEffect, useState } from 'react';
import type { MemoryItem } from '../types/contracts';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { PROVENANCE_LABEL, fmtDateTime, provenanceTone } from '../app/presentation';
import { Badge } from './Badge';
import { Meter } from './Meter';
import { Dialog } from './Dialog';

/** Detail pane: content, provenance, confidence, sources, versions and actions. Editing creates a new version. */
export function MemoryDetail({ item }: { item: MemoryItem }) {
  const { memory } = useServices();
  const all = useObservable(memory);
  const [draft, setDraft] = useState(item.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setDraft(item.content);
    setEditing(false);
  }, [item.id, item.content]);
  const related = item.related.map((id) => all.find((m) => m.id === id)).filter((m): m is MemoryItem => Boolean(m && m.status !== 'deleted'));
  const conflict = item.conflictsWith ? all.find((m) => m.id === item.conflictsWith) : undefined;
  const canConfirm = item.provenance === 'inferred' || item.provenance === 'assumption' || item.provenance === 'temporary';

  return (
    <article className="memory-detail stack" aria-labelledby="memory-detail-title">
      <header className="stack gap-tight">
        <div className="row gap wrap">
          <Badge tone={provenanceTone(item.provenance)}>{PROVENANCE_LABEL[item.provenance]}</Badge>
          <Badge tone="muted">{item.category}</Badge>
          <Badge tone={item.status === 'active' ? 'ok' : item.status === 'pending_review' ? 'warn' : 'muted'}>{item.status.replace('_', ' ')}</Badge>
          <span className="faint small">v{item.version}</span>
        </div>
        <h2 id="memory-detail-title" className="memory-title">
          {item.userConfirmed ? 'Confirmed by you' : 'Not confirmed by you'}
        </h2>
      </header>

      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            memory.edit(item.id, draft);
            setEditing(false);
          }}
        >
          <label className="field">
            <span className="field-label">{en.memory.edit}</span>
            <textarea className="control" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div className="row gap">
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              {en.memory.save}
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              {en.settings.cancel}
            </button>
          </div>
        </form>
      ) : (
        <p className="memory-content">{item.content}</p>
      )}

      <div className="stack gap-tight">
        <span className="small">
          <span className="faint">{en.memory.confidence}: </span>
          {Math.round(item.confidence * 100)}%
        </span>
        <Meter value={item.confidence} label={`${en.memory.confidence} ${Math.round(item.confidence * 100)} percent`} tone={item.confidence >= 0.8 ? 'ok' : 'warn'} />
      </div>

      <dl className="kv">
        <dt>{en.memory.sources}</dt>
        <dd>{item.sources.length ? item.sources.join(', ') : '—'}</dd>
        <dt>{en.memory.created}</dt>
        <dd>{fmtDateTime(item.createdAt)}</dd>
        <dt>{en.memory.updated}</dt>
        <dd>{fmtDateTime(item.updatedAt)}</dd>
      </dl>

      {conflict ? (
        <p className="warn-text small">Contradicts: “{conflict.content}”. Review both before confirming.</p>
      ) : null}

      <div className="row gap wrap" role="group" aria-label="Memory actions">
        {!editing ? (
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            {en.memory.edit}
          </button>
        ) : null}
        {canConfirm ? (
          <button type="button" className="btn btn-primary" onClick={() => memory.confirm(item.id)}>
            {en.memory.confirm}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => memory.reject(item.id)}>
          {en.memory.reject}
        </button>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          {en.memory.delete}
        </button>
        <button type="button" className="btn btn-ghost" disabled title={en.activity.linkNote}>
          {en.memory.related}: link (not in prototype)
        </button>
      </div>

      {related.length ? (
        <div className="stack gap-tight">
          <h3 className="label-caps">{en.memory.related}</h3>
          <ul className="small">
            {related.map((r) => (
              <li key={r.id}>{r.content.length > 70 ? `${r.content.slice(0, 70)}…` : r.content}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stack gap-tight">
        <h3 className="label-caps">{en.memory.history}</h3>
        <ol className="small versions">
          <li>
            v{item.version} (current): {item.content.length > 60 ? `${item.content.slice(0, 60)}…` : item.content}
          </li>
          {[...item.history].reverse().map((h) => (
            <li key={h.version} className="faint">
              v{h.version}: {h.content.length > 60 ? `${h.content.slice(0, 60)}…` : h.content} · {fmtDateTime(h.at)}
            </li>
          ))}
        </ol>
      </div>

      {confirmDelete ? (
        <Dialog
          title={en.memory.delete}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                {en.settings.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  memory.remove(item.id);
                  setConfirmDelete(false);
                }}
              >
                {en.settings.confirm}
              </button>
            </>
          }
        >
          <p>{en.memory.deleteConfirm}</p>
        </Dialog>
      ) : null}
    </article>
  );
}
