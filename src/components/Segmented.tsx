interface Props<T extends string | number> {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  cols: 3 | 4;
  format?: (v: T) => string;
  label: string;
}

export function Segmented<T extends string | number>({ items, value, onChange, cols, format, label }: Props<T>) {
  return (
    <div className={`seg c${cols}`} role="radiogroup" aria-label={label}>
      {items.map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          {format ? format(v) : String(v)}
        </button>
      ))}
    </div>
  );
}
