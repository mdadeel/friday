import { useState } from 'react';
import { useObservable, useServices } from '../../app/services';
import { TextField } from '../../components/TextField';
import { Badge } from '../../components/Badge';
import { SimBadge } from '../../components/SimBadge';
import type { SearchResult } from '../../types/contracts';

/** Authority domains (domain|tier) and a test query against the simulated reference bank. */
export function SearchPanel() {
  const { settings, search } = useServices();
  const values = useObservable(settings);
  const domains = values.search.authorityDomains as string[];
  const [newDomain, setNewDomain] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const setDomains = (next: string[]) => settings.set('search', 'authorityDomains', next);
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Authority tiers</h3><SimBadge compact /></div>
      <ul className="stack gap-tight">
        {domains.map((entry) => {
          const [domain, tier] = entry.split('|');
          return (
            <li key={entry} className="row between gap">
              <span>
                <code>{domain}</code> <Badge tone={tier === '1' ? 'ok' : tier === '2' ? 'accent' : 'muted'}>{`Tier ${tier}`}</Badge>
              </span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setDomains(domains.filter((d) => d !== entry))}>
                Remove {domain}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="row gap wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const d = newDomain.trim().toLowerCase();
          if (d && !domains.some((x) => x.startsWith(`${d}|`))) setDomains([...domains, `${d}|3`]);
          setNewDomain('');
        }}
      >
        <TextField label="Add domain" value={newDomain} onChange={setNewDomain} placeholder="example.org" />
        <button type="submit" className="btn" disabled={!newDomain.trim()}>
          Add domain (tier 3)
        </button>
      </form>
      <form
        className="row gap wrap"
        onSubmit={(e) => {
          e.preventDefault();
          search.query(query).then(setResults);
        }}
      >
        <TextField label="Test query" value={query} onChange={setQuery} placeholder="e.g. MCP transports" />
        <button type="submit" className="btn" disabled={!query.trim()}>
          Run test query
        </button>
      </form>
      {results ? (
        <ul className="stack gap-tight" aria-live="polite" aria-label="Test query results">
          {results.length === 0 ? <li className="empty">No simulated match.</li> : null}
          {results.map((r) => (
            <li key={r.url} className="small">
              <strong>{r.title}</strong> <Badge tone="muted">{`Tier ${r.authorityTier}`}</Badge> <code>{r.url}</code>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small faint">Results come from a fixed simulated bank. No web request is made. Robots.txt is always respected in the real system.</p>
    </div>
  );
}
