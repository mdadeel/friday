import type { BadgeTone } from './Badge';

/** Colour dot plus text. Never colour alone. `pulse` gives the single subtle working pulse from spec §5. */
export function StatusDot({ tone, label, pulse = false }: { tone: BadgeTone; label: string; pulse?: boolean }) {
  return (
    <span className={`status-dot status-${tone}${pulse ? ' is-pulse' : ''}`}>
      <span className="dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
