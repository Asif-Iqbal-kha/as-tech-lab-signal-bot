export const MARKETS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'EURUSDT'] as const;
export const TIMEFRAMES = ['1m', '3m', '5m', '15m'] as const;
export const EXPIRIES = [1, 2, 3, 5] as const;

export type Market = (typeof MARKETS)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];
export type Expiry = (typeof EXPIRIES)[number];

export const INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000
};

export const REST_BASES = ['https://data-api.binance.vision', 'https://api.binance.com'];
export const WS_BASE = 'wss://data-stream.binance.vision/ws';
export const HISTORY_LIMIT = 1000;
export const POLL_MS = 3000;
export const WS_OPEN_TIMEOUT_MS = 6000;
export const LOG_CHECK_MS = 10_000;
