import type { LogEntry } from './types';

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : '');
const fx = (x: number | null | undefined, d = 4) => (x != null && Number.isFinite(x) ? x.toFixed(d) : '');
const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const pnlOf = (e: LogEntry, stake = e.stake ?? 0): number =>
  e.status !== 'done' ? 0 : e.result === 'W' ? stake * e.payout : e.result === 'L' ? -stake : 0;

export function logToCSV(log: LogEntry[]): string {
  const cols = [
    'id', 'generated_at', 'asset', 'quotex_name', 'timeframe', 'expiry_candles', 'strategy', 'entry_mode', 'payout', 'signal', 'score', 'max_score',
    'signal_candle_close', 'entry_time', 'entry_price', 'exit_time', 'exit_price', 'status', 'result', 'stake', 'pnl', 'daily_stop',
    'bt_scope', 'bt_win_rate', 'bt_trades', 'bt_ci_low', 'bt_ci_high', 'bt_verdict'
  ];
  const rows = log.map((e) => [
    e.id, iso(e.createdAt), e.assetId, e.quotex, e.tf, e.expiry, e.strategy, e.mode, e.payout, e.dir, e.score, e.maxScore,
    e.signalClose, iso(e.entryAt), e.entryPrice ?? '', iso(e.exitAt), e.exitPrice ?? '', e.status, e.result ?? '',
    e.stake ?? '', e.status === 'done' && e.stake != null ? pnlOf(e).toFixed(2) : '', e.blocked ? 'yes' : '',
    e.bt?.scope, fx(e.bt?.winRate), e.bt?.n, fx(e.bt?.lo), fx(e.bt?.hi), e.bt?.verdict
  ]);
  return [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function downloadCSV(log: LogEntry[]): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([logToCSV(log)], { type: 'text/csv' }));
  a.download = `as-signal-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
