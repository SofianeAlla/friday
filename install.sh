#!/usr/bin/env bash
# Friday - one-command setup + launch for macOS / Linux.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node 18+ is required. Install it from https://nodejs.org and re-run."
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 18+ is required (found $(node -v))."
  exit 1
fi

echo "» Installing Friday (one-time)…"
npm run setup

echo ""
echo "» Starting Friday → http://localhost:5173"
echo "   (backend on :8787; press Ctrl-C to stop)"
npm run dev
