import { useMemo, useState } from 'react';
import { STRATEGIES, getStrategy, type SetupResult, type StrategyId } from '../engine';
import { ASSETS, getAsset, isAvailable } from '../data/assets';
import type { ScanConfig, ScanState } from '../hooks/useScanner';
import { EXPIRIES, INTERVAL_MS, TIMEFRAMES, type Timeframe } from '../lib/constants';
import { fmtDur, pct } from '../lib/format';
import { payoutFor } from '../lib/settings';
import type { Settings } from '../lib/types';

const TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'LTCUSDT'];

function Chips<T extends string | number>({
  items,
  value,
  onChange,
  format
}: {
  items: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="chips">
      {items.map((it) => {
        const on = value.includes(it);
        return (
          <button
            key={String(it)}
            type="button"
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={() => onChange(on ? (value.length > 1 ? value.filter((x) => x !== it) : value) : [...value, it])}
          >
            {format ? format(it) : String(it)}
          </button>
        );
      })}
    </div>
  );
}

type CryptoScope = 'top' | 'all' | 'none';

interface Props {
  state: ScanState;
  settings: Settings;
  onRun: (cfg: ScanConfig) => void;
  onCancel: () => void;
  onWatch: (r: SetupResult) => void;
  onOpen: (r: SetupResult) => void;
  watchedKeys: Set<string>;
}

export function ScannerView({ state, settings, onRun, onCancel, onWatch, onOpen, watchedKeys }: Props) {
  const [crypto, setCrypto] = useState<CryptoScope>('top');
  const [gold, setGold] = useState(true);
  const [forex, setForex] = useState(false);
  const [tfs, setTfs] = useState<Timeframe[]>(['1m', '5m']);
  const [expiries, setExpiries] = useState<number[]>([1, 2, 3, 5]);
  const [strategies, setStrategies] = useState<StrategyId[]>(STRATEGIES.map((s) => s.id));
  const [showAll, setShowAll] = useState(false);

  const forexAssets = ASSETS.filter((a) => a.group === 'Forex' && a.source === 'twelvedata' && isAvailable(a, settings.tdKey));
  const assetIds = useMemo(() => {
    const ids: string[] = [];
    if (crypto === 'top') ids.push(...TOP_CRYPTO);
    if (crypto === 'all') ids.push(...ASSETS.filter((a) => a.group === 'Crypto').map((a) => a.id));
    if (gold) ids.push('PAXGUSDT');
    if (forex) ids.push(...forexAssets.map((a) => a.id));
    return ids;
  }, [crypto, gold, forex, forexAssets]);

  const series = assetIds.length * tfs.length;
  const setups = series * expiries.length * strategies.length;
  const tdRequests = forex ? forexAssets.length * tfs.length : 0;
  const running = state.status === 'running';
  const s = state.summary;
  const list = s ? (showAll ? s.results : s.results.slice(0, 20)) : [];

  const start = () =>
    onRun({
      assetIds,
      tfs,
      expiries,
      strategies,
      depth: settings.depth,
      tdKey: settings.tdKey,
      payoutFor: (id) => payoutFor(settings, id)
    });

  return (
    <section className="view on cols scan">
      <div className="col">
        <div className="card o1">
          <div className="label">
            Market scanner <em>finds setups that beat the payout</em>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            Tests every combination on real history. A setup only counts if it beats break-even on the older 70% of the data <b>and</b> again on
            the newest 30%, which it never saw. That second test is what separates a real edge from luck.
          </p>

          <div className="label" style={{ marginTop: 12 }}>
            Crypto
          </div>
          <div className="chips">
            {(['top', 'all', 'none'] as CryptoScope[]).map((c) => (
              <button key={c} type="button" className={crypto === c ? 'on' : ''} aria-pressed={crypto === c} onClick={() => setCrypto(c)}>
                {c === 'top' ? 'Top 6' : c === 'all' ? 'All 13' : 'None'}
              </button>
            ))}
          </div>
          <div className="label" style={{ marginTop: 12 }}>
            Also include
          </div>
          <div className="chips">
            <button type="button" className={gold ? 'on' : ''} aria-pressed={gold} onClick={() => setGold(!gold)}>
              Gold
            </button>
            <button
              type="button"
              className={forex ? 'on' : ''}
              aria-pressed={forex}
              onClick={() => setForex(!forex)}
              disabled={!forexAssets.length}
            >
              Forex ({forexAssets.length})
            </button>
          </div>
          {forex && (
            <div className="srcnote">
              Forex uses Twelve Data: {tdRequests} requests at 8/min ≈ {Math.ceil(tdRequests / 8)} min.{' '}
              {settings.tdKey.trim() ? '' : 'Demo key: EUR/USD and USD/JPY only.'}
            </div>
          )}

          <div className="label" style={{ marginTop: 12 }}>
            Timeframes
          </div>
          <Chips items={TIMEFRAMES} value={tfs} onChange={setTfs} />
          <div className="label" style={{ marginTop: 12 }}>
            Expiry <em>candles</em>
          </div>
          <Chips items={EXPIRIES as readonly number[]} value={expiries} onChange={setExpiries} format={(v) => `${v}c`} />
          <div className="label" style={{ marginTop: 12 }}>
            Strategies
          </div>
          <Chips items={STRATEGIES.map((x) => x.id)} value={strategies} onChange={setStrategies} format={(id) => getStrategy(id).name} />

          <div className="cirow">
            <b>{series}</b> price series × {expiries.length * strategies.length} = <b>{setups.toLocaleString()}</b> setups · {settings.depth.toLocaleString()}{' '}
            candles each
          </div>
          {running ? (
            <button className="ghost" type="button" style={{ marginTop: 12 }} onClick={onCancel}>
              Cancel scan
            </button>
          ) : (
            <button className="cta" type="button" style={{ marginTop: 12 }} onClick={start} disabled={!assetIds.length}>
              Run scan
            </button>
          )}
        </div>
      </div>

      <div className="col">
        {state.status === 'idle' && !s && (
          <div className="card o2 empty-state">
            <div className="label">Results</div>
            <p className="hint">Run a scan to rank every setup by how far its confidence range clears the break-even win rate.</p>
          </div>
        )}

        {running && (
          <div className="card o2">
            <div className="label">
              Scanning <em>{state.progress.done} / {state.progress.total} series</em>
            </div>
            <div className="progress big">
              <i style={{ width: `${(state.progress.total ? (state.progress.done / state.progress.total) * 100 : 0).toFixed(1)}%` }} />
            </div>
            <div className="cirow">
              {state.progress.waiting > 0 ? `Waiting ${Math.ceil(state.progress.waiting / 1000)} s for the Twelve Data rate limit…` : state.progress.current || '…'}
            </div>
          </div>
        )}

        {state.status === 'error' && <div className="card o2 errbox">{state.error}</div>}

        {s && !running && (
          <div className="card o2">
            <div className={`verdict ${s.validated ? 'edge' : 'noedge'}`} style={{ marginTop: 0 }}>
              <div>
                <span>{s.validated ? `${s.validated} validated edge${s.validated > 1 ? 's' : ''}` : 'No proven edge found'}</span>
                <small>
                  {s.validated
                    ? 'These beat break-even on data they were never picked on. Forward-test them in Watch mode before risking real money.'
                    : 'No setup beat the payout on unseen data. Trading any of them is expected to lose money at these payouts. Not trading is the winning move today.'}
                </small>
              </div>
            </div>
            <div className="funnel">
              <div>
                <b className="mono">{s.hypotheses.toLocaleString()}</b>
                <span>setups tested</span>
              </div>
              <div>
                <b className="mono">{s.candidates}</b>
                <span>beat break-even on older 70%</span>
              </div>
              <div>
                <b className="mono" style={{ color: s.validated ? 'var(--up)' : undefined }}>
                  {s.validated}
                </b>
                <span>confirmed on newest 30%</span>
              </div>
            </div>
            <div className="fine">
              ~{state.candlesPerSeries.toLocaleString()} candles per series · instant entry at the signal candle close (Watch mode)
              {s.candidates ? ` · confirmation uses z = ${s.zAdj.toFixed(2)} (corrected for ${s.candidates} candidates)` : ''}.
              {state.skipped.length ? ` Skipped: ${state.skipped.map((x) => `${x.what} (${x.why})`).join('; ')}.` : ''}
            </div>
          </div>
        )}

        {s && !running && (
          <div className="card o3">
            <div className="label">
              Ranking <em>best margin over break-even first</em>
            </div>
            <ul className="setups">
              {list.map((r) => {
                const a = getAsset(r.assetId)!;
                const watched = watchedKeys.has(r.key);
                const cls = r.validated ? 'edge' : r.candidate ? 'maybe' : r.label === 'Losing' ? 'losing' : '';
                return (
                  <li key={r.key} className={cls}>
                    <div className="sname">
                      <b>{a.quotex}</b> · {r.tf} · {fmtDur(r.expiry * INTERVAL_MS[r.tf as Timeframe])} · {getStrategy(r.strategy).name}
                    </div>
                    <span className={`lbl ${cls}`}>{r.label}</span>
                    <div className="snums mono">
                      older {r.train.n ? pct(r.train.winRate) : '–'} <i>({r.train.n})</i> · newest {r.test.n ? pct(r.test.winRate) : '–'}{' '}
                      <i>({r.test.n})</i> · BE {pct(r.breakEven)}
                    </div>
                    <div className="sbtns">
                      <button type="button" className="small" onClick={() => onOpen(r)}>
                        Open
                      </button>
                      <button type="button" className="small" onClick={() => onWatch(r)} disabled={watched}>
                        {watched ? '✓ Watching' : 'Watch'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {s.results.length > 20 && (
              <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show top 20' : `Show all ${s.results.length.toLocaleString()}`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
