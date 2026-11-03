import { useObservable, useServices } from '../../app/services';
import { Badge } from '../../components/Badge';
import { Toggle } from '../../components/Toggle';
import { SimBadge } from '../../components/SimBadge';

/** Installed models with declared tool-calling support. Benchmarks stay "Not benchmarked" until gate G1. */
export function LocalModelsPanel() {
  const { routing } = useServices();
  const models = useObservable(routing).models;
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Installed models</h3><SimBadge compact /></div>
      <ul className="stack gap-tight">
        {models.map((m) => (
          <li key={m.id} className="row between wrap gap">
            <div className="stack gap-tight">
              <span>{m.name}</span>
              <span className="small faint">
                {m.provider} · {m.sizeGB} GB · {m.quant} · {m.contextTokens.toLocaleString('en-GB')} tokens · tool calling: {m.toolCalling}
              </span>
            </div>
            <div className="row gap">
              <Badge tone="muted">Not benchmarked</Badge>
              <Toggle label={`Load ${m.name}`} checked={m.loaded} onChange={(v) => routing.setModelLoaded(m.id, v)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
