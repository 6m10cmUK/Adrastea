-- assets.owner_id の REFERENCES users(id) FK制約を削除
-- Convex Auth 移行後、owner_id は Convex の identity.subject を使用するため
-- D1 の users テーブルへの FK は不要

PRAGMA foreign_keys = OFF;

CREATE TABLE assets_new (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  url TEXT NOT NULL,
  r2_key TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  asset_type TEXT NOT NULL DEFAULT 'image',
  created_at INTEGER NOT NULL
);

INSERT INTO assets_new SELECT * FROM assets;
DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;
CREATE INDEX idx_assets_owner ON assets(owner_id);

PRAGMA foreign_keys = ON;
