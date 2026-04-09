-- ストレージ使用量（KVから移行）
CREATE TABLE IF NOT EXISTS storage_usage (
  user_id TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 日次APIレートリミット
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL
);
