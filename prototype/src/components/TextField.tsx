import { useId } from 'react';

export function TextField({
  label,
  value,
  onChange,
  help,
  placeholder,
  hideLabel,
  type = 'text',
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  placeholder?: string;
  hideLabel?: boolean;
  type?: 'text' | 'search';
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const helpId = useId();
  return (
    <label className="field">
      <span className={hideLabel ? 'sr-only' : 'field-label'}>{label}</span>
      <input
        className="control"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
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
