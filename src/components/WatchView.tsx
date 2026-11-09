import { getStrategy } from '../engine';
import { getAsset } from '../data/assets';
import type { useWatch, WatchAlert } from '../hooks/useWatch';
import { INTERVAL_MS } from '../lib/constants';
import { fmtClock, fmtDur, fmtMoney, fmtScore, pct } from '../lib/format';

type Watch = ReturnType<typeof useWatch>;

function AlertCard({ a, now }: { a: WatchAlert; now: number }) {
  const late = now - a.closeAt;
  const before = late < 0;
  const running = now < a.expiresAt;
  const ms = INTERVAL_MS[a.tf];
  return (
    <div className={`sig alertcard ${a.dir}`}>
      <div className="meta">
        {getStrategy(a.strategy).name} · {a.tf} · signal at {fmtClock(a.closeAt, true)}
      </div>
      <div className="big">
        {a.dir === 'BUY' ? '▲ UP' : '▼ DOWN'} <span className="asset">{a.quotex}</span>
      </div>
      <div className="quotex">
        <div>
          <span>Expiry</span>
          <b>{fmtDur(a.expiry * ms)}</b>
        </div>
        <div>
          <span>Stake</span>
          <b>{a.blocked || !a.hasEdge ? 'paper' : fmtMoney(a.stake)}</b>
        </div>
        <div>
          <span>{running ? 'Expires in' : 'Expired'}</span>
          <b>{running ? fmtDur(a.expiresAt - now) : '—'}</b>
        </div>
        <div>
          <span>{before ? 'Enter in' : 'Since entry'}</span>
          <b className={!before && late > 10000 ? 'down' : before ? 'up' : ''}>{before ? fmtDur(-late) : `${Math.round(late / 1000)} s`}</b>
        </div>
      </div>
      <div className="alertnote">
        {a.blocked
          ? 'Daily stop reached — logged as paper trade only.'
          : !a.hasEdge
            ? 'This setup has no proven edge — paper-trade it only (it is logged so you can see how it does).'
            : before
              ? `Enter on Quotex at ${fmtClock(a.closeAt, true)} (the candle close) with this expiry.`
              : late > 10000 && running
                ? 'More than 10 s late: the price has moved since the entry moment. Safer to skip this one.'
                : running
                  ? 'Enter now on Quotex with this expiry.'
                  : 'Check the result in the Log.'}
      </div>
      {a.reasons.length > 0 && <div className="fine">{a.reasons.join(' · ')}</div>}
    </div>
  );
}

export function WatchView({ watch, now, onOpenScanner }: { watch: Watch; now: number; onOpenScanner: () => void }) {
  const { items, running, alerts, series, checks, transport, notif, awake } = watch;
  const latest = alerts[0];
  const showLatest = latest && now < latest.expiresAt + 60000;

  return (
    <section className="view on cols watchv">
      <div className="col">
        <div className="card o1">
          <div className="label">
            Watch mode <em>{running ? (transport ? `live · ${transport}` : 'loading…') : 'stopped'}</em>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            Checks every watched setup the moment each candle closes and alerts you with sound, vibration and a notification. Crypto: you enter at the
            signal candle's close. Forex data arrives late, so the alert gives you the next candle close instead. The scanner tests both
            exactly that way.
          </p>
          {running ? (
            <button className="ghost" type="button" onClick={watch.stop}>
              Stop watching
            </button>
          ) : (
            <button className="cta" type="button" onClick={() => void watch.start()} disabled={!items.length}>
              Start watching {items.length ? `(${items.length})` : ''}
            </button>
          )}
          <div className="wstat mono">
            <span className={notif === 'granted' ? 'okc' : 'warnc'}>
              Notifications: {notif === 'granted' ? 'on' : notif === 'denied' ? 'blocked in browser settings' : notif === 'unsupported' ? 'not supported' : 'off'}
            </span>
            <span className={awake ? 'okc' : ''}>Screen stays on: {awake ? 'yes' : running ? 'not supported' : '—'}</span>
          </div>
          <button className="small" type="button" style={{ width: '100%', marginTop: 10 }} onClick={watch.testAlert}>
            Test alert
          </button>
          <div className="fine">
            Keep this page open. Phones pause background tabs, so the most reliable setup is a laptop, or a second phone or tablet next to
            the one you trade on.
          </div>
        </div>

        <div className="card o3">
          <div className="label">
            Watch list <em>{items.length} setups</em>
          </div>
          {!items.length ? (
            <div className="empty">
              Nothing watched yet. Add setups from the{' '}
              <button type="button" className="linkbtn" onClick={onOpenScanner}>
                Scanner
              </button>{' '}
              or the Signal screen.
            </div>
          ) : (
            <ul className="witems">
              {items.map((it) => {
                const a = getAsset(it.assetId)!;
                const ser = series[`${it.assetId}|${it.tf}`];
                const chk = checks[it.id];
                return (
                  <li key={it.id}>
                    <div className="sname">
                      <b>{a.quotex}</b> · {it.tf} · {fmtDur(it.expiry * INTERVAL_MS[it.tf])} · {getStrategy(it.strategy).name}
                    </div>
                    <button type="button" className="xbtn" aria-label="Remove" onClick={() => watch.remove(it.id)}>
                      ×
                    </button>
                    <div className="snums mono">
                      {it.snap ? (
                        <>
                          <span className={it.snap.validated ? 'okc' : 'warnc'}>{it.snap.validated ? 'Edge' : it.snap.label}</span> ·{' '}
                          {it.snap.n ? `${pct(it.snap.winRate)} of ${it.snap.n}` : 'no trades'}
                        </>
                      ) : (
                        'not tested yet — start watching to backtest'
                      )}
                    </div>
                    {running && (
                      <div className="snums mono dim">
                        {ser?.state === 'loading'
                          ? 'loading history…'
                          : ser?.state === 'closed'
                            ? 'market closed'
                            : ser?.state === 'error'
                              ? `error: ${ser.message}`
                              : chk
                                ? `checked ${fmtClock(chk.at)} · ${chk.dir === 'NONE' ? `no signal (${fmtScore(chk.score)}/${chk.maxScore})` : chk.dir}`
                                : 'waiting for the next candle close'}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="col">
        {showLatest ? (
          <div className="o2">
            <AlertCard a={latest} now={now} />
          </div>
        ) : (
          <div className="card o2 empty-state">
            <div className="label">Latest signal</div>
            <p className="hint">{running ? 'Waiting for a watched setup to fire…' : 'Start watching to receive signals here.'}</p>
          </div>
        )}

        <div className="card o4">
          <div className="label">
            Signals this session <em>{alerts.length}</em>
          </div>
          {!alerts.length ? (
            <div className="empty">No signals yet.</div>
          ) : (
            <ul className="hist">
              {alerts.map((a) => (
                <li key={a.id}>
                  <span className={`tag ${a.dir}`}>{a.dir}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="m1">
                      {a.quotex} · {a.tf} · {fmtDur(a.expiry * INTERVAL_MS[a.tf])}
                    </div>
                    <div className="m2">
                      {fmtClock(a.closeAt, true)} · {getStrategy(a.strategy).name} · {a.blocked || !a.hasEdge ? 'paper' : fmtMoney(a.stake)}
                    </div>
                  </div>
                  <span className={`res ${now < a.expiresAt ? 'P' : 'N'}`}>{now < a.expiresAt ? 'LIVE' : 'DONE'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
