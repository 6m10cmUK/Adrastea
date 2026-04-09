#!/bin/bash
# Adrastea ローカル環境初期セットアップ
# 初回のみ実行すればOK
# Usage: ./scripts/init-local.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== npm install ==="
cd "$ROOT"
npm install --legacy-peer-deps

echo ""
echo "=== Supabase init check ==="
if [ ! -f "$ROOT/supabase/config.toml" ]; then
  supabase init
fi

echo ""
echo "=== D1 local migration ==="
cd "$ROOT/worker"
npx wrangler d1 migrations apply adrastea-db --local

echo ""
echo "=== .env.local check ==="
if [ ! -f "$ROOT/.env.local" ]; then
  echo "Creating .env.local with local defaults..."
  cat > "$ROOT/.env.local" << 'EOF'
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_R2_WORKER_URL=http://localhost:8787
EOF
else
  echo ".env.local already exists, skipping."
fi

echo ""
echo "=== Worker .dev.vars check ==="
if [ ! -f "$ROOT/worker/.dev.vars" ]; then
  echo "Creating worker/.dev.vars with local defaults..."
  cat > "$ROOT/worker/.dev.vars" << 'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
EOF
else
  echo "worker/.dev.vars already exists, skipping."
fi

echo ""
echo "=== Setup complete ==="
echo "Run ./scripts/dev-local.sh to start development."
