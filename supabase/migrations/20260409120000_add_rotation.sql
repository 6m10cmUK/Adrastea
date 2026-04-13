-- objects テーブルに rotation カラムを追加
ALTER TABLE "public"."objects" ADD COLUMN IF NOT EXISTS "rotation" numeric DEFAULT 0 NOT NULL;

-- characters_stats テーブルに board_rotation カラムを追加
ALTER TABLE "public"."characters_stats" ADD COLUMN IF NOT EXISTS "board_rotation" numeric DEFAULT 0 NOT NULL;
