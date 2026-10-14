# Stock Signal Dashboard

Personal stock watchlist with trend/RSI/MACD signals, owned positions, price alerts
and daily top picks. Educational tool only, not financial advice.

- **Use it:** open the GitHub Pages link for this repo and log in or sign up.
- **Run locally on a Mac:** `bash start-mac.sh` (see README-MAC.md), then open http://localhost:5173.
- **Code:** `src/App.jsx`.

## Hosting
`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on
every push and twice each weekday. Before building, `scripts/fetch-candles.mjs`
saves ~10 months of daily prices for the S&P 500, the app's picks pool and the
extras in that script, because the hosted site has no server to proxy Yahoo
Finance through. To get charts for another ticker, add it to `tickers.txt`.
