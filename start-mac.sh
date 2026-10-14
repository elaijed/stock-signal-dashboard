#!/bin/bash
# Stock Signal Dashboard — start it on macOS.
# First run installs everything it needs (about a minute); later runs start right away.
# Run from Terminal:   bash start-mac.sh        Stop it with Control+C.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js isn't installed on this Mac yet."
  echo "  1) Opening nodejs.org — download the LTS installer (.pkg) and run it."
  echo "  2) Then quit Terminal, open it again, and run:  bash start-mac.sh"
  open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) is too old — this app needs version 20 or newer."
  echo "Install the current LTS from https://nodejs.org, reopen Terminal, and run this again."
  open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
  exit 1
fi

echo "Using Node.js $(node -v)"
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies (about a minute)..."
  npm install --no-audit --no-fund
fi

echo ""
echo "Starting Stock Signal Dashboard at http://localhost:5173"
echo "(keep this window open while you use it; press Control+C to stop)"
( sleep 3; open "http://localhost:5173" ) &
npm run dev
