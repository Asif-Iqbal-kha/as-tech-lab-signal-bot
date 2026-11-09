import { useEffect, useState } from 'react';
import { serverNow } from '../data/binance';

/** Binance-clock time, re-rendered every `ms`. */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
