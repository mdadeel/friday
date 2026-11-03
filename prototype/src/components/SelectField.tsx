import { useId } from 'react';

export function SelectField({
  label,
  value,
  options,
  onChange,
  help,
  disabled,
  hideLabel,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  help?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const helpId = useId();
  return (
    <label className={`field${hideLabel ? ' field-hidden-label' : ''}`}>
      <span className={hideLabel ? 'sr-only' : 'field-label'}>{label}</span>
      <select className="control" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-describedby={help ? helpId : undefined}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      {help ? (
        <span id={helpId} className="field-help">
          {help}
        </span>
      ) : null}
    </label>
  );
}
