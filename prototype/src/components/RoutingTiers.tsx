import { en } from '../i18n/en';
import type { LocalModel, ProviderInfo, TierConfig } from '../types/contracts';
import { useServices } from '../app/services';
import { SelectField } from './SelectField';
import { Icon } from './Icon';
import { Chip } from './Chip';

/** Tier table: provider and model per tier, with a fallback order that can be reordered by buttons (keyboard accessible). */
export function RoutingTiers({ tiers, providers, models }: { tiers: TierConfig[]; providers: ProviderInfo[]; models: LocalModel[] }) {
  const { routing } = useServices();
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Tier configuration</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Provider</th>
            <th scope="col">Model</th>
            <th scope="col">{en.routing.fallbackOrder}</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => {
            const providerModels = models.filter((m) => m.provider === t.provider);
            return (
              <tr key={t.tier}>
                <td>
                  <strong>{t.tier}</strong> <span className="small faint">{t.label}</span>
                </td>
                <td>
                  <SelectField
                    label={`${t.tier} provider`}
                    hideLabel
                    value={t.provider}
                    options={providers.map((p) => [p.id, p.name])}
                    onChange={(v) => routing.setTier(t.tier, { provider: v, model: models.find((m) => m.provider === v)?.name ?? '' })}
                  />
                </td>
                <td>
                  <SelectField
                    label={`${t.tier} model`}
                    hideLabel
                    value={providerModels.some((m) => m.name === t.model) ? t.model : ''}
                    options={[['', providerModels.length ? '(choose)' : en.route.noModel], ...providerModels.map((m) => [m.name, m.name] as [string, string])]}
                    onChange={(v) => routing.setTier(t.tier, { model: v })}
                    disabled={providerModels.length === 0}
                  />
                </td>
                <td>
                  <ol className="fallback-list" aria-label={`${t.tier} fallbacks`}>
                    {t.fallbacks.length === 0 ? <li className="faint small">{en.route.none}</li> : null}
                    {t.fallbacks.map((f, i) => (
                      <li key={`${f}-${i}`} className="row gap">
                        <Chip>{f}</Chip>
                        <button type="button" className="btn btn-icon btn-ghost" disabled={i === 0} aria-label={`${en.routing.up}: ${f}`} onClick={() => move(t.fallbacks, i, -1, (next) => routing.setFallbacks(t.tier, next))}>
                          <Icon name="chevronUp" size={14} />
                        </button>
                        <button type="button" className="btn btn-icon btn-ghost" disabled={i === t.fallbacks.length - 1} aria-label={`${en.routing.down}: ${f}`} onClick={() => move(t.fallbacks, i, 1, (next) => routing.setFallbacks(t.tier, next))}>
                          <Icon name="chevronDown" size={14} />
                        </button>
                      </li>
                    ))}
                  </ol>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function move(list: string[], i: number, dir: 1 | -1, apply: (next: string[]) => void): void {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  apply(next);
}
