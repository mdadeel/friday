import { SimBadge } from './SimBadge';

/** Summary figure for dashboards. Value and label are both text. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="row between">
        <span className="label-caps">{label}</span>
        <SimBadge compact />
      </div>
      <span className="stat-value">{value}</span>
      {note ? <span className="small faint">{note}</span> : null}
    </div>
  );
}
