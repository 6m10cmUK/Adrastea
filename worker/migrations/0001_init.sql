-- ユーザー管理
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  encryption_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ルーム一覧
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  dice_system TEXT NOT NULL DEFAULT 'DiceBot',
  tags TEXT NOT NULL DEFAULT '[]',
  thumbnail_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_rooms_owner ON rooms(owner_id);

-- ルームデータバックアップ（JSON blob）
CREATE TABLE room_snapshots (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- アセットライブラリ
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  asset_type TEXT NOT NULL DEFAULT 'image',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_assets_owner ON assets(owner_id);

-- リフレッシュトークン
CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
