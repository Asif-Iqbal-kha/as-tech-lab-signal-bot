import type { Stats, TradeResult, Verdict } from './types';

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Wilson score interval (default 95%). */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (!n) return { lo: NaN, hi: NaN };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export const breakEven = (payout: number): number => 1 / (1 + payout);

/** Approx. decisive trades needed for a 95% interval around p to clear break-even. */
export function requiredTrades(p: number, be: number, z = 1.96): number {
  if (!(p > be)) return Infinity;
  return Math.ceil((z * z * p * (1 - p)) / (p - be) ** 2);
}

export function verdictFor(n: number, ci: { lo: number; hi: number }, be: number): Verdict {
  if (n && ci.lo > be) return 'Edge found';
  if (n && ci.hi < be) return 'Losing setup';
  return 'No proven edge';
}

export function stats(trades: { result: TradeResult }[], payout = 0.85): Stats {
  let w = 0;
  let l = 0;
  let t = 0;
  let run = 0;
  let maxRun = 0;
  for (const tr of trades) {
    if (tr.result === 'W') {
      w++;
      run = 0;
    } else if (tr.result === 'L') {
      l++;
      run++;
      if (run > maxRun) maxRun = run;
    } else t++; // tie: stake returned, streak unchanged
  }
  const n = w + l;
  const winRate = n ? w / n : NaN;
  const ci = wilson(w, n);
  const be = breakEven(payout);
  return {
    wins: w,
    losses: l,
    ties: t,
    n,
    total: trades.length,
    winRate,
    ci,
    breakEven: be,
    ev: n ? winRate * payout - (1 - winRate) : NaN,
    longestLosingStreak: maxRun,
    verdict: verdictFor(n, ci, be),
    payout,
    needTrades: n ? requiredTrades(winRate, be) : Infinity
  };
}
