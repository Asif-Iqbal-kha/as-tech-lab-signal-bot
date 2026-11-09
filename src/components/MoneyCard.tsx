import type { MartingaleCheck, SimResult, StakePlan } from '../engine';
import { fmtMoney, pct } from '../lib/format';

interface Props {
  plan: StakePlan;
  sim: SimResult;
  simStake: number;
  marti: MartingaleCheck;
  streak: number;
  bankroll: number;
  blocked: boolean;
  className?: string;
}

export function MoneyCard({ plan, sim, simStake, marti, streak, bankroll, blocked, className = '' }: Props) {
  const stake = blocked ? 0 : plan.stake;
  return (
    <div className={`card money ${className}`}>
      <div className="label">
        Money management <em>bankroll {fmtMoney(bankroll)}</em>
      </div>
      <div className="stakeRow">
        <div>
          <div className="k">Suggested stake</div>
          <div className={`v mono ${stake > 0 ? '' : 'zero'}`}>{fmtMoney(stake)}</div>
        </div>
        <div className="s">{blocked ? 'Daily stop reached: no more real trades today.' : plan.reason}</div>
      </div>
      {Number.isFinite(plan.evPerTrade) && stake > 0 && (
        <div className="cirow">
          Expected result per trade <b style={{ color: plan.evPerTrade >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtMoney(plan.evPerTrade, true)}</b>
        </div>
      )}

      <div className="simbox">
        <div className="k">
          If you trade {sim.trades} times at {fmtMoney(simStake)}
          {stake === 0 ? ' anyway' : ''}
        </div>
        <div className="simgrid">
          <div>
            <b className="mono">{fmtMoney(sim.median)}</b>
            <span>typical end bankroll</span>
          </div>
          <div>
            <b className="mono" style={{ color: sim.probDown > 0.5 ? 'var(--down)' : undefined }}>
              {pct(sim.probDown, 0)}
            </b>
            <span>chance you end down</span>
          </div>
          <div>
            <b className="mono">{pct(sim.probHalf, 0)}</b>
            <span>chance of losing half</span>
          </div>
        </div>
        <div className="s">
          Range {fmtMoney(sim.p10)} – {fmtMoney(sim.p90)} (10th–90th percentile) · {sim.paths.toLocaleString()} simulated bankrolls, each with
          a win rate drawn from the backtest's uncertainty.
        </div>
      </div>

      <div className="marti">
        <b>Martingale check:</b> the backtest had {streak} losses in a row. Doubling up (×{marti.multiplier.toFixed(2)}) from{' '}
        {fmtMoney(simStake)} would have lost {fmtMoney(marti.lost)} and needed a {fmtMoney(marti.nextStake)} next stake —{' '}
        {fmtMoney(marti.needed)} in total
        {marti.needed > bankroll ? <span className="bad"> · more than your whole bankroll</span> : ''}. Don't use martingale.
      </div>
    </div>
  );
}
