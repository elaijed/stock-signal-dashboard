# Stock Signal Dashboard

React + Vite app (Tailwind v4, Recharts, Supabase auth/storage, Finnhub + Yahoo data).
The owner is not a programmer: do the work for them, explain results in plain words,
and don't ask them to run commands unless there is no other way.

- Main code: `src/App.jsx` (single large component file; header comment explains the design).
- Run on the Mac: `bash start-mac.sh` (installs deps on first run, serves http://localhost:5173).
- `vite.config.js` proxies `/yahoo` to Yahoo Finance for candle data — the app must be
  opened through the dev server, not by opening index.html directly.
- User data (watchlist, positions, alerts, trades) lives in Supabase `public.portfolios`
  per user (RLS). Finnhub key and UI prefs are in browser storage.
- Commit changes with git after each working change so there is history to roll back to.
- Hosted at GitHub Pages (repo `elaijed/stock-signal-dashboard`) via `.github/workflows/deploy.yml`:
  builds on every push and twice each weekday. The hosted build has no `/yahoo` proxy, so
  `scripts/fetch-candles.mjs` saves daily candle snapshots to `candles/<SYMBOL>.json`
  (S&P 500 + PICK_POOL + extras + `tickers.txt`); add a ticker there to chart it online.
- The Finnhub key is NOT in the code: locally it comes from `.env.local` (VITE_FINNHUB_KEY, gitignored);
  online, open the site once with `#key=<key>` on the URL (or paste it in Settings) per device.
