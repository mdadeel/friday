import { en } from '../i18n/en';

/** Marks data that comes from mock services. Always present where simulated content appears. */
export function SimBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`badge badge-sim${compact ? ' badge-compact' : ''}`} title={en.sim.title}>
      {en.sim.badge}
    </span>
  );
}
