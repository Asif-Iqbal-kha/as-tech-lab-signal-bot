import { martingale, planStake, simulateBankroll, type MartingaleCheck, type SimResult, type StakePlan } from '../engine';
import type { Settings } from './types';

export interface RiskInput {
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  lo: number;
  longestLosingStreak: number;
  hasEdge: boolean;
}

export interface Risk {
  plan: StakePlan;
  sim: SimResult;
  /** stake used in the simulation (the plan's stake, or the fixed % if the plan says $0) */
  simStake: number;
  marti: MartingaleCheck;
}

export function riskFor(r: RiskInput, s: Settings, payout: number): Risk {
  const plan = planStake({
    bankroll: s.bankroll,
    mode: s.stakeMode,
    fixedPct: s.fixedPct,
    maxPct: s.maxPct,
    payout,
    n: r.n,
    winRate: r.winRate,
    lo: r.lo,
    hasEdge: r.hasEdge
  });
  const fallback = Math.floor(s.bankroll * Math.min(s.fixedPct, s.maxPct) * 100) / 100;
  const simStake = plan.stake > 0 ? plan.stake : Math.max(0.01, fallback);
  const sim = simulateBankroll({ wins: r.wins, losses: r.losses, payout, bankroll: s.bankroll, stake: simStake, trades: 200, paths: 2000 });
  const marti = martingale(simStake, payout, Math.max(1, r.longestLosingStreak));
  return { plan, sim, simStake, marti };
}
