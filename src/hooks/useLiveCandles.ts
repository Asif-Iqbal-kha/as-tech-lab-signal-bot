import { useCallback, useEffect, useState } from 'react';
import type { Candle } from '../engine';
import { isAvailable, tdKeyFor, type Asset } from '../data/assets';
import { fetchKlines } from '../data/binance';
import { tdHistory } from '../data/twelvedata';
import { POLL_MS, TD_POLL_MS, WS_BASE, WS_OPEN_TIMEOUT_MS, type Timeframe } from '../lib/constants';

export type FeedStatus = 'connecting' | 'live' | 'polling' | 'slow' | 'error' | 'unavailable';

const MAX_CANDLES = 300;

function merge(list: Candle[], k: Candle): Candle[] {
  if (!list.length) return [k];
  const last = list[list.length - 1];
  if (k.t === last.t) return [...list.slice(0, -1), k];
  if (k.t > last.t) return [...list.slice(-(MAX_CANDLES - 1)), k];
  return list;
}

/**
 * Live candles for the chart.
 * Binance: REST history, then WebSocket; falls back to polling every 3 s.
 * Twelve Data (forex): closed candles polled every 20 s while the page is visible,
 * to stay inside the free plan's 8 requests per minute.
 */
export function useLiveCandles(asset: Asset, tf: Timeframe, tdKey: string, enabled: boolean) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;

    setCandles([]);
    setError(null);
    if (!isAvailable(asset, tdKey)) {
      setStatus('unavailable');
      return;
    }
    if (!enabled) return;
    setStatus('connecting');

    if (asset.source === 'twelvedata') {
      const key = tdKeyFor(tdKey);
      const load = async (first: boolean) => {
        if (document.visibilityState !== 'visible' && !first) return;
        try {
          const k = await tdHistory(asset.symbol, tf, first ? 120 : 3, key);
          if (!alive) return;
          setCandles((list) => (first ? k : k.reduce(merge, list)));
          setStatus('slow');
          setError(null);
        } catch (e) {
          if (!alive) return;
          setStatus('error');
          setError(e instanceof Error ? e.message : String(e));
        }
      };
      void load(true);
      pollTimer = setInterval(() => void load(false), TD_POLL_MS);
      return () => {
        alive = false;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    const startPolling = () => {
      if (!alive || pollTimer) return;
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      setStatus('polling');
      const tick = async () => {
        try {
          const k = await fetchKlines(asset.symbol, tf, { limit: 2 });
          if (!alive) return;
          setCandles((list) => k.reduce(merge, list));
          setStatus('polling');
        } catch {
          if (alive) setStatus('error');
        }
      };
      void tick();
      pollTimer = setInterval(tick, POLL_MS);
    };

    const openSocket = () => {
      let opened = false;
      try {
        ws = new WebSocket(`${WS_BASE}/ws/${asset.symbol.toLowerCase()}@kline_${tf}`);
      } catch {
        startPolling();
        return;
      }
      openTimer = setTimeout(() => {
        if (!opened) startPolling();
      }, WS_OPEN_TIMEOUT_MS);
      ws.onopen = () => {
        opened = true;
        if (openTimer) clearTimeout(openTimer);
        if (alive) setStatus('live');
      };
      ws.onmessage = (ev) => {
        if (!alive) return;
        try {
          const k = JSON.parse(ev.data as string).k;
          if (k) setCandles((list) => merge(list, { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, T: k.T }));
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        if (openTimer) clearTimeout(openTimer);
        startPolling();
      };
    };

    (async () => {
      try {
        const k = await fetchKlines(asset.symbol, tf, { limit: 120 });
        if (alive) setCandles(k);
      } catch {
        if (alive) setStatus('error');
      }
      if (alive) openSocket();
    })();

    return () => {
      alive = false;
      if (openTimer) clearTimeout(openTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
      }
    };
  }, [asset, tf, tdKey, enabled]);

  /** Merge candles fetched elsewhere (e.g. during signal generation). */
  const mergeCandles = useCallback((k: Candle[]) => setCandles((list) => k.reduce(merge, list)), []);

  return { candles, status, error, mergeCandles };
}
