import { useObservable, useServices } from '../../app/services';
import { en } from '../../i18n/en';
import { Badge } from '../../components/Badge';
import { SimBadge } from '../../components/SimBadge';

/**
 * Published model catalogue. Status is always "not checked": the prototype cannot install, load or probe a model.
 * Load is disabled with the reason shown.
 */
export function LocalModelsPanel() {
  const { routing } = useServices();
  const models = useObservable(routing).models;
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Model catalogue</h3><SimBadge compact /></div>
      <p className="small faint">{en.routing.catalogueNote}</p>
      <ul className="stack gap-tight">
        {models.map((m) => (
          <li key={m.id} className="row between wrap gap">
            <div className="stack gap-tight">
              <span className="mono">{m.name}</span>
              <span className="small faint">
                {m.provider} · {m.sizeLabel} · {m.context} context · {m.capabilities.join(', ')}
              </span>
              <span className="small faint">{en.routing.source}: {m.source} (checked {m.checkedOn})</span>
            </div>
            <div className="row gap">
              <Badge tone="muted">{en.routing.notChecked}</Badge>
              <button type="button" className="btn btn-small" disabled title={en.routing.loadDisabled}>
                Load
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="small faint">{en.routing.loadDisabled}</p>
    </div>
  );
}
