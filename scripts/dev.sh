#!/usr/bin/env bash
# Run the auth service + portal together for local dev. Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# operator env (AUTH_ADMIN_KEY etc.) — shared by both services
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

( cd "$ROOT/services/auth" && [ -d node_modules ] || npm install; node server.js ) &
AUTH_PID=$!
( cd "$ROOT/apps/portal" && [ -d node_modules ] || npm install; [ -f .env.local ] || cp .env.example .env.local; npm run dev ) &
PORTAL_PID=$!

trap 'kill $AUTH_PID $PORTAL_PID 2>/dev/null || true' EXIT INT TERM
echo "auth → http://localhost:4000   portal → http://localhost:3400"
wait
