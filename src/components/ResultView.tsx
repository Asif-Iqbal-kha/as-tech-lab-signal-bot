import type { Signal, Stats } from '../engine/engine';
import { INTERVAL_MS } from '../lib/constants';
import { fmtClock, fmtDur, fmtScore, fmtSigned, fmtTime, pct, priceDecimals } from '../lib/format';
import type { SignalRun } from '../lib/types';

/* ---------- reasons ---------- */

function Reasons({ sig }: { sig: Signal }) {
  const v = sig.values;
  const [c1, c2, c3, c4] = sig.components;
  const word = (s: number, a: string, b: string, z: string) => (s > 0 ? a : s < 0 ? b : z);
  const dp = priceDecimals(v.close);
  const items: [string, number, string][] = [
    [word(c1, 'EMA 9 above EMA 21', 'EMA 9 below EMA 21', 'EMA 9 equal to EMA 21'), c1, `${v.ema9.toFixed(dp)} vs ${v.ema21.toFixed(dp)}`],
    [word(c2, 'MACD histogram positive', 'MACD histogram negative', 'MACD histogram at zero'), c2, `hist ${v.hist.toExponential(2)}`],
    [word(c3, 'MACD histogram rising', 'MACD histogram falling', 'MACD histogram flat'), c3, `${v.histPrev.toExponential(2)} → ${v.hist.toExponential(2)}`],
    [word(c4, 'Price above EMA 50', 'Price below EMA 50', 'Price on EMA 50'), c4, `${v.close.toFixed(dp)} vs ${v.ema50.toFixed(dp)}`]
  ];
  const zone = v.rsi > 70 ? 'overbought' : v.rsi < 30 ? 'oversold' : 'neutral';
  return (
    <ul className="reasons">
      {items.map(([t, s, d]) => (
        <li key={t}>
          <span>
            {t}
            <span className="sub2">{d}</span>
          </span>
          <span className={`v ${s > 0 ? 'p' : s < 0 ? 'n' : ''}`}>{s > 0 ? '+1' : s < 0 ? '−1' : '0'}</span>
        </li>
      ))}
      <li>
        <span>
          RSI 14 is {v.rsi.toFixed(1)} ({zone})
          <span className="sub2">filter: no BUY above 70, no SELL below 30</span>
        </span>
        <span className="v">filter</span>
      </li>
      {sig.filtered ? (
        <li className="note">
          <span>
            Score qualified for {sig.filtered}, but RSI {v.rsi.toFixed(1)} is {sig.filtered === 'BUY' ? 'above 70' : 'below 30'}, so the
            trade is skipped.
          </span>
        </li>
      ) : sig.dir === 'NONE' ? (
        <li className="note">
          <span>Score {fmtScore(sig.score)} is between −3 and +3: indicators disagree, no trade.</span>
        </li>
      ) : null}
    </ul>
  );
}

/* ---------- confidence bar ---------- */

const AX_LO = 0.3;
const AX_HI = 0.7;
const pos = (x: number) => Math.max(0, Math.min(1, (x - AX_LO) / (AX_HI - AX_LO))) * 100;

function CiBar({ st }: { st: Stats }) {
  return (
    <>
      <div className="cibar">
        <div className="track" />
        {st.n > 0 && (
          <>
            <div className="rng" style={{ left: `${pos(st.ci.lo)}%`, width: `${pos(st.ci.hi) - pos(st.ci.lo)}%` }} />
            <div className="pt" style={{ left: `${pos(st.winRate)}%` }} />
          </>
        )}
        <div className="be" style={{ left: `${pos(st.breakEven)}%` }}>
          <span>BE {pct(st.breakEven)}</span>
        </div>
      </div>
      <div className="ciaxis">
        <span>30%</span>
        <span>50%</span>
        <span>70%</span>
      </div>
    </>
  );
}

function verdictText(st: Stats) {
  if (!st.n) return 'No historical trades to judge.';
  if (st.verdict === 'Edge found') return `Whole 95% range is above the ${pct(st.breakEven)} break-even.`;
  if (st.verdict === 'Losing setup') return `Whole 95% range is below the ${pct(st.breakEven)} break-even.`;
  return `95% range overlaps the ${pct(st.breakEven)} break-even. Can't tell from luck.`;
}

/* ---------- countdown ---------- */

function Countdown({ run, now }: { run: SignalRun; now: number }) {
  const r = run.entry;
  const ms = INTERVAL_MS[r.tf];
  let label: string;
  let sub: string;
  let val: string;
  let frac: number;
  if (now < r.entryAt) {
    label = r.dir === 'NONE' ? 'Next candle close' : 'Entry in';
    sub = r.dir === 'NONE' ? 'generate again after it closes' : `enter ${r.dir === 'BUY' ? 'UP' : 'DOWN'} at the candle close`;
    val = fmtDur(r.entryAt - now);
    frac = 1 - (r.entryAt - now) / ms;
  } else if (r.dir !== 'NONE' && now < r.exitAt) {
    label = 'Trade running';
    sub = `expires after ${r.expiry} candle${r.expiry > 1 ? 's' : ''}`;
    val = fmtDur(r.exitAt - now);
    frac = 1 - (r.exitAt - now) / (r.exitAt - r.entryAt);
  } else {
    label = r.dir === 'NONE' ? 'Signal is stale' : 'Expired';
    sub = r.dir === 'NONE' ? 'generate a new signal' : 'result is checked in the Log';
    val = '00:00';
    frac = 1;
  }
  return (
    <div className="card">
      <div className="countdown">
        <div>
          <div className="k">{label}</div>
          <div className="s">{sub}</div>
        </div>
        <div className="v mono">{val}</div>
      </div>
      <div className="progress">
        <i style={{ width: `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

/* ---------- view ---------- */

interface Props {
  run: SignalRun;
  now: number;
  onNew: () => void;
  onBack: () => void;
  busy: boolean;
}

export function ResultView({ run, now, onNew, onBack, busy }: Props) {
  const { entry: r, sig, st, scope, closed } = run;
  const strength = Math.abs(sig.score);
  const verdictCls = st.verdict === 'Edge found' ? 'edge' : st.verdict === 'Losing setup' ? 'losing' : 'noedge';

  return (
    <section className="view on">
      <div className={`sig ${r.dir}`}>
        <div className="meta">
          {r.symbol} · {r.tf} · expiry {r.expiry} candle{r.expiry > 1 ? 's' : ''}
        </div>
        <div className="big">{r.dir === 'NONE' ? 'NO TRADE' : r.dir}</div>
        <div className="sub">{r.dir === 'BUY' ? '▲ UP' : r.dir === 'SELL' ? '▼ DOWN' : 'stand aside'}</div>
        <div className="pips">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < strength ? 'f' : ''} />
          ))}
        </div>
        <div className="strength">
          Signal strength <b>{fmtScore(sig.score)} / 4</b>
        </div>
      </div>

      <Countdown run={run} now={now} />

      <div className="card">
        <div className="label">
          Why <em>candle closed {fmtClock(r.signalCandleOpen + INTERVAL_MS[r.tf])}</em>
        </div>
        <Reasons sig={sig} />
      </div>

      <div className="card">
        <div className="label">
          Backtest win rate <em>{scope === 'ANY' ? 'all BUY+SELL signals' : `${scope} signals`}</em>
        </div>
        <div className="wr">
          <div className="v mono">{st.n ? pct(st.winRate) : '–'}</div>
          <div className="n">
            {st.n ? (
              <>
                {st.total} trades
                <br />
                {st.wins}W · {st.losses}L · {st.ties}T
              </>
            ) : (
              <>
                0 decisive trades
                <br />
                in {closed.length} candles
              </>
            )}
          </div>
        </div>
        <CiBar st={st} />
        <div className="cirow">
          95% confidence range <b>{st.n ? `${pct(st.ci.lo)} – ${pct(st.ci.hi)}` : 'n/a (no trades)'}</b>
        </div>
        <div className={`verdict ${verdictCls}`}>
          <div>
            <span>{st.verdict}</span>
            <small>{verdictText(st)}</small>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid2">
          <div className="stat">
            <div className="k">Break-even</div>
            <div className="v mono">{pct(st.breakEven)}</div>
            <div className="s">1 / (1 + {(st.payout * 100).toFixed(0)}%)</div>
          </div>
          <div className="stat">
            <div className="k">EV per $1</div>
            <div className="v mono" style={{ color: !st.n ? undefined : st.ev > 0 ? 'var(--up)' : 'var(--down)' }}>
              {st.n ? fmtSigned(st.ev) : '–'}
            </div>
            <div className="s">wr×payout − (1−wr)</div>
          </div>
          <div className="stat">
            <div className="k">Worst streak</div>
            <div className="v mono">{st.n ? st.longestLosingStreak : '–'}</div>
            <div className="s">losses in a row</div>
          </div>
          <div className="stat">
            <div className="k">Candles tested</div>
            <div className="v mono">{closed.length}</div>
            <div className="s">{fmtTime(closed[0].t)} →</div>
          </div>
        </div>
      </div>

      <button className="cta" type="button" onClick={onNew} disabled={busy}>
        Generate New Signal
      </button>
      <button className="ghost" type="button" onClick={onBack}>
        Change settings
      </button>
    </section>
  );
}
