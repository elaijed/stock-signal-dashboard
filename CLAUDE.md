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
- Social features (Social tab): code in `src/social/` (api.js, SocialPage, ProfileEditor, ProfileView,
  Avatar, constants); friend portfolio view (`FriendPortfolio`) lives in App.jsx to reuse its cards/charts.
  Database: `supabase/001_social.sql` (already applied) — profiles, connections, blocks, reports,
  avatars bucket, RLS, and SECURITY DEFINER functions (search_profiles, get_profile,
  get_shared_portfolio, suggested_profiles, my_network). Other users' data is ONLY read via
  those functions. `supabase/test_social.sql` is a self-test that always rolls back.
- Social v2 (`supabase/002_social_feed.sql`, applied; self-test `supabase/test_social_v2.sql` rolls back):
  activity feed (+ reactions, comments, polls), notifications (DB triggers), network_symbols
  ("friends who own this"), leaderboard (opt-in, % only), monthly challenge, badges, invite links
  (`?invite=<code>`, accept_invite), groups (members/shared watchlist/wall).
  UI: `src/social/{Feed,Notifications,Compete,Groups}.jsx`; stock explanations in `src/ui/explain.js`,
  shared widgets in `src/ui/components.jsx`, Today/digest/earnings/dividends/performance chart in
  `src/ui/portfolio.jsx`. Light mode = `html.light` overrides in `src/index.css`.
- Backups before the v2 redesign: folder `~/Documents/stock-signal-dashboard-backup-2026-10-15`
  and GitHub branch `backup-2026-10-15`.
- v3 (Oct 15): Home page (`src/ui/home.jsx`: snapshot, first-week checklist, weekly recap, Learn,
  GlossaryPage), practice trading (`src/ui/practice.jsx`, stored as `paper` in the account doc),
  share-a-stock modal (`src/ui/share.jsx`), group chat (realtime on group_posts) + group challenge.
  DB: `supabase/003_group_notifications.sql`, `supabase/004_beginners_streaks_chat.sql` (applied).
  Weekly streak = weeks with any activity; the app posts a hidden 'checkin' activity once per week.
