import { useState } from 'react';
import { runRandomWalkTest, wilson } from '../engine/engine';
import { downloadCSV } from '../lib/csv';
import { fmtClock, fmtPrice, fmtScore, fmtTime, pct } from '../lib/format';
import type { LogEntry } from '../lib/types';

function resultLabel(e: LogEntry): [string, string] {
  if (e.status === 'none') return ['—', 'N'];
  if (e.status === 'pending') return ['PENDING', 'P'];
  return [e.result === 'W' ? 'WIN' : e.result === 'L' ? 'LOSS' : 'TIE', e.result ?? 'T'];
}

function SelfTest({ payout }: { payout: number }) {
  const [out, setOut] = useState('');
  const [running, setRunning] = useState(false);
  const run = () => {
    setRunning(true);
    setOut('Generating 3 × 20,000 random-walk candles…');
    // let the message paint before the synchronous run
    setTimeout(() => {
      const t0 = performance.now();
      const res = runRandomWalkTest({ payout });
      const lines = Object.entries(res).map(
        ([e, r]) =>
          `${e}c  BUY ${pct(r.BUY.winRate)} (n=${r.BUY.n})  SELL ${pct(r.SELL.winRate)} (n=${r.SELL.n})  ALL ${pct(r.ANY.winRate)} [${pct(r.ANY.ciLo)}–${pct(r.ANY.ciHi)}]`
      );
      setOut(`${lines.join('\n')}\n${Math.round(performance.now() - t0)} ms · near 50% = no look-ahead`);
      setRunning(false);
    }, 30);
  };
  return (
    <div className="card">
      <div className="label">Engine self-test</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Runs the exact signal rule and backtest on random-walk prices. A rule with no look-ahead bug should land near 50%.
      </div>
      <button className="small" type="button" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={running}>
        Run random-walk test
      </button>
      {out && <div className="selftest">{out}</div>}
    </div>
  );
}

interface Props {
  log: LogEntry[];
  payout: number;
  onClear: () => void;
  onBack: () => void;
}

export function LogView({ log, payout, onClear, onBack }: Props) {
  const done = log.filter((e) => e.status === 'done');
  const w = done.filter((e) => e.result === 'W').length;
  const l = done.filter((e) => e.result === 'L').length;
  const t = done.filter((e) => e.result === 'T').length;
  const n = w + l;
  const ci = wilson(w, n);
  const pending = log.filter((e) => e.status === 'pending').length;

  return (
    <section className="view on">
      <div className="card">
        <div className="label">
          Forward test <em>live signals, checked automatically</em>
        </div>
        <div className="lsum">
          <div>
            <div className="v">{done.length}</div>
            <div className="k">Trades</div>
          </div>
          <div>
            <div className="v" style={{ color: 'var(--up)' }}>{w}</div>
            <div className="k">Wins</div>
          </div>
          <div>
            <div className="v" style={{ color: 'var(--down)' }}>{l}</div>
            <div className="k">Losses</div>
          </div>
          <div>
            <div className="v">{n ? pct(w / n) : '–'}</div>
            <div className="k">Win rate</div>
          </div>
        </div>
        <div className="cirow" style={{ textAlign: 'center' }}>
          {n ? (
            <>
              95% range <b>{pct(ci.lo)} – {pct(ci.hi)}</b> · ties {t}
            </>
          ) : (
            'No completed trades yet.'
          )}
        </div>
        <div className="btnrow">
          <button className="small" type="button" onClick={() => downloadCSV(log)} disabled={!log.length}>
            Export CSV
          </button>
          <button
            className="small danger"
            type="button"
            disabled={!log.length}
            onClick={() => {
              if (confirm('Delete all logged signals?')) onClear();
            }}
          >
            Clear log
          </button>
        </div>
      </div>

      <div className="card">
        <div className="label">
          History <em>{pending ? `${pending} pending` : `${log.length} signals`}</em>
        </div>
        {!log.length ? (
          <div className="empty">No signals generated yet.</div>
        ) : (
          <ul className="hist">
            {log.slice(0, 100).map((e) => {
              const [res, cls] = resultLabel(e);
              const px =
                e.status === 'done'
                  ? `${fmtPrice(e.entryPrice)} → ${fmtPrice(e.exitPrice)}`
                  : e.status === 'none'
                    ? `score ${fmtScore(e.score)}`
                    : `entry ${fmtClock(e.entryAt)}`;
              return (
                <li key={e.id}>
                  <span className={`tag ${e.dir}`}>{e.dir === 'NONE' ? 'NO' : e.dir}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="m1">
                      {e.symbol} · {e.tf} · {e.expiry}c
                    </div>
                    <div className="m2">
                      {fmtTime(e.createdAt)} · {px}
                    </div>
                  </div>
                  <span className={`res ${cls}`}>{res}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SelfTest payout={payout} />

      <button className="ghost" type="button" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
