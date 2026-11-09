# AS Signal Bot

A signal and research tool for Quotex traders, built with React, Vite and TypeScript. Every number comes from real market data and calculations in the browser. Nothing is hard-coded, and nothing is faked.

## What it does

| Tab | What you get |
| --- | --- |
| **Signal** | Choose a Quotex asset, one of 4 strategies, a timeframe and an expiry. You get BUY, SELL or NO TRADE with plain-English reasons; a backtest win rate with a 95% range, break-even and verdict; the Quotex trade details (asset, direction, expiry, entry time); and money management. |
| **Scanner** | Tests every asset × timeframe × expiry × strategy. A setup is **validated** only if it beats break-even on the older 70% of history and again on the newest 30%, which it never saw, with a multiple-testing correction. On random data it validates nothing. |
| **Watch** | Watches chosen setups live and alerts you the moment one fires: sound, vibration, notification, tab title. Every alert is logged and settled automatically. |
| **Log** | Forward-test results: win rate with a 95% range, P&L per $1 and at your stakes, CSV export, and an engine self-test. |
| **Settings** | Bankroll, stake sizing (conservative Kelly or fixed %), daily stop, backtest depth, Twelve Data key, sound. |

### Strategies
- **Trend:** EMA 9/21/50 + MACD (score out of 4, needs ±3), with an RSI 70/30 filter.
- **Reversal:** close outside a Bollinger band (20, 2) and RSI 14 below 30 / above 70.
- **Breakout:** close beyond the previous 20-candle high/low, in the direction of EMA 50.
- **Stochastic:** %K/%D (14,3,3) cross coming out of oversold (<20) or overbought (>80).

### Data
- **Crypto and gold:** Binance public API (REST and WebSocket). Gold uses the PAX Gold token (PAXGUSDT).
- **Forex:** Twelve Data. Without a key, the public demo key covers EUR/USD and USD/JPY. A free key unlocks all 11 pairs (8 requests/min, 800/day); the app rate-limits itself. Forex candles arrive 30–60 s after they close, so forex entries are one candle later, and every backtest uses that same delay.
- **Quotex OTC:** cannot be analysed. OTC prices are set by the broker and have no public feed.

### Honesty rules
- Backtests use the entry you can actually take:
  - Generate: the close of the candle forming now.
  - Watch on crypto: the signal candle's close.
  - Forex: the delay described above.
- Stakes use ¼ Kelly on the **lower** end of the 95% range, so a setup without a proven edge gets $0.
- The bankroll simulation draws a different true win rate for each simulated path from the backtest's uncertainty.
- The martingale check shows how much money the worst losing streak would have needed.

## Run

```bash
npm install
npm run dev       # local dev server
npm test          # engine tests: look-ahead, random walk ≈ 50%, scanner false-positive and planted-edge checks
npm run build     # type-check + production build into dist/
```

Deploy: import the repo in Vercel. It detects Vite (build `npm run build`, output `dist`). No environment variables are needed.

## Layout

| Path | What it does |
| --- | --- |
| `src/engine/` | Pure functions: indicators, strategies, backtest, statistics, scanner, money management, random walk. Exposed on `window.ASEngine`. |
| `src/data/` | Asset catalog, Binance and Twelve Data clients, unified history/range fetchers, exchange clock. |
| `src/hooks/` | Live chart feed, forward log, scanner, Watch mode. |
| `src/lib/` | Signal pipeline, risk, settings, alerts, CSV, formatting. |
| `src/components/` | One file per screen, plus the shared pieces. |
| `public/sw.js` | Minimal service worker, used only for notifications. It caches nothing. |

Real market data. Not financial advice.
