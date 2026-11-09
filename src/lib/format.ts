export const pct = (x: number, d = 1): string => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '–');

export const priceDecimals = (p: number): number => (p >= 100 ? 2 : p >= 1 ? 4 : 5);

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '–';
  const d = priceDecimals(p);
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtDur(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p2(m)}:${p2(ss)}` : `${p2(m)}:${p2(ss)}`;
}

export const fmtTime = (t: number): string =>
  new Date(t).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const fmtClock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtSigned = (x: number, d = 3): string =>
  Number.isFinite(x) ? (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d) : '–';

export const fmtScore = (s: number): string => (s > 0 ? `+${s}` : s < 0 ? `−${-s}` : '0');
