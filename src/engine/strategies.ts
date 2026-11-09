import { bollinger, ema, macd, ok, rollingMax, rollingMin, rsi, sign, stochastic } from './indicators';
import type { Candle, Direction, Reason, Signal, SignalDir, Strategy, StrategyId } from './types';

const dp = (x: number) => (Math.abs(x) >= 100 ? 2 : Math.abs(x) >= 1 ? 4 : 5);
const f = (x: number, ref = x) => x.toFixed(dp(ref));
const word = (s: number, a: string, b: string, z: string) => (s > 0 ? a : s < 0 ? b : z);

/**
 * Turns votes into a signal. `build` creates the human-readable reasons; it is
 * skipped when explain = false (backtests), which keeps scans fast.
 */
function decide(
  i: number,
  close: number,
  votes: number[],
  threshold: number,
  explain: boolean,
  build: () => Reason[],
  filter?: (dir: Direction) => string | null
): Signal {
  const score = votes.reduce((a, v) => a + v, 0);
  const maxScore = votes.length;
  let dir: SignalDir = score >= threshold ? 'BUY' : score <= -threshold ? 'SELL' : 'NONE';
  let filtered: Direction | null = null;
  const notes: string[] = [];
  if (dir !== 'NONE' && filter) {
    const why = filter(dir);
    if (why) {
      filtered = dir;
      if (explain) notes.push(why);
      dir = 'NONE';
    }
  }
  if (dir === 'NONE' && !filtered && explain) {
    const s = `${score > 0 ? '+' : ''}${score}`;
    notes.push(
      threshold === maxScore
        ? `Score ${s} of ±${maxScore}: all ${maxScore} conditions must agree, so no trade.`
        : `Score ${s} is between −${threshold} and +${threshold}: indicators disagree, no trade.`
    );
  }
  return { i, dir, score, maxScore, threshold, reasons: explain ? build() : [], notes, filtered, close };
}

/* ---------- 1. Trend confluence (EMA + MACD + RSI filter) ---------- */

interface TrendP {
  close: number[];
  ema9: number[];
  ema21: number[];
  ema50: number[];
  rsi: number[];
  hist: number[];
}

export const trend: Strategy<TrendP> = {
  id: 'trend',
  name: 'Trend',
  short: 'EMA 9/21/50 + MACD',
  description: 'Trades with the trend when EMAs and MACD momentum agree (3 of 4). Skips BUY above RSI 70 and SELL below RSI 30.',
  prepare(candles: Candle[]) {
    const close = candles.map((c) => c.c);
    return { close, ema9: ema(close, 9), ema21: ema(close, 21), ema50: ema(close, 50), rsi: rsi(close, 14), hist: macd(close).hist };
  },
  evaluate(p, i, explain = true) {
    if (i < 1) return null;
    const [e9, e21, e50, h, hp, r, c] = [p.ema9[i], p.ema21[i], p.ema50[i], p.hist[i], p.hist[i - 1], p.rsi[i], p.close[i]];
    if (![e9, e21, e50, h, hp, r, c].every(ok)) return null;
    const v = [sign(e9 - e21), sign(h), sign(h - hp), sign(c - e50)];
    return decide(
      i,
      c,
      v,
      3,
      explain,
      () => [
        { text: word(v[0], 'EMA 9 above EMA 21', 'EMA 9 below EMA 21', 'EMA 9 equal to EMA 21'), detail: `${f(e9, c)} vs ${f(e21, c)}`, vote: v[0] },
        { text: word(v[1], 'MACD histogram positive', 'MACD histogram negative', 'MACD histogram at zero'), detail: `hist ${h.toExponential(2)}`, vote: v[1] },
        { text: word(v[2], 'MACD histogram rising', 'MACD histogram falling', 'MACD histogram flat'), detail: `${hp.toExponential(2)} → ${h.toExponential(2)}`, vote: v[2] },
        { text: word(v[3], 'Price above EMA 50', 'Price below EMA 50', 'Price on EMA 50'), detail: `${f(c)} vs ${f(e50, c)}`, vote: v[3] },
        {
          text: `RSI 14 is ${r.toFixed(1)} (${r > 70 ? 'overbought' : r < 30 ? 'oversold' : 'neutral'})`,
          detail: 'filter: no BUY above 70, no SELL below 30',
          vote: 0,
          info: true
        }
      ],
      (dir) =>
        dir === 'BUY' && r > 70
          ? `Score qualified for BUY, but RSI ${r.toFixed(1)} is above 70, so the trade is skipped.`
          : dir === 'SELL' && r < 30
            ? `Score qualified for SELL, but RSI ${r.toFixed(1)} is below 30, so the trade is skipped.`
            : null
    );
  }
};

/* ---------- 2. Reversal (RSI + Bollinger) ---------- */

interface RevP {
  close: number[];
  upper: number[];
  lower: number[];
  rsi: number[];
}

export const reversal: Strategy<RevP> = {
  id: 'reversal',
  name: 'Reversal',
  short: 'RSI 14 + Bollinger 20,2',
  description: 'Bets on a snap-back: BUY when price closes below the lower Bollinger band with RSI under 30, SELL above the upper band with RSI over 70.',
  prepare(candles: Candle[]) {
    const close = candles.map((c) => c.c);
    const bb = bollinger(close, 20, 2);
    return { close, upper: bb.upper, lower: bb.lower, rsi: rsi(close, 14) };
  },
  evaluate(p, i, explain = true) {
    const [c, up, lo, r] = [p.close[i], p.upper[i], p.lower[i], p.rsi[i]];
    if (![c, up, lo, r].every(ok)) return null;
    const v1 = c < lo ? 1 : c > up ? -1 : 0;
    const v2 = r < 30 ? 1 : r > 70 ? -1 : 0;
    return decide(i, c, [v1, v2], 2, explain, () => [
      {
        text: v1 > 0 ? 'Closed below lower Bollinger band' : v1 < 0 ? 'Closed above upper Bollinger band' : 'Price inside Bollinger bands',
        detail: `${f(c)} · bands ${f(lo, c)} – ${f(up, c)}`,
        vote: v1
      },
      {
        text: v2 > 0 ? `RSI 14 oversold (${r.toFixed(1)})` : v2 < 0 ? `RSI 14 overbought (${r.toFixed(1)})` : `RSI 14 neutral (${r.toFixed(1)})`,
        detail: 'BUY needs < 30, SELL needs > 70',
        vote: v2
      }
    ]);
  }
};

/* ---------- 3. Breakout (Donchian 20 + EMA 50) ---------- */

interface BrkP {
  close: number[];
  hh: number[];
  ll: number[];
  ema50: number[];
}

export const breakout: Strategy<BrkP> = {
  id: 'breakout',
  name: 'Breakout',
  short: '20-candle high/low + EMA 50',
  description: 'BUY when price closes above the highest high of the previous 20 candles in an uptrend (above EMA 50); SELL on the mirror image.',
  prepare(candles: Candle[]) {
    const close = candles.map((c) => c.c);
    return {
      close,
      hh: rollingMax(candles.map((c) => c.h), 20),
      ll: rollingMin(candles.map((c) => c.l), 20),
      ema50: ema(close, 50)
    };
  },
  evaluate(p, i, explain = true) {
    if (i < 1) return null;
    const [c, hh, ll, e50] = [p.close[i], p.hh[i - 1], p.ll[i - 1], p.ema50[i]];
    if (![c, hh, ll, e50].every(ok)) return null;
    const v1 = c > hh ? 1 : c < ll ? -1 : 0;
    const v2 = sign(c - e50);
    return decide(i, c, [v1, v2], 2, explain, () => [
      {
        text: v1 > 0 ? 'Closed above the 20-candle high' : v1 < 0 ? 'Closed below the 20-candle low' : 'Inside the 20-candle range',
        detail: `${f(c)} · range ${f(ll, c)} – ${f(hh, c)}`,
        vote: v1
      },
      { text: word(v2, 'Price above EMA 50', 'Price below EMA 50', 'Price on EMA 50'), detail: `${f(c)} vs ${f(e50, c)}`, vote: v2 }
    ]);
  }
};

/* ---------- 4. Stochastic cross (14,3,3) ---------- */

interface StoP {
  close: number[];
  k: number[];
  d: number[];
}

export const stoch: Strategy<StoP> = {
  id: 'stoch',
  name: 'Stochastic',
  short: 'Stoch 14,3,3 cross',
  description: 'BUY when %K crosses above %D coming from below 20 (oversold); SELL when it crosses below %D coming from above 80.',
  prepare(candles: Candle[]) {
    const s = stochastic(candles, 14, 3, 3);
    return { close: candles.map((c) => c.c), k: s.k, d: s.d };
  },
  evaluate(p, i, explain = true) {
    if (i < 1) return null;
    const [c, k, d, kp, dPrev] = [p.close[i], p.k[i], p.d[i], p.k[i - 1], p.d[i - 1]];
    if (![c, k, d, kp, dPrev].every(ok)) return null;
    const v1 = k > d && kp <= dPrev ? 1 : k < d && kp >= dPrev ? -1 : 0;
    const v2 = kp < 20 ? 1 : kp > 80 ? -1 : 0;
    return decide(i, c, [v1, v2], 2, explain, () => [
      {
        text: v1 > 0 ? '%K crossed above %D' : v1 < 0 ? '%K crossed below %D' : 'No %K/%D cross',
        detail: `%K ${kp.toFixed(1)} → ${k.toFixed(1)} · %D ${d.toFixed(1)}`,
        vote: v1
      },
      {
        text: v2 > 0 ? 'Coming from oversold (< 20)' : v2 < 0 ? 'Coming from overbought (> 80)' : 'Not in an extreme zone',
        detail: `%K before the cross: ${kp.toFixed(1)}`,
        vote: v2
      }
    ]);
  }
};

export const STRATEGIES: Strategy[] = [trend, reversal, breakout, stoch];
export const STRATEGY_IDS: StrategyId[] = STRATEGIES.map((s) => s.id);
export const getStrategy = (id: StrategyId | string | undefined): Strategy => STRATEGIES.find((s) => s.id === id) ?? trend;
