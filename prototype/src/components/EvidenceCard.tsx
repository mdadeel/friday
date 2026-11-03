import type { EvidenceSource } from '../types/contracts';
import { Badge } from './Badge';
import { SimBadge } from './SimBadge';

const TIER_LABEL = { 1: 'Tier 1 · primary', 2: 'Tier 2 · reputable', 3: 'Tier 3 · community' } as const;

/** Sources from the fixed reference list. URLs are shown as text: the prototype never fetches them. */
export function EvidenceCard({ sources }: { sources: EvidenceSource[] }) {
  return (
    <section className="card card-evidence" aria-label="Evidence">
      <header className="card-head">
        <h3>Sources</h3>
        <SimBadge compact />
      </header>
      <ul className="evidence-list">
        {sources.map((s) => (
          <li key={s.id}>
            <div className="row wrap gap">
              <strong>{s.title}</strong>
              <Badge tone={s.authorityTier === 1 ? 'ok' : s.authorityTier === 2 ? 'accent' : 'muted'}>{TIER_LABEL[s.authorityTier]}</Badge>
            </div>
            <div className="small faint">
              <code>{s.url}</code> · checked {s.checkedOn}
            </div>
            <p className="small">{s.claim}</p>
          </li>
        ))}
      </ul>
      <p className="small faint">Fixed, hand-checked list (simulated). Not a web search: the pages were not fetched by the prototype. See prototype/SOURCES.md.</p>
    </section>
  );
}
