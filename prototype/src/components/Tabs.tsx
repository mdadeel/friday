/** Tabs with arrow-key navigation. The panel is rendered by the caller. */
export function Tabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: { id: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  const move = (dir: 1 | -1) => {
    const i = tabs.findIndex((t) => t.id === value);
    onChange(tabs[(i + dir + tabs.length) % tabs.length].id);
  };
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') move(1);
        if (e.key === 'ArrowLeft') move(-1);
      }}
    >
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tab${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
