import { useCallback, useEffect, useState } from 'react';
import type { Candle } from '../engine/engine';
import { fetchKlines } from '../data/binance';
import { POLL_MS, WS_BASE, WS_OPEN_TIMEOUT_MS } from '../lib/constants';

export type FeedStatus = 'connecting' | 'live' | 'polling' | 'error';

const MAX_CANDLES = 300;

function merge(list: Candle[], k: Candle): Candle[] {
  if (!list.length) return [k];
  const last = list[list.length - 1];
  if (k.t === last.t) return [...list.slice(0, -1), k];
  if (k.t > last.t) return [...list.slice(-(MAX_CANDLES - 1)), k];
  return list;
}

/**
 * Live candles for one symbol/interval: REST history, then WebSocket.
 * Falls back to REST polling every 3 s if the socket fails or doesn't open.
 */
export function useLiveCandles(symbol: string, interval: string) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<FeedStatus>('connecting');

  useEffect(() => {
    // Local flag: callbacks from a previous symbol/interval can never write state.
    let alive = true;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let openTimer: ReturnType<typeof setTimeout> | null = null;

    setCandles([]);
    setStatus('connecting');

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
          const k = await fetchKlines(symbol, interval, { limit: 2 });
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
        ws = new WebSocket(`${WS_BASE}/${symbol.toLowerCase()}@kline_${interval}`);
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
        const k = await fetchKlines(symbol, interval, { limit: 120 });
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
  }, [symbol, interval]);

  /** Merge a candle fetched elsewhere (e.g. during signal generation). */
  const mergeCandle = useCallback((k: Candle) => setCandles((list) => merge(list, k)), []);

  return { candles, status, mergeCandle };
}
