import { backtest, computeIndicators, evaluate, stats } from '../engine/engine';
import { fetchKlines, serverNow } from '../data/binance';
import { HISTORY_LIMIT, INTERVAL_MS } from './constants';
import { fmtScore } from './format';
import type { Settings, SignalRun, StepId, StepState } from './types';

/** Let React paint the current step before doing more work. */
const yieldUI = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/**
 * The real pipeline behind the "Analysing" screen. Each onStep call reports
 * what the code is actually doing at that moment, with measured durations.
 */
export async function runSignal(
  settings: Settings,
  onStep: (id: StepId, s: StepState) => void
): Promise<SignalRun> {
  const { symbol, tf, expiry, payout } = settings;
  let current: StepId = 'fetch';
  try {
    // 1. Fetch
    onStep('fetch', { status: 'active' });
    await yieldUI();
    let t0 = performance.now();
    const raw = await fetchKlines(symbol, tf, { limit: HISTORY_LIMIT });
    if (raw.length < 80) throw new Error(`Only ${raw.length} candles returned — not enough history.`);
    // Binance always returns the in-progress candle last: drop it, indicators use closed candles only.
    const forming = raw[raw.length - 1];
    const closed = raw.slice(0, -1);
    onStep('fetch', {
      status: 'done',
      detail: `${raw.length} candles received · ${closed.length} closed used`,
      ms: performance.now() - t0
    });

    // 2. Indicators
    current = 'ind';
    onStep('ind', { status: 'active' });
    await yieldUI();
    t0 = performance.now();
    const ind = computeIndicators(closed);
    const sig = evaluate(ind, closed.length - 1);
    if (!sig) throw new Error('Not enough data to compute indicators.');
    onStep('ind', {
      status: 'done',
      detail: `EMA 9/21/50 · RSI 14 · MACD 12/26/9 → score ${fmtScore(sig.score)}`,
      ms: performance.now() - t0
    });

    // 3. Backtest
    current = 'bt';
    onStep('bt', { status: 'active' });
    await yieldUI();
    t0 = performance.now();
    const scope = sig.dir === 'NONE' ? 'ANY' : sig.dir;
    const bt = backtest(closed, { expiry, direction: scope, ind });
    const st = stats(bt.trades, payout);
    onStep('bt', {
      status: 'done',
      detail: `${st.total} trades found (${st.wins}W / ${st.losses}L / ${st.ties}T)`,
      ms: performance.now() - t0
    });
    await yieldUI();

    const ms = INTERVAL_MS[tf];
    const sigCandle = closed[closed.length - 1];
    return {
      sig,
      st,
      scope,
      closed,
      forming,
      entry: {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: serverNow(),
        symbol,
        tf,
        expiry,
        payout,
        dir: sig.dir,
        score: sig.score,
        rsi: sig.values.rsi,
        filtered: sig.filtered,
        signalCandleOpen: sigCandle.t,
        signalClose: sigCandle.c,
        entryOpen: forming.t,
        entryAt: forming.t + ms,
        exitAt: forming.t + (expiry + 1) * ms,
        status: sig.dir === 'NONE' ? 'none' : 'pending',
        entryPrice: null,
        exitPrice: null,
        result: null,
        bt: { scope, winRate: st.winRate, n: st.n, lo: st.ci.lo, hi: st.ci.hi, verdict: st.verdict }
      }
    };
  } catch (e) {
    onStep(current, { status: 'fail' });
    throw e;
  }
}
