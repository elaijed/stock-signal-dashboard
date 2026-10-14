# Stock Signal Dashboard — running it on your Mac

## 1. Copy the folder over
Get `stock-signal-dashboard-mac.zip` onto the Mac any way you like:
Google Drive / iCloud Drive / Dropbox, a USB stick, or email it to yourself.
Double-click the zip on the Mac to unzip it, then move the `stock-signal-dashboard`
folder somewhere permanent (for example your Documents folder).

## 2. Start it (one command)
1. Open **Terminal** (press Command+Space, type `Terminal`, press Return).
2. Type `cd ` (with a space after it), drag the `stock-signal-dashboard` folder
   into the Terminal window, and press Return.
3. Type `bash start-mac.sh` and press Return.

The first time, it checks for **Node.js**. If it isn't installed, the script opens
nodejs.org for you: download the **LTS** installer, run it, then quit and reopen
Terminal and repeat steps 2–3. After that, the first run installs the app's
dependencies (about a minute) and opens the dashboard in your browser at
**http://localhost:5173**.

Keep the Terminal window open while you use the dashboard. Press **Control+C**
in Terminal to stop it. To start it again later, repeat steps 1–3 (it starts
right away after the first time).

## 3. Log in
Log in with the same email and password you use on the PC. Your watchlist,
owned positions, price alerts and trade history are saved in your account,
so they appear on the Mac automatically.

## Notes
- The main code is in `src/App.jsx`.
- The site only runs while Terminal is running it, and only on this Mac
  (`localhost`). It isn't a public website.
- If you install Claude Code on the Mac, open this folder in it and it can
  run and keep developing the app from here.

## If something goes wrong
- **npm prints an "allow-scripts … esbuild" warning** during the first install:
  that's expected and harmless — the app works without it.
- **"command not found: node" or "npm"**: Node.js isn't installed. Install the
  LTS from https://nodejs.org, then reopen Terminal.
- **"Cannot find module @rollup/rollup-darwin-…"** or other install errors: run
  `rm -rf node_modules package-lock.json` and then `bash start-mac.sh` again.
- **"Port 5173 is in use"**: the dashboard is already running in another
  Terminal window. Use that one, or close it first.
- **Charts say "No candle data"**: price history comes through the app's local
  proxy, so open the dashboard from the address the script opens
  (http://localhost:5173), not by double-clicking `index.html`.
