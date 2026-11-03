/** Thin level or progress bar. Value is 0..1. Exposes a numeric value to assistive tech. */
export function Meter({ value, label, tone = 'accent' }: { value: number; label: string; tone?: 'accent' | 'warn' | 'ok' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`meter meter-${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
