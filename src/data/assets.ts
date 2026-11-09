export type Source = 'binance' | 'twelvedata';
export type AssetGroup = 'Crypto' | 'Forex' | 'Commodities';

export interface Asset {
  id: string;
  /** what the asset is called on Quotex (always pick the version WITHOUT "OTC") */
  quotex: string;
  name: string;
  group: AssetGroup;
  source: Source;
  /** symbol at the data source */
  symbol: string;
  /** available with Twelve Data's public demo key (no account needed) */
  demo?: boolean;
  note?: string;
}

const crypto = (id: string, quotex: string, name: string): Asset => ({ id, quotex, name, group: 'Crypto', source: 'binance', symbol: id });
const fx = (pair: string, demo = false): Asset => ({
  id: pair.replace('/', ''),
  quotex: pair,
  name: 'Forex · Twelve Data',
  group: 'Forex',
  source: 'twelvedata',
  symbol: pair,
  demo,
  note: 'Real forex market: open Monday–Friday. On weekends Quotex only offers the OTC version, which cannot be analysed.'
});

export const ASSETS: Asset[] = [
  crypto('BTCUSDT', 'BTC/USD', 'Bitcoin'),
  crypto('ETHUSDT', 'ETH/USD', 'Ethereum'),
  crypto('BNBUSDT', 'BNB/USD', 'BNB'),
  crypto('SOLUSDT', 'SOL/USD', 'Solana'),
  crypto('XRPUSDT', 'XRP/USD', 'Ripple'),
  crypto('LTCUSDT', 'LTC/USD', 'Litecoin'),
  crypto('DOGEUSDT', 'DOGE/USD', 'Dogecoin'),
  crypto('ADAUSDT', 'ADA/USD', 'Cardano'),
  crypto('TRXUSDT', 'TRX/USD', 'TRON'),
  crypto('LINKUSDT', 'LINK/USD', 'Chainlink'),
  crypto('AVAXUSDT', 'AVAX/USD', 'Avalanche'),
  crypto('DOTUSDT', 'DOT/USD', 'Polkadot'),
  crypto('BCHUSDT', 'BCH/USD', 'Bitcoin Cash'),
  {
    id: 'PAXGUSDT',
    quotex: 'Gold',
    name: 'Gold via PAX Gold token (Binance)',
    group: 'Commodities',
    source: 'binance',
    symbol: 'PAXGUSDT',
    note: 'PAXG tracks the gold price but also trades on weekends, when real gold is closed.'
  },
  fx('EUR/USD', true),
  fx('USD/JPY', true),
  fx('GBP/USD'),
  fx('AUD/USD'),
  fx('USD/CAD'),
  fx('USD/CHF'),
  fx('NZD/USD'),
  fx('EUR/JPY'),
  fx('GBP/JPY'),
  fx('EUR/GBP'),
  fx('AUD/CAD'),
  {
    id: 'EURUSDT',
    quotex: 'EUR/USDT',
    name: 'Euro vs USDT (Binance, 24/7)',
    group: 'Forex',
    source: 'binance',
    symbol: 'EURUSDT',
    note: 'A crypto-exchange proxy for EUR/USD. Close to the real pair on weekdays, but it is not the same feed Quotex uses.'
  }
];

export const GROUPS: AssetGroup[] = ['Crypto', 'Forex', 'Commodities'];

export const getAsset = (id: string | undefined): Asset | undefined => ASSETS.find((a) => a.id === id);

/** Can this asset be loaded with the current settings? */
export const isAvailable = (a: Asset, tdKey: string): boolean => a.source === 'binance' || !!tdKey.trim() || !!a.demo;

export const tdKeyFor = (tdKey: string): string => tdKey.trim() || 'demo';
