# CRT + ICT Analyzer — Rebuild v1

This is a recovery rebuild based only on the source that remained available.

## What is included

- Recovered CRT + ICT terminology and decision pipeline
- Recovered confluence scoring table
- Recovered invalidation rules
- Recovered pattern descriptions
- Recovered sample signals
- A working React/Vite dashboard
- Safe/demo mode only

## What is intentionally NOT claimed to be recovered

The original live analysis implementation referenced missing modules such as:

- `@/lib/analysis`
- `@/lib/market.functions`
- `@/lib/market-data`
- UI components and project configuration

The original backtester also depends on the missing analysis engine and market-data functions. Therefore this rebuild does not pretend to have the original live analyzer or live-market backtest engine yet.

## Run locally

1. Install Node.js.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm run dev`
5. Open the local address printed by Vite.

## Next rebuild stages

1. Reconstruct the missing analysis engine from the recovered decision rules.
2. Add real market-data ingestion.
3. Rebuild the original backtester.
4. Recreate the full dashboard.
5. Add Deriv authentication and demo trading only after the analyzer is tested.
