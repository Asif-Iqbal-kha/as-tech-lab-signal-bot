import { backtest, getStrategy, stats } from '../engine';
import { getAsset } from '../data/assets';
import { serverNow } from '../data/clock';
import { fetchHistory, type History } from '../data/source';
import { INTERVAL_MS } from './constants';
import { fmtScore } from './format';
import { riskFor } from './risk';
import { payoutFor } from './settings';
import type { Settings, SignalRun, StepId, StepState } from './types';

/** Let React paint the current step before doing more work. */
const yieldUI = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/**
 * The real pipeline behind the "Analysing" screen. Each onStep call reports
 * what the code is actually doing at that moment, with measured durations.
 */
export async function runSignal(settings: Settings, onStep: (id: StepId, s: StepState) => void, blocked = false): Promise<SignalRun> {
  const { tf, expiry, depth, tdKey } = settings;
  const asset = getAsset(settings.assetId);
  if (!asset) throw new Error('Unknown asset.');
  const strategy = getStrategy(settings.strategy);
  const payout = payoutFor(settings, asset.id);
  let current: StepId = 'fetch';
  try {
    // 1. Fetch
    onStep('fetch', { status: 'active', detail: `${asset.source === 'binance' ? 'Binance' : 'Twelve Data'} · up to ${depth} candles` });
    await yieldUI();
    let t0 = performance.now();
    const onWait = (ms: number) =>
      onStep('fetch', { status: 'active', detail: `Waiting ${Math.ceil(ms / 1000)} s for the Twelve Data rate limit (8 requests/min)` });
    const h: History = await fetchHistory(asset, tf, depth, tdKey, onWait);
    const last = h.closed[h.closed.length - 1];
    if (h.stale) {
      throw new Error(
        `${asset.quotex}: no new candles since ${last ? new Date(last.T + 1).toUTCString() : 'ever'}. The real market is closed (forex is shut on weekends). ` +
          'On Quotex only the OTC version is open now, and OTC prices cannot be analysed.'
      );
    }
    if (h.closed.length < 120) throw new Error(`Only ${h.closed.length} closed candles available — not enough history.`);
    const closed = h.closed;
    const ms = INTERVAL_MS[tf];
    // You enter at the close of the candle forming now. Normally that's 1 candle after the
    // signal candle; Twelve Data publishes forex candles late, which can make it 2.
    const entryDelay = Math.max(1, Math.round((h.formingOpen - last.t) / ms));
    if (entryDelay > 3) throw new Error('The data feed is running several candles behind. Try again in a minute.');
    onStep('fetch', { status: 'done', detail: `${closed.length} closed candles · ${asset.source === 'binance' ? 'Binance' : 'Twelve Data'}`, ms: performance.now() - t0 });

    // 2. Indicators
    current = 'ind';
    onStep('ind', { status: 'active' });
    await yieldUI();
    t0 = performance.now();
    const prepared = strategy.prepare(closed);
    const sig = strategy.evaluate(prepared, closed.length - 1, true);
    if (!sig) throw new Error('Not enough data to compute indicators.');
    onStep('ind', { status: 'done', detail: `${strategy.name} (${strategy.short}) → score ${fmtScore(sig.score)} / ${sig.maxScore}`, ms: performance.now() - t0 });

    // 3. Backtest with the same entry delay you will actually have
    current = 'bt';
    onStep('bt', { status: 'active' });
    await yieldUI();
    t0 = performance.now();
    const scope = sig.dir === 'NONE' ? 'ANY' : sig.dir;
    const bt = backtest(closed, strategy, { expiry, direction: scope, prepared, entryDelay });
    const st = stats(bt.trades, payout);
    onStep('bt', { status: 'done', detail: `${st.total} trades (${st.wins}W / ${st.losses}L / ${st.ties}T)`, ms: performance.now() - t0 });

    // 4. Risk
    current = 'risk';
    onStep('risk', { status: 'active' });
    await yieldUI();
    t0 = performance.now();
    const risk = riskFor(
      { n: st.n, wins: st.wins, losses: st.losses, winRate: st.winRate, lo: st.ci.lo, longestLosingStreak: st.longestLosingStreak, hasEdge: st.verdict === 'Edge found' },
      settings,
      payout
    );
    onStep('risk', {
      status: 'done',
      detail: `Stake ${risk.plan.stake > 0 ? '$' + risk.plan.stake.toFixed(2) : '$0'} · ${risk.sim.paths} simulated bankrolls × ${risk.sim.trades} trades`,
      ms: performance.now() - t0
    });
    await yieldUI();

    const sigCandle = closed[closed.length - 1];
    return {
      entryDelay,
      asset,
      sig,
      st,
      scope,
      closed,
      ...risk,
      entry: {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: serverNow(),
        assetId: asset.id,
        quotex: asset.quotex,
        tf,
        expiry,
        payout,
        strategy: strategy.id,
        mode: 'manual',
        dir: sig.dir,
        score: sig.score,
        maxScore: sig.maxScore,
        signalCandleOpen: sigCandle.t,
        signalClose: sigCandle.c,
        entryOpen: h.formingOpen,
        entryAt: h.formingOpen + ms,
        exitAt: h.formingOpen + (expiry + 1) * ms,
        status: sig.dir === 'NONE' ? 'none' : 'pending',
        entryPrice: null,
        exitPrice: null,
        result: null,
        stake: sig.dir === 'NONE' || blocked ? 0 : risk.plan.stake,
        blocked: sig.dir !== 'NONE' && blocked,
        bt: { scope, winRate: st.winRate, n: st.n, lo: st.ci.lo, hi: st.ci.hi, verdict: st.verdict }
      }
    };
  } catch (e) {
    onStep(current, { status: 'fail' });
    throw e;
  }
}
