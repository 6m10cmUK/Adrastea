-- rooms テーブルに archived フラグを追加
ALTER TABLE rooms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- ルームアーカイブ（D1 退避用）
CREATE TABLE IF NOT EXISTS room_archives (
  room_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,  -- JSON形式で全関連データを格納
  archived_at INTEGER NOT NULL
);
