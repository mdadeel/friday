import { useId } from 'react';

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  help?: string;
}) {
  const helpId = useId();
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit ? <span className="faint"> ({unit})</span> : null}
      </span>
      <input
        className="control control-number"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        aria-describedby={help ? helpId : undefined}
      />
      {help ? (
        <span id={helpId} className="field-help">
          {help}
        </span>
      ) : null}
    </label>
  );
}
