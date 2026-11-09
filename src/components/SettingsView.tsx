import { useState } from 'react';
import { tdHistory } from '../data/twelvedata';
import { DEPTHS } from '../lib/constants';
import { fmtMoney } from '../lib/format';
import type { Settings } from '../lib/types';

function NumField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  scale = 1
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min: number;
  max: number;
  step?: number;
  scale?: number;
}) {
  const [text, setText] = useState(String(+(value * scale).toFixed(2)));
  return (
    <div>
      <div className="label">{label}</div>
      <label className="payout">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          aria-label={label}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= min && v <= max) onChange(v / scale);
          }}
        />
        <span>{suffix}</span>
      </label>
    </div>
  );
}

export function SettingsView({ settings, onChange }: { settings: Settings; onChange: (s: Partial<Settings>) => void }) {
  const [key, setKey] = useState(settings.tdKey);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  const testKey = async () => {
    setKeyMsg('Testing…');
    try {
      const k = await tdHistory('GBP/USD', '1m', 2, key.trim() || 'demo');
      setKeyMsg(k.length ? `Works · GBP/USD last close ${k[k.length - 1].c}` : 'Key works (no recent candles — market may be closed)');
      onChange({ tdKey: key.trim() });
    } catch (e) {
      setKeyMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="view on cols settings">
      <div className="col">
        <div className="card o1">
          <div className="label">Bankroll & stake</div>
          <div className="row2">
            <NumField label="Bankroll" value={settings.bankroll} onChange={(bankroll) => onChange({ bankroll })} suffix="$" min={1} max={1e9} />
            <NumField label="Max stake" value={settings.maxPct} onChange={(maxPct) => onChange({ maxPct })} suffix="%" min={0.1} max={100} step={0.5} scale={100} />
          </div>
          <div className="label" style={{ marginTop: 14 }}>
            Stake sizing
          </div>
          <div className="seg c3" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <button type="button" className={settings.stakeMode === 'kelly' ? 'on' : ''} onClick={() => onChange({ stakeMode: 'kelly' })}>
              Conservative Kelly
            </button>
            <button type="button" className={settings.stakeMode === 'fixed' ? 'on' : ''} onClick={() => onChange({ stakeMode: 'fixed' })}>
              Fixed %
            </button>
          </div>
          <div className="hint">
            {settings.stakeMode === 'kelly'
              ? 'Stakes ¼ of the Kelly fraction computed from the LOW end of the 95% range, capped at your max. Setups without a proven edge get $0.'
              : 'Stakes the same % of bankroll on every signal, capped at your max. It does not protect you from setups without an edge.'}
          </div>
          {settings.stakeMode === 'fixed' && (
            <div style={{ marginTop: 12 }}>
              <NumField label="Fixed stake" value={settings.fixedPct} onChange={(fixedPct) => onChange({ fixedPct })} suffix="%" min={0.1} max={100} step={0.5} scale={100} />
            </div>
          )}
          <div className="cirow">
            Largest allowed stake right now: <b>{fmtMoney(settings.bankroll * settings.maxPct)}</b>
          </div>
        </div>

        <div className="card o2">
          <div className="label">Daily stop</div>
          <div className="row2">
            <NumField
              label="Stop after losses"
              value={settings.dailyMaxLosses}
              onChange={(v) => onChange({ dailyMaxLosses: Math.round(v) })}
              suffix="/day"
              min={0}
              max={100}
            />
            <div className="hint" style={{ alignSelf: 'end' }}>
              After this many losing signals in a day, stakes go to $0 until tomorrow. 0 turns it off.
            </div>
          </div>
        </div>

        <div className="card o3">
          <div className="label">Backtest history</div>
          <div className="seg c3">
            {DEPTHS.map((d) => (
              <button key={d} type="button" className={settings.depth === d ? 'on' : ''} onClick={() => onChange({ depth: d })}>
                {d.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="hint">Candles per backtest. More history gives tighter confidence ranges but takes longer to load.</div>
        </div>
      </div>

      <div className="col">
        <div className="card o4">
          <div className="label">
            Forex data <em>Twelve Data</em>
          </div>
          <div className="hint" style={{ marginTop: 0 }}>
            Real forex prices come from Twelve Data. Without a key the public demo key covers EUR/USD and USD/JPY. A free key (no card) unlocks
            every pair: 8 requests per minute, 800 per day. Get one at twelvedata.com.
          </div>
          <label className="payout" style={{ marginTop: 10 }}>
            <input type="text" placeholder="paste your API key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Twelve Data API key" autoComplete="off" spellCheck={false} />
          </label>
          <div className="btnrow">
            <button className="small" type="button" onClick={() => void testKey()}>
              Test & save
            </button>
            <button
              className="small"
              type="button"
              onClick={() => {
                setKey('');
                onChange({ tdKey: '' });
                setKeyMsg('Removed. Using the demo key.');
              }}
            >
              Remove key
            </button>
          </div>
          {keyMsg && <div className="srcnote">{keyMsg}</div>}
          <div className="fine">The key is stored only in this browser and sent only to api.twelvedata.com.</div>
        </div>

        <div className="card o5">
          <div className="label">Alerts</div>
          <div className="seg c3" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <button type="button" className={settings.sound ? 'on' : ''} onClick={() => onChange({ sound: true })}>
              Sound on
            </button>
            <button type="button" className={!settings.sound ? 'on' : ''} onClick={() => onChange({ sound: false })}>
              Sound off
            </button>
          </div>
        </div>

        <div className="card o6 reality">
          <div className="label">Reality check</div>
          <ul>
            <li>
              Quotex pays about 85% on a win and keeps 100% on a loss. You must win more than <b>54%</b> of trades just to break even.
            </li>
            <li>Short-term price moves are close to random. Most setups the scanner tests show no edge, and that is the honest result.</li>
            <li>OTC assets are priced by the broker, not a real market. There is no public data to test them, so this app never signals them.</li>
            <li>Bots or channels that promise 90% wins are marketing. Check every claim the way this app does: on unseen data, with a confidence range.</li>
            <li>The safest way to use this: forward-test in Watch mode with paper trades first, and only stake money on setups that keep their edge.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
