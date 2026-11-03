import { useState } from 'react';
import { useObservable, useServices } from '../../app/services';
import { TextField } from '../../components/TextField';
import { Badge } from '../../components/Badge';
import { Chip } from '../../components/Chip';
import { SimBadge } from '../../components/SimBadge';
import { en } from '../../i18n/en';
import type { RouteInfo } from '../../types/contracts';

/** Route tester: shows the decision and reason for a sample request. Nothing is executed. */
export function RoutingPanel() {
  const { routing } = useServices();
  useObservable(routing);
  const [sample, setSample] = useState('');
  const [result, setResult] = useState<RouteInfo | null>(null);
  return (
    <div className="panel stack">
      <div className="row gap"><h3>{en.settings.testRoute}</h3><SimBadge compact /></div>
      <p className="small faint">{en.settings.testRouteHint}</p>
      <div className="row gap wrap">
        <TextField label="Sample request" value={sample} onChange={setSample} placeholder="e.g. what time is it" />
        <button type="button" className="btn" onClick={() => setResult(routing.testRoute(sample))} disabled={!sample.trim()}>
          Show decision
        </button>
      </div>
      {result ? (
        <div className="row wrap gap" aria-live="polite">
          <Badge tone="accent">{result.tier}</Badge>
          <Chip>{result.model ?? en.route.noModel}</Chip>
          <Chip>{result.locality === 'Local' ? en.route.local : en.route.cloud}</Chip>
          <span className="small">{result.reason}</span>
        </div>
      ) : null}
      <p className="small faint">Cloud escalation is off by default. Cloud requests need consent per provider.</p>
    </div>
  );
}
