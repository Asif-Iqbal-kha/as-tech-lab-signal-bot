import { useMemo, useState } from 'react';
import { getStrategy, runRandomWalkTest, wilson, type RandomWalkRow } from '../engine';
import { downloadCSV, pnlOf } from '../lib/csv';
import { fmtClock, fmtMoney, fmtPrice, fmtScore, fmtTime, pct } from '../lib/format';
import type { LogEntry } from '../lib/types';

type Filter = 'all' | 'manual' | 'watch';

function resultLabel(e: LogEntry): [string, string] {
  if (e.status === 'none') return ['—', 'N'];
  if (e.status === 'pending') return ['PENDING', 'P'];
  return [e.result === 'W' ? 'WIN' : e.result === 'L' ? 'LOSS' : 'TIE', e.result ?? 'T'];
}

function SelfTest() {
  const [rows, setRows] = useState<RandomWalkRow[] | null>(null);
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const t0 = performance.now();
      setRows(runRandomWalkTest());
      setMs(performance.now() - t0);
      setRunning(false);
    }, 30);
  };
  return (
    <div className="card o4">
      <div className="label">Engine self-test</div>
      <div className="hint" style={{ marginTop: 0 }}>
        Runs every strategy and the backtest on 60,000 random-walk candles. Without a look-ahead bug, every win rate lands near 50%.
      </div>
      <button className="small" type="button" style={{ width: '100%', marginTop: 10 }} onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run random-walk test'}
      </button>
      {rows && (
        <table className="rwt mono">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>1c</th>
              <th>2c</th>
              <th>3c</th>
              <th>5c</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(rows.map((r) => r.strategy))].map((sid) => (
              <tr key={sid}>
                <td>{getStrategy(sid).name}</td>
                {rows
                  .filter((r) => r.strategy === sid)
                  .map((r) => (
                    <td key={r.expiry} title={`n=${r.n} · 95% ${pct(r.ciLo)}–${pct(r.ciHi)}`}>
                      {pct(r.winRate)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && <div className="fine">{Math.round(ms)} ms · hover a cell for trade count and 95% range</div>}
    </div>
  );
}

interface Props {
  log: LogEntry[];
  onClear: () => void;
}

export function LogView({ log, onClear }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => (filter === 'all' ? log : log.filter((e) => e.mode === filter)), [log, filter]);
  const done = shown.filter((e) => e.status === 'done');
  const w = done.filter((e) => e.result === 'W').length;
  const l = done.filter((e) => e.result === 'L').length;
  const t = done.filter((e) => e.result === 'T').length;
  const n = w + l;
  const ci = wilson(w, n);
  const pending = shown.filter((e) => e.status === 'pending').length;
  const perDollar = done.reduce((a, e) => a + pnlOf(e, 1), 0);
  const staked = done.filter((e) => e.stake != null && e.stake > 0 && !e.blocked);
  const pnl = staked.reduce((a, e) => a + pnlOf(e), 0);

  return (
    <section className="view on cols log">
      <div className="col">
        <div className="card o1">
          <div className="label">
            Forward test <em>live signals, settled automatically</em>
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {(['all', 'manual', 'watch'] as Filter[]).map((f) => (
              <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'manual' ? 'Generate' : 'Watch'}
              </button>
            ))}
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
              'No settled trades yet.'
            )}
          </div>
          {done.length > 0 && (
            <div className="pnl">
              <div>
                <span>Result per $1 on every signal</span>
                <b className="mono" style={{ color: perDollar >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {fmtMoney(perDollar, true)}
                </b>
              </div>
              <div>
                <span>At the suggested stakes ({staked.length} trades)</span>
                <b className="mono" style={{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {fmtMoney(pnl, true)}
                </b>
              </div>
            </div>
          )}
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
        <SelfTest />
      </div>

      <div className="col">
        <div className="card o2">
          <div className="label">
            History <em>{pending ? `${pending} pending` : `${shown.length} signals`}</em>
          </div>
          {!shown.length ? (
            <div className="empty">No signals yet.</div>
          ) : (
            <ul className="hist">
              {shown.slice(0, 150).map((e) => {
                const [res, cls] = resultLabel(e);
                const px =
                  e.status === 'done'
                    ? `${fmtPrice(e.entryPrice)} → ${fmtPrice(e.exitPrice)}`
                    : e.status === 'none'
                      ? `score ${fmtScore(e.score)}`
                      : `entry ${fmtClock(e.entryAt)}`;
                const money = e.status === 'done' && e.stake ? ` · ${fmtMoney(pnlOf(e), true)}` : '';
                return (
                  <li key={e.id}>
                    <span className={`tag ${e.dir}`}>{e.dir === 'NONE' ? 'NO' : e.dir}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="m1">
                        {e.quotex} · {e.tf} · {e.expiry}c · {getStrategy(e.strategy).name}
                        {e.mode === 'watch' ? ' · W' : ''}
                      </div>
                      <div className="m2">
                        {fmtTime(e.createdAt)} · {px}
                        {money}
                        {e.blocked ? ' · paper' : ''}
                      </div>
                    </div>
                    <span className={`res ${cls}`}>{res}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
