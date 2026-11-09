import { mulberry32 } from './randomWalk';

/** Kelly fraction for a binary bet that pays `payout` per 1 staked on a win and loses the stake otherwise. */
export const kelly = (p: number, payout: number): number => (p * payout - (1 - p)) / payout;

export type StakeMode = 'kelly' | 'fixed';

export interface StakeInput {
  bankroll: number;
  mode: StakeMode;
  /** fraction of bankroll, e.g. 0.01 */
  fixedPct: number;
  /** hard cap as a fraction of bankroll */
  maxPct: number;
  payout: number;
  /** decisive backtest trades */
  n: number;
  winRate: number;
  /** conservative (95% lower bound) win rate */
  lo: number;
  hasEdge: boolean;
}

export interface StakePlan {
  stake: number;
  fraction: number;
  reason: string;
  /** expected $ result per trade at this stake, using the measured win rate */
  evPerTrade: number;
  hasEdge: boolean;
}

export function planStake(s: StakeInput): StakePlan {
  let fraction: number;
  let reason: string;
  if (s.mode === 'kelly') {
    const k = s.n ? kelly(s.lo, s.payout) : 0;
    fraction = Math.min(Math.max(0, k) / 4, s.maxPct);
    reason =
      fraction > 0
        ? `¼ Kelly on the conservative ${(s.lo * 100).toFixed(1)}% win rate`
        : 'Kelly on the conservative win rate is negative: no proven edge, so stake nothing';
  } else {
    fraction = Math.min(s.fixedPct, s.maxPct);
    reason = s.hasEdge ? 'Fixed % of bankroll' : 'Fixed % of bankroll — but this setup has no proven edge';
  }
  const stake = Math.floor(s.bankroll * fraction * 100) / 100;
  const ev = s.n ? s.winRate * s.payout - (1 - s.winRate) : NaN;
  return { stake, fraction, reason, evPerTrade: stake * ev, hasEdge: s.hasEdge };
}

export interface MartingaleCheck {
  multiplier: number;
  /** total lost over the streak */
  lost: number;
  /** stake required for the next trade */
  nextStake: number;
  /** bankroll needed to survive the streak and place the next trade */
  needed: number;
}

/** Martingale that recovers all losses plus the base profit: stake × (1+payout)/payout after each loss. */
export function martingale(base: number, payout: number, streak: number): MartingaleCheck {
  const m = (1 + payout) / payout;
  let lost = 0;
  for (let k = 0; k < streak; k++) lost += base * m ** k;
  const nextStake = base * m ** streak;
  return { multiplier: m, lost, nextStake, needed: lost + nextStake };
}

/* ---------- Monte Carlo bankroll simulation ---------- */

function gaussian(rnd: () => number): number {
  let u = 0;
  let v = 0;
  while (!u) u = rnd();
  while (!v) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma sampler (shape >= 1). */
function gamma(shape: number, rnd: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = gaussian(rnd);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rnd();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export const sampleBeta = (a: number, b: number, rnd: () => number): number => {
  const x = gamma(a, rnd);
  const y = gamma(b, rnd);
  return x / (x + y);
};

export interface SimInput {
  wins: number;
  losses: number;
  payout: number;
  bankroll: number;
  stake: number;
  trades?: number;
  paths?: number;
  seed?: number;
}

export interface SimResult {
  trades: number;
  paths: number;
  median: number;
  p10: number;
  p90: number;
  /** share of paths that end below the starting bankroll */
  probDown: number;
  /** share of paths that drop to half the bankroll at some point */
  probHalf: number;
  /** share of paths that can no longer afford the stake */
  probRuin: number;
}

/**
 * Each path draws its own true win rate from Beta(wins+1, losses+1), so the
 * uncertainty of a small backtest is part of the result, then trades a fixed stake.
 */
export function simulateBankroll(s: SimInput): SimResult {
  const trades = s.trades ?? 200;
  const paths = s.paths ?? 2000;
  const rnd = mulberry32(s.seed ?? 7);
  const ends: number[] = [];
  let down = 0;
  let half = 0;
  let ruin = 0;
  for (let k = 0; k < paths; k++) {
    const p = sampleBeta(s.wins + 1, s.losses + 1, rnd);
    let b = s.bankroll;
    let hitHalf = false;
    let ruined = false;
    for (let t = 0; t < trades; t++) {
      if (b < s.stake || s.stake <= 0) {
        ruined = s.stake > 0;
        break;
      }
      b += rnd() < p ? s.stake * s.payout : -s.stake;
      if (b <= s.bankroll / 2) hitHalf = true;
    }
    ends.push(b);
    if (b < s.bankroll) down++;
    if (hitHalf) half++;
    if (ruined) ruin++;
  }
  ends.sort((a, b) => a - b);
  const q = (x: number) => ends[Math.min(ends.length - 1, Math.floor(x * ends.length))];
  return { trades, paths, median: q(0.5), p10: q(0.1), p90: q(0.9), probDown: down / paths, probHalf: half / paths, probRuin: ruin / paths };
}
