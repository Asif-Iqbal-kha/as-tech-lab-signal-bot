import { useEffect, useState } from 'react';
import { STRATEGIES, breakEven, getStrategy, type Candle } from '../engine';
import { getAsset, isAvailable } from '../data/assets';
import { EXPIRIES, INTERVAL_MS, TIMEFRAMES } from '../lib/constants';
import { fmtDur, fmtPrice, pct } from '../lib/format';
import { payoutFor } from '../lib/settings';
import type { Settings } from '../lib/types';
import { AssetSelect } from './AssetSelect';
import { CHART_CANDLES, PriceChart } from './PriceChart';
import { Segmented } from './Segmented';

interface Props {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  candles: Candle[];
  feedError: string | null;
  now: number;
  onGenerate: () => void;
  onWatch: () => void;
  watched: boolean;
  busy: boolean;
  dailyStop: { stopped: boolean; losses: number; max: number };
}

export function SetupView({ settings, onChange, candles, feedError, now, onGenerate, onWatch, watched, busy, dailyStop }: Props) {
  const asset = getAsset(settings.assetId)!;
  const payout = payoutFor(settings, asset.id);
  const [payoutText, setPayoutText] = useState(String(Math.round(payout * 100)));
  // show the stored payout when the asset changes (block body: effects must not return values)
  useEffect(() => {
    setPayoutText(String(Math.round(payoutFor(settings, settings.assetId) * 100)));
  }, [settings.assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  const ms = INTERVAL_MS[settings.tf];
  const strategy = getStrategy(settings.strategy);
  const available = isAvailable(asset, settings.tdKey);
  const shown = candles.slice(-CHART_CANDLES);
  const last = shown[shown.length - 1];
  const change = last ? (last.c - shown[0].o) / shown[0].o : NaN;
  const nextClose = Math.floor(now / ms) * ms + ms;

  return (
    <section className="view on cols setup">
      <div className="col">
        <div className="card chartcard o3">
          <div className="pricebar">
            <div>
              <div className="sym">
                {asset.quotex} · {settings.tf}
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
            <span>{asset.source === 'binance' ? `last ${CHART_CANDLES} candles · live` : 'closed candles · forex'}</span>
            <span>closes in {fmtDur(nextClose - now)}</span>
          </div>
          {feedError && <div className="srcnote warn">{feedError}</div>}
        </div>
      </div>

      <div className="col">
        <div className="card o1">
          <div className="label">
            Quotex asset <em>real market only</em>
          </div>
          <AssetSelect value={settings.assetId} onChange={(assetId) => onChange({ assetId })} tdKey={settings.tdKey} />
        </div>

        <div className="card o2">
          <div className="label">Strategy</div>
          <Segmented
            label="Strategy"
            items={STRATEGIES.map((s) => s.id)}
            value={settings.strategy}
            onChange={(strategy) => onChange({ strategy })}
            cols={4}
            format={(id) => getStrategy(id).name}
          />
          <div className="hint">{strategy.description}</div>

          <div className="label" style={{ marginTop: 14 }}>
            Candle timeframe
          </div>
          <Segmented label="Timeframe" items={TIMEFRAMES} value={settings.tf} onChange={(tf) => onChange({ tf })} cols={4} />
          <div className="label" style={{ marginTop: 14 }}>
            Expiry <em>Quotex time</em>
          </div>
          <Segmented
            label="Expiry"
            items={EXPIRIES}
            value={settings.expiry}
            onChange={(expiry) => onChange({ expiry })}
            cols={4}
            format={(v) => fmtDur(v * ms)}
          />
          <div className="row2" style={{ marginTop: 14 }}>
            <div>
              <div className="label">Payout on Quotex</div>
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
                    if (Number.isFinite(v) && v > 0 && v <= 200) onChange({ payouts: { ...settings.payouts, [asset.id]: v / 100 } });
                  }}
                />
                <span>%</span>
              </label>
            </div>
            <div>
              <div className="label">Break-even</div>
              <div className="be">
                need <b>{pct(breakEven(payout))}</b> wins
              </div>
            </div>
          </div>
        </div>

        {dailyStop.stopped && (
          <div className="banner stop o4">
            Daily stop reached: {dailyStop.losses} losses today (limit {dailyStop.max}). Signals are paper-only until tomorrow.
          </div>
        )}
        <div className="actions o4">
          <button className="cta" type="button" onClick={onGenerate} disabled={busy || !available}>
            Generate Signal
          </button>
          <button className="ghost" type="button" onClick={onWatch} disabled={!available || watched}>
            {watched ? '✓ In your Watch list' : '+ Watch this setup'}
          </button>
        </div>
      </div>
    </section>
  );
}
