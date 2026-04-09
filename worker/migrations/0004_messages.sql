CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_uid TEXT,
  sender_avatar TEXT,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat',
  channel TEXT DEFAULT 'main',
  allowed_user_ids TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at DESC);
