import type { Asset } from '../data/assets';
import type { Timeframe } from './constants';

/**
 * How many candles after the signal candle you can actually enter, for Watch/Scanner:
 * - Binance streams each candle the moment it closes → enter at the signal candle's close (0).
 * - Twelve Data publishes forex candles ~30–60 s after they close, so the signal arrives
 *   during the next candle and you enter at that candle's close (1), or for 1m candles
 *   often one more candle later (2).
 */
export function liveEntryDelay(asset: Asset, tf: Timeframe): number {
  if (asset.source === 'binance') return 0;
  return tf === '1m' ? 2 : 1;
}
