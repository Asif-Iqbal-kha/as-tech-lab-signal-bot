# AS Signal Bot

Mobile-first trading-signal app built with React, Vite and TypeScript. Every number comes from Binance candles and calculations in the browser. Nothing is hard-coded.

## Run

```bash
npm install
npm run dev       # local dev server
npm test          # engine tests (incl. random-walk look-ahead check)
npm run build     # type-check + production build into dist/
```

## Deploy to Vercel

Import the repo in Vercel. It detects Vite automatically (build `npm run build`, output `dist`). No environment variables are needed.

## Layout

| Path | What it does |
| --- | --- |
| `src/engine/engine.ts` | Indicators, confluence rule, backtest, Wilson CI, stats, random-walk generator. Pure functions, no DOM. |
| `src/engine/engine.test.ts` | Vitest tests: indicator sanity, Wilson reference values, no look-ahead, random walk ≈ 50%. |
| `src/data/binance.ts` | REST klines (data-api.binance.vision, falls back to api.binance.com) and server-time sync. |
| `src/hooks/useLiveCandles.ts` | WebSocket kline stream, falls back to polling every 3 s. |
| `src/hooks/useForwardLog.ts` | Forward-test log in localStorage. Checks pending trades automatically. |
| `src/lib/runSignal.ts` | The real pipeline behind the "Analysing" screen. |
| `src/components/*` | Setup, Analysing, Result and Log screens, plus the canvas chart. |
| `legacy/signal-bot-standalone.html` | The original single-file version. |

## Testing in the browser

The engine is exposed on `window`: `ASEngine.runRandomWalkTest()`, `backtest(...)`, `stats(...)` and the rest. Live app state is on `window.ASApp`.

## Rule

Score = sign(EMA9−EMA21) + sign(MACD hist) + sign(hist − prev hist) + sign(close − EMA50).

- BUY when the score is ≥ +3 and RSI ≤ 70.
- SELL when the score is ≤ −3 and RSI ≥ 30.
- Otherwise NO TRADE.

Backtest: entry is the signal candle's close and exit is the close N candles later, one trade at a time. The forward log enters at the close of the candle forming when you generate (the countdown target), so a live trade enters one candle later than the backtest does.

Real Binance data. Not financial advice. Quotex OTC prices have no public feed and cannot be analysed.
