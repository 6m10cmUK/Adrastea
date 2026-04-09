#!/bin/bash
# Adrastea ローカル開発環境一括起動
# Usage: ./scripts/dev-local.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT/worker"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $WORKER_PID $VITE_PID 2>/dev/null
  cd "$ROOT" && supabase stop 2>/dev/null
  echo "Done."
}
trap cleanup EXIT

# 1. Supabase ローカル起動
echo "=== Starting Supabase local ==="
cd "$ROOT"
supabase start

# 2. Worker ローカル起動 (background)
echo ""
echo "=== Starting Worker (localhost:8787) ==="
cd "$WORKER_DIR"
npx wrangler dev --local --persist-to .wrangler/state &
WORKER_PID=$!
sleep 3

# 3. Vite dev server (foreground)
echo ""
echo "=== Starting Vite (localhost:6100) ==="
cd "$ROOT"
npm run dev &
VITE_PID=$!

echo ""
echo "=== All services running ==="
echo "  Supabase: http://127.0.0.1:54321"
echo "  Worker:   http://localhost:8787"
echo "  Vite:     https://localhost:6100"
echo ""
echo "Press Ctrl+C to stop all services."

wait
