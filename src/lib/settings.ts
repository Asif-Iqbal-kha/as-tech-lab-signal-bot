import { STRATEGY_IDS } from '../engine';
import { getAsset } from '../data/assets';
import { DEFAULT_PAYOUT, DEPTHS, EXPIRIES, TIMEFRAMES } from './constants';
import { storage } from './storage';
import type { Settings } from './types';

const KEY = 'asb.settings.v2';
const OLD_KEY = 'asb.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  assetId: 'BTCUSDT',
  tf: '1m',
  expiry: 1,
  strategy: 'trend',
  payouts: {},
  depth: 5000,
  bankroll: 100,
  stakeMode: 'kelly',
  fixedPct: 0.01,
  maxPct: 0.02,
  dailyMaxLosses: 3,
  tdKey: '',
  sound: true
};

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const pick = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export function loadSettings(): Settings {
  const s = storage.get<Record<string, unknown>>(KEY, {});
  const old = storage.get<Record<string, unknown>>(OLD_KEY, {});
  const d = DEFAULT_SETTINGS;
  const assetId = [s.assetId, old.symbol].find((x) => typeof x === 'string' && getAsset(x)) as string | undefined;
  let payouts = (s.payouts && typeof s.payouts === 'object' ? s.payouts : {}) as Record<string, number>;
  if (!s.payouts && typeof old.payout === 'number' && assetId) payouts = { [assetId]: old.payout };
  return {
    assetId: assetId ?? d.assetId,
    tf: pick(s.tf ?? old.tf, TIMEFRAMES, d.tf),
    expiry: pick(s.expiry ?? old.expiry, EXPIRIES, d.expiry),
    strategy: pick(s.strategy, STRATEGY_IDS, d.strategy),
    payouts,
    depth: pick(s.depth, DEPTHS, d.depth),
    bankroll: num(s.bankroll, 1, 1e9, d.bankroll),
    stakeMode: pick(s.stakeMode, ['kelly', 'fixed'] as const, d.stakeMode),
    fixedPct: num(s.fixedPct, 0.001, 1, d.fixedPct),
    maxPct: num(s.maxPct, 0.001, 1, d.maxPct),
    dailyMaxLosses: num(s.dailyMaxLosses, 0, 100, d.dailyMaxLosses),
    tdKey: typeof s.tdKey === 'string' ? s.tdKey : '',
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound
  };
}

export const saveSettings = (s: Settings) => storage.set(KEY, s);

export const payoutFor = (s: Settings, assetId: string): number => s.payouts[assetId] ?? DEFAULT_PAYOUT;
