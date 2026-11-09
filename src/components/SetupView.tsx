import { useState } from 'react';
import { breakEven, type Candle } from '../engine/engine';
import { EXPIRIES, INTERVAL_MS, MARKETS, TIMEFRAMES } from '../lib/constants';
import { fmtDur, fmtPrice, pct } from '../lib/format';
import type { Settings } from '../lib/types';
import { CHART_CANDLES, PriceChart } from './PriceChart';
import { Segmented } from './Segmented';

interface Props {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  candles: Candle[];
  now: number;
  onGenerate: () => void;
  busy: boolean;
}

export function SetupView({ settings, onChange, candles, now, onGenerate, busy }: Props) {
  const [payoutText, setPayoutText] = useState(String(Math.round(settings.payout * 100)));
  const shown = candles.slice(-CHART_CANDLES);
  const last = shown[shown.length - 1];
  const change = last ? (last.c - shown[0].o) / shown[0].o : NaN;

  return (
    <section className="view on">
      <div className="card">
        <div className="label">Market</div>
        <Segmented label="Market" items={MARKETS} value={settings.symbol} onChange={(symbol) => onChange({ symbol })} cols={3} />
      </div>

      <div className="card">
        <div className="label">Timeframe</div>
        <Segmented label="Timeframe" items={TIMEFRAMES} value={settings.tf} onChange={(tf) => onChange({ tf })} cols={4} />
        <div className="label" style={{ marginTop: 14 }}>
          Expiry <em>candles</em>
        </div>
        <Segmented
          label="Expiry"
          items={EXPIRIES}
          value={settings.expiry}
          onChange={(expiry) => onChange({ expiry })}
          cols={4}
          format={(v) => `${v} candle${v > 1 ? 's' : ''}`}
        />
        <div className="row2" style={{ marginTop: 14 }}>
          <div>
            <div className="label">Payout</div>
            <label className="payout">
              <input
                type="number"
                inputMode="decimal"
                min={1}
                max={200}
                step={1}
                value={payoutText}
                aria-label="Payout percent"
                onChange={(e) => {
                  setPayoutText(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0 && v <= 200) onChange({ payout: v / 100 });
                }}
              />
              <span>%</span>
            </label>
          </div>
          <div>
            <div className="label">Break-even</div>
            <div className="be">
              need <b>{pct(breakEven(settings.payout))}</b> wins
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="pricebar">
          <div>
            <div className="sym">
              {settings.symbol} · {settings.tf}
            </div>
            <div className="px mono">{fmtPrice(last?.c)}</div>
          </div>
          <div className="chg">
            {Number.isFinite(change) && (
              <>
                <span style={{ color: change >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {change >= 0 ? '+' : '−'}
                  {Math.abs(change * 100).toFixed(2)}%
                </span>
                <br />
                {shown.length} candles
              </>
            )}
          </div>
        </div>
        <PriceChart candles={candles} />
        <div className="chartfoot">
          <span>last {CHART_CANDLES} candles</span>
          <span>{last ? `closes in ${fmtDur(last.t + INTERVAL_MS[settings.tf] - now)}` : '–'}</span>
        </div>
      </div>

      <button className="cta" type="button" onClick={onGenerate} disabled={busy}>
        Generate Signal
      </button>
    </section>
  );
}
