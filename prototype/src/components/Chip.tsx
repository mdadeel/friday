import type { ReactNode } from 'react';

/** Route footer item. When `onClick` is set it renders as a button that opens detail. */
export function Chip({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label?: string }) {
  if (onClick) {
    return (
      <button type="button" className="chip chip-action" onClick={onClick} aria-label={label}>
        {children}
      </button>
    );
  }
  return <span className="chip">{children}</span>;
}
