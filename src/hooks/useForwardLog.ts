import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeResult } from '../engine/engine';
import { fetchKlines, serverNow } from '../data/binance';
import { INTERVAL_MS, LOG_CHECK_MS } from '../lib/constants';
import { storage } from '../lib/storage';
import type { LogEntry } from '../lib/types';

const LOG_KEY = 'asb.log.v1';
const MAX_ENTRIES = 2000;

/**
 * Forward-test log in localStorage. Pending trades are checked automatically
 * once their expiry candle has closed: entry = close of the entry candle,
 * exit = close of the candle `expiry` candles later.
 */
export function useForwardLog() {
  const [log, setLog] = useState<LogEntry[]>(() => {
    const v = storage.get<LogEntry[]>(LOG_KEY, []);
    return Array.isArray(v) ? v : [];
  });
  const logRef = useRef(log);
  logRef.current = log;

  useEffect(() => storage.set(LOG_KEY, log), [log]);

  const add = useCallback((e: LogEntry) => setLog((l) => [e, ...l].slice(0, MAX_ENTRIES)), []);
  const clear = useCallback(() => setLog([]), []);

  const checking = useRef(false);
  const checkPending = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const updates = new Map<string, Partial<LogEntry>>();
    try {
      for (const e of logRef.current) {
        if (e.status !== 'pending') continue;
        const ms = INTERVAL_MS[e.tf];
        if (serverNow() < e.entryOpen + (e.expiry + 1) * ms + 1500) continue;
        try {
          const k = await fetchKlines(e.symbol, e.tf, { startTime: e.entryOpen, limit: e.expiry + 1 });
          if (k.length < e.expiry + 1 || k[0].t !== e.entryOpen) continue;
          const entry = k[0].c;
          const exit = k[e.expiry].c;
          const d = exit - entry;
          const result: TradeResult = d === 0 ? 'T' : (e.dir === 'BUY') === d > 0 ? 'W' : 'L';
          updates.set(e.id, { entryPrice: entry, exitPrice: exit, result, status: 'done' });
        } catch {
          /* retry next cycle */
        }
      }
    } finally {
      checking.current = false;
      if (updates.size) setLog((l) => l.map((e) => (updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e)));
    }
  }, []);

  useEffect(() => {
    void checkPending();
    const id = setInterval(checkPending, LOG_CHECK_MS);
    return () => clearInterval(id);
  }, [checkPending]);

  return { log, add, clear, checkPending };
}
