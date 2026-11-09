import { useEffect, useRef, useState } from 'react';
import type { Candle } from '../engine/engine';
import { fmtPrice } from '../lib/format';

const N = 60;
const UP = '#1fcf7a';
const DOWN = '#f0475a';
const GOLD = '#e3b04b';

function draw(cv: HTMLCanvasElement, candles: Candle[]) {
  const w = cv.clientWidth || 300;
  // Height comes from CSS so the chart can grow on tablet/desktop.
  const H = cv.clientHeight || 170;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, H);
  const data = candles.slice(-N);
  if (!data.length) {
    ctx.fillStyle = '#5c6272';
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Loading candles…', w / 2, H / 2);
    return;
  }
  const padR = 64;
  const padT = 8;
  const plotW = w - padR;
  const plotH = H - padT - 8;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of data) {
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
  }
  if (hi === lo) {
    hi += hi * 1e-4;
    lo -= lo * 1e-4;
  }
  const y = (p: number) => padT + ((hi - p) / (hi - lo)) * plotH;

  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let g = 0; g <= 3; g++) {
    const p = lo + ((hi - lo) * g) / 3;
    const yy = Math.round(y(p)) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(plotW, yy);
    ctx.stroke();
    ctx.fillStyle = '#5c6272';
    ctx.fillText(fmtPrice(p), plotW + 6, yy);
  }

  const slot = plotW / N;
  const bw = Math.max(1, slot * 0.62);
  const off = (N - data.length) * slot;
  data.forEach((c, i) => {
    const x = off + (i + 0.5) * slot;
    const col = c.c >= c.o ? UP : DOWN;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, y(c.h));
    ctx.lineTo(Math.round(x) + 0.5, y(c.l));
    ctx.stroke();
    const y1 = y(Math.max(c.o, c.c));
    const y2 = y(Math.min(c.o, c.c));
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
  });

  const last = data[data.length - 1];
  const ly = Math.round(y(last.c)) + 0.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(227,176,75,0.7)';
  ctx.beginPath();
  ctx.moveTo(0, ly);
  ctx.lineTo(plotW, ly);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = GOLD;
  ctx.fillRect(plotW + 2, ly - 8, padR - 2, 16);
  ctx.fillStyle = '#1b1306';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.fillText(fmtPrice(last.c), plotW + 6, ly);
}

export function PriceChart({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState('');

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => setSize(`${cv.clientWidth}x${cv.clientHeight}`));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const id = requestAnimationFrame(() => {
      if (ref.current) draw(ref.current, candles);
    });
    return () => cancelAnimationFrame(id);
  }, [candles, size]);

  return <canvas ref={ref} id="chart" aria-label="Live candlestick chart" role="img" />;
}

export const CHART_CANDLES = N;
