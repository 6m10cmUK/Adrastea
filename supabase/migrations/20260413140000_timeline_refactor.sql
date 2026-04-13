BEGIN;

-- ============================================================================
-- 1. scenes テーブルの変更
-- ============================================================================

-- sort_order → position にリネーム
ALTER TABLE scenes RENAME COLUMN sort_order TO position;

-- position に非負整数制約を追加
ALTER TABLE scenes ADD CONSTRAINT scenes_position_non_negative CHECK (position >= 0);

-- (room_id, position) のユニーク制約を追加
ALTER TABLE scenes ADD CONSTRAINT scenes_room_id_position_unique UNIQUE (room_id, position);

-- ============================================================================
-- 2. objects テーブルの変更
-- ============================================================================

-- global → is_global にリネーム
ALTER TABLE objects RENAME COLUMN global TO is_global;

-- scene_start_id と scene_end_id を追加
ALTER TABLE objects
ADD COLUMN scene_start_id text,
ADD COLUMN scene_end_id text;

-- 外部キー制約を追加
ALTER TABLE objects
ADD CONSTRAINT objects_scene_start_id_fkey FOREIGN KEY (scene_start_id) REFERENCES scenes(id) ON DELETE RESTRICT,
ADD CONSTRAINT objects_scene_end_id_fkey FOREIGN KEY (scene_end_id) REFERENCES scenes(id) ON DELETE RESTRICT;

-- インデックスを追加
CREATE INDEX objects_scene_start_id_idx ON objects(scene_start_id);
CREATE INDEX objects_scene_end_id_idx ON objects(scene_end_id);

-- 既存データの変換（CHECK 制約追加前に実行）
-- is_global = false かつ scene_ids が非空の場合のみ更新
UPDATE objects
SET
  scene_start_id = (
    SELECT id FROM scenes
    WHERE id = ANY(objects.scene_ids)
    ORDER BY position ASC
    LIMIT 1
  ),
  scene_end_id = (
    SELECT id FROM scenes
    WHERE id = ANY(objects.scene_ids)
    ORDER BY position DESC
    LIMIT 1
  )
WHERE is_global = false AND scene_ids IS NOT NULL AND array_length(scene_ids, 1) > 0;

-- is_global = false かつ scene_ids が空の場合、is_global を true に変換
UPDATE objects
SET is_global = true
WHERE is_global = false AND (scene_ids IS NULL OR array_length(scene_ids, 1) = 0);

-- scene_ids カラムを削除
ALTER TABLE objects DROP COLUMN scene_ids;

-- CHECK 制約を追加（データ変換後）
ALTER TABLE objects
ADD CONSTRAINT objects_scene_ids_check CHECK (
  (is_global = true AND scene_start_id IS NULL AND scene_end_id IS NULL) OR
  (is_global = false AND scene_start_id IS NOT NULL AND scene_end_id IS NOT NULL)
);

-- ============================================================================
-- 3. bgms テーブルの変更
-- ============================================================================

-- is_global, scene_start_id, scene_end_id, auto_play を追加
ALTER TABLE bgms
ADD COLUMN is_global boolean DEFAULT false,
ADD COLUMN scene_start_id text,
ADD COLUMN scene_end_id text,
ADD COLUMN auto_play boolean DEFAULT false;

-- 外部キー制約を追加
ALTER TABLE bgms
ADD CONSTRAINT bgms_scene_start_id_fkey FOREIGN KEY (scene_start_id) REFERENCES scenes(id) ON DELETE RESTRICT,
ADD CONSTRAINT bgms_scene_end_id_fkey FOREIGN KEY (scene_end_id) REFERENCES scenes(id) ON DELETE RESTRICT;

-- インデックスを追加
CREATE INDEX bgms_scene_start_id_idx ON bgms(scene_start_id);
CREATE INDEX bgms_scene_end_id_idx ON bgms(scene_end_id);

-- 既存データの変換（CHECK 制約追加前に実行）
-- scene_ids が非空の場合、scene_start_id と scene_end_id を設定し、auto_play_scene_ids が非空なら auto_play = true
UPDATE bgms
SET
  is_global = false,
  scene_start_id = (
    SELECT id FROM scenes
    WHERE id = ANY(bgms.scene_ids)
    ORDER BY position ASC
    LIMIT 1
  ),
  scene_end_id = (
    SELECT id FROM scenes
    WHERE id = ANY(bgms.scene_ids)
    ORDER BY position DESC
    LIMIT 1
  ),
  auto_play = CASE
    WHEN bgms.auto_play_scene_ids IS NOT NULL AND array_length(bgms.auto_play_scene_ids, 1) > 0
    THEN true
    ELSE false
  END
WHERE scene_ids IS NOT NULL AND array_length(scene_ids, 1) > 0;

-- scene_ids が空の場合、is_global = true に設定
UPDATE bgms
SET is_global = true
WHERE (scene_ids IS NULL OR array_length(scene_ids, 1) = 0);

-- scene_ids と auto_play_scene_ids カラムを削除
ALTER TABLE bgms DROP COLUMN scene_ids;
ALTER TABLE bgms DROP COLUMN auto_play_scene_ids;

-- CHECK 制約を追加（データ変換後）
ALTER TABLE bgms
ADD CONSTRAINT bgms_scene_ids_check CHECK (
  (is_global = true AND scene_start_id IS NULL AND scene_end_id IS NULL) OR
  (is_global = false AND scene_start_id IS NOT NULL AND scene_end_id IS NOT NULL)
);

-- ============================================================================
-- デフォルト値の設定を確実にする
-- ============================================================================

-- is_global のデフォルト値を設定（既に ADD COLUMN で設定済みだが明示的に）
ALTER TABLE bgms ALTER COLUMN is_global SET DEFAULT false;
ALTER TABLE bgms ALTER COLUMN auto_play SET DEFAULT false;

COMMIT;
