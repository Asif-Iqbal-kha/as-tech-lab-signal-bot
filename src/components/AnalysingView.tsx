import type { StepId, StepState } from '../lib/types';

export const STEPS: [StepId, string][] = [
  ['fetch', 'Fetching candles'],
  ['ind', 'Calculating indicators'],
  ['bt', 'Running backtest']
];

interface Props {
  what: string;
  steps: Record<StepId, StepState>;
  error: string | null;
  onBack: () => void;
}

export function AnalysingView({ what, steps, error, onBack }: Props) {
  return (
    <section className="view on narrow">
      <div className="card">
        <div className="label">
          Analysing <em>{what}</em>
        </div>
        <ul className="steps">
          {STEPS.map(([id, title]) => {
            const s = steps[id];
            return (
              <li key={id} className={s.status === 'pending' ? '' : s.status}>
                <span className="ico">{s.status === 'done' ? '✓' : s.status === 'fail' ? '!' : ''}</span>
                <span className="t">{title}</span>
                <span className="ms">{s.ms == null ? '' : s.ms < 1 ? '<1 ms' : `${Math.round(s.ms)} ms`}</span>
                <span className="d">{s.detail ?? ''}</span>
              </li>
            );
          })}
        </ul>
        {error && <div className="errbox">Error: {error}</div>}
      </div>
      {error && (
        <button className="ghost" type="button" onClick={onBack}>
          Back
        </button>
      )}
    </section>
  );
}
