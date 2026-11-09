import { getStrategy, type Signal, type Stats } from '../engine';
import { INTERVAL_MS } from '../lib/constants';
import { fmtClock, fmtCount, fmtDur, fmtScore, fmtSigned, fmtTime, pct } from '../lib/format';
import type { SignalRun } from '../lib/types';
import { MoneyCard } from './MoneyCard';

/* ---------- reasons ---------- */

function Reasons({ sig }: { sig: Signal }) {
  return (
    <ul className="reasons">
      {sig.reasons.map((r) => (
        <li key={r.text}>
          <span>
            {r.text}
            <span className="sub2">{r.detail}</span>
          </span>
          {r.info ? (
            <span className="v">filter</span>
          ) : (
            <span className={`v ${r.vote > 0 ? 'p' : r.vote < 0 ? 'n' : ''}`}>{r.vote > 0 ? '+1' : r.vote < 0 ? '−1' : '0'}</span>
          )}
        </li>
      ))}
      {sig.notes.map((n) => (
        <li key={n} className="note">
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- confidence bar ---------- */

const AX_LO = 0.3;
const AX_HI = 0.7;
const pos = (x: number) => Math.max(0, Math.min(1, (x - AX_LO) / (AX_HI - AX_LO))) * 100;

export function CiBar({ winRate, lo, hi, be, n }: { winRate: number; lo: number; hi: number; be: number; n: number }) {
  return (
    <>
      <div className="cibar">
        <div className="track" />
        {n > 0 && (
          <>
            <div className="rng" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
            <div className="pt" style={{ left: `${pos(winRate)}%` }} />
          </>
        )}
        <div className="be" style={{ left: `${pos(be)}%` }}>
          <span>BE {pct(be)}</span>
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
  if (st.verdict === 'Losing setup') return `Whole 95% range is below the ${pct(st.breakEven)} break-even. This loses money.`;
  return `95% range overlaps the ${pct(st.breakEven)} break-even: the result could be luck.`;
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
    label = r.dir === 'NONE' ? 'Next candle close' : 'Enter in';
    sub = r.dir === 'NONE' ? 'generate again after it closes' : `place the trade at ${fmtClock(r.entryAt, true)}`;
    val = fmtDur(r.entryAt - now);
    frac = 1 - (r.entryAt - now) / ms;
  } else if (r.dir !== 'NONE' && now < r.exitAt) {
    label = 'Trade running';
    sub = `expires at ${fmtClock(r.exitAt, true)}`;
    val = fmtDur(r.exitAt - now);
    frac = 1 - (r.exitAt - now) / (r.exitAt - r.entryAt);
  } else {
    label = r.dir === 'NONE' ? 'Signal is stale' : 'Expired';
    sub = r.dir === 'NONE' ? 'generate a new signal' : 'result is checked in the Log';
    val = '00:00';
    frac = 1;
  }
  return (
    <div className="card o2">
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
  bankroll: number;
  onNew: () => void;
  onBack: () => void;
  onWatch: () => void;
  watched: boolean;
  busy: boolean;
}

export function ResultView({ run, now, bankroll, onNew, onBack, onWatch, watched, busy }: Props) {
  const { entry: r, sig, st, scope, closed, asset } = run;
  const strategy = getStrategy(r.strategy);
  const ms = INTERVAL_MS[r.tf];
  const strength = Math.abs(sig.score);
  const verdictCls = st.verdict === 'Edge found' ? 'edge' : st.verdict === 'Losing setup' ? 'losing' : 'noedge';

  return (
    <section className="view on cols result">
      <div className="col">
        <div className={`sig o1 ${r.dir}`}>
          <div className="meta">
            {asset.quotex} · {strategy.name} · {r.tf} candles
          </div>
          <div className="big">{r.dir === 'NONE' ? 'NO TRADE' : r.dir === 'BUY' ? 'BUY' : 'SELL'}</div>
          <div className="sub">{r.dir === 'BUY' ? '▲ UP' : r.dir === 'SELL' ? '▼ DOWN' : 'stand aside'}</div>
          <div className="pips">
            {Array.from({ length: sig.maxScore }, (_, i) => (
              <i key={i} className={i < strength ? 'f' : ''} />
            ))}
          </div>
          <div className="strength">
            Signal strength <b>{fmtScore(sig.score)} / {sig.maxScore}</b>
          </div>
          {r.dir !== 'NONE' && (
            <div className="quotex">
              <div>
                <span>Quotex</span>
                <b>{asset.quotex}</b>
              </div>
              <div>
                <span>Direction</span>
                <b className={r.dir === 'BUY' ? 'up' : 'down'}>{r.dir === 'BUY' ? 'UP' : 'DOWN'}</b>
              </div>
              <div>
                <span>Expiry</span>
                <b>{fmtDur(r.expiry * ms)}</b>
              </div>
              <div>
                <span>Enter at</span>
                <b>{fmtClock(r.entryAt, true)}</b>
              </div>
            </div>
          )}
        </div>

        <Countdown run={run} now={now} />

        <div className="card o3">
          <div className="label">
            Why <em>candle closed {fmtClock(r.signalCandleOpen + ms)}</em>
          </div>
          <Reasons sig={sig} />
        </div>
      </div>

      <div className="col">
        <div className="card o4">
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
          <CiBar winRate={st.winRate} lo={st.ci.lo} hi={st.ci.hi} be={st.breakEven} n={st.n} />
          <div className="cirow">
            95% confidence range <b>{st.n ? `${pct(st.ci.lo)} – ${pct(st.ci.hi)}` : 'n/a (no trades)'}</b>
          </div>
          <div className={`verdict ${verdictCls}`}>
            <div>
              <span>{st.verdict}</span>
              <small>{verdictText(st)}</small>
            </div>
          </div>
          <div className="fine">
            {run.entryDelay > 1
              ? `Forex candles arrive ~1 minute late, so you enter ${run.entryDelay} candles after the signal candle; the backtest uses that same delay.`
              : 'Entry assumed at the next candle close, exactly as the countdown tells you to trade.'}
            {st.verdict !== 'Edge found' && Number.isFinite(st.needTrades) && st.n > 0
              ? ` At ${pct(st.winRate)} it would take about ${fmtCount(st.needTrades)} trades to prove an edge.`
              : ''}
          </div>
        </div>

        <MoneyCard
          className="o5"
          plan={run.plan}
          sim={run.sim}
          simStake={run.simStake}
          marti={run.marti}
          streak={st.longestLosingStreak}
          bankroll={bankroll}
          blocked={!!r.blocked}
        />

        <div className="card o6">
          <div className="grid2 stats4">
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
              <div className="v mono">{closed.length.toLocaleString()}</div>
              <div className="s">{fmtTime(closed[0].t)} →</div>
            </div>
          </div>
        </div>

        <div className="actions o7">
          <button className="cta" type="button" onClick={onNew} disabled={busy}>
            Generate New Signal
          </button>
          <button className="ghost" type="button" onClick={onWatch} disabled={watched}>
            {watched ? '✓ In your Watch list' : '+ Watch this setup'}
          </button>
          <button className="ghost" type="button" onClick={onBack}>
            Change settings
          </button>
        </div>
      </div>
    </section>
  );
}
