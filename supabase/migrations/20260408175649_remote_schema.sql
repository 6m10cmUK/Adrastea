


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."batch_update_object_sort"("p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$ DECLARE updated_count int; BEGIN IF EXISTS ( SELECT 1 FROM ( SELECT (u->>'sort')::numeric AS sv, count(*) FROM jsonb_array_elements(p_updates) AS u GROUP BY sv HAVING count(*) > 1 ) d ) THEN RAISE EXCEPTION 'Duplicate sort_order values in batch'; END IF; WITH applied AS ( UPDATE objects SET sort_order = (u->>'sort')::numeric, updated_at = extract(epoch from now())::bigint * 1000 FROM jsonb_array_elements(p_updates) AS u WHERE objects.id = u->>'id' RETURNING objects.id, objects.sort_order ) SELECT count(*) INTO updated_count FROM applied; RETURN jsonb_build_object('updated', updated_count); END; $$;


ALTER FUNCTION "public"."batch_update_object_sort"("p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$ DECLARE v_count int; v_bg_sort numeric; v_fg_sort numeric; v_cl_sort numeric; v_update_ids text[]; BEGIN v_update_ids := ARRAY(SELECT (u ->> 'id')::text FROM jsonb_array_elements(p_updates) AS u); IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_updates) AS u JOIN public.objects o ON o.id = (u ->> 'id') AND o.room_id = p_room_id WHERE o.type IN ('background', 'foreground', 'characters_layer')) THEN RAISE EXCEPTION 'ランドマークオブジェクト (bg/fg/characters_layer) の sort_order は変更不可'; END IF; IF (SELECT count(DISTINCT (u ->> 'sort')::numeric) FROM jsonb_array_elements(p_updates) AS u) != jsonb_array_length(p_updates) THEN RAISE EXCEPTION '入力内に sort_order の重複あり'; END IF; UPDATE public.objects o SET sort_order = -100000 - (u.rn) FROM (SELECT (item ->> 'id')::text AS id, ROW_NUMBER() OVER () AS rn FROM jsonb_array_elements(p_updates) AS item) u WHERE o.id = u.id AND o.room_id = p_room_id; UPDATE public.objects o SET sort_order = (u ->> 'sort')::numeric, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint FROM jsonb_array_elements(p_updates) AS u WHERE o.id = (u ->> 'id') AND o.room_id = p_room_id; GET DIAGNOSTICS v_count = ROW_COUNT; SELECT sort_order INTO v_bg_sort FROM public.objects WHERE room_id = p_room_id AND type = 'background' LIMIT 1; SELECT sort_order INTO v_fg_sort FROM public.objects WHERE room_id = p_room_id AND type = 'foreground' LIMIT 1; SELECT sort_order INTO v_cl_sort FROM public.objects WHERE room_id = p_room_id AND type = 'characters_layer' LIMIT 1; IF v_bg_sort IS NOT NULL AND v_fg_sort IS NOT NULL AND v_bg_sort >= v_fg_sort THEN RAISE EXCEPTION 'background が foreground 以上の sort_order になっています'; END IF; IF v_fg_sort IS NOT NULL AND v_cl_sort IS NOT NULL AND v_fg_sort >= v_cl_sort THEN RAISE EXCEPTION 'foreground が characters_layer 以上の sort_order になっています'; END IF; RETURN jsonb_build_object('updated', v_count); END; $$;


ALTER FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_auth_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_data"("room_id_arg" "text", "message_limit_arg" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_room_member(room_id_arg) THEN
    RAISE EXCEPTION 'Forbidden: not a room member';
  END IF;

  SELECT jsonb_build_object(
    'room',
      (SELECT to_jsonb(r) FROM rooms r WHERE r.id = room_id_arg LIMIT 1),
    'pieces',
      (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM pieces p WHERE p.room_id = room_id_arg),
    'scenes',
      (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) FROM scenes s WHERE s.room_id = room_id_arg),
    'characters_stats',
      (SELECT coalesce(jsonb_agg(to_jsonb(cs)), '[]'::jsonb) FROM characters_stats cs WHERE cs.room_id = room_id_arg),
    'characters_base',
      (SELECT coalesce(jsonb_agg(to_jsonb(cb)), '[]'::jsonb) FROM characters_base cb WHERE cb.room_id = room_id_arg),
    'objects',
      (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM objects o WHERE o.room_id = room_id_arg),
    'bgms',
      (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order), '[]'::jsonb) FROM bgms b WHERE b.room_id = room_id_arg),
    'scenario_texts',
      (SELECT coalesce(jsonb_agg(to_jsonb(st) ORDER BY st.sort_order), '[]'::jsonb) FROM scenario_texts st WHERE st.room_id = room_id_arg),
    'cutins',
      (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order), '[]'::jsonb) FROM cutins c WHERE c.room_id = room_id_arg),
    'messages',
      (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM (
        SELECT * FROM messages m WHERE m.room_id = room_id_arg ORDER BY m.created_at DESC LIMIT message_limit_arg
      ) m),
    'room_members',
      (SELECT coalesce(jsonb_agg(to_jsonb(rm)), '[]'::jsonb) FROM room_members rm WHERE rm.room_id = room_id_arg),
    'channels',
      (SELECT coalesce(jsonb_agg(to_jsonb(ch)), '[]'::jsonb) FROM channels ch WHERE ch.room_id = room_id_arg)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_room_data"("room_id_arg" "text", "message_limit_arg" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_role"("room_id_arg" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN (
    SELECT role FROM room_members
    WHERE room_members.room_id = room_id_arg
      AND room_members.user_id = get_auth_user_id()
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."get_room_role"("room_id_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, display_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'ユーザー'),
    NEW.raw_user_meta_data->>'avatar_url',
    EXTRACT(EPOCH FROM NOW())::bigint * 1000,
    EXTRACT(EPOCH FROM NOW())::bigint * 1000
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'ユーザー'),
    avatar_url = NEW.raw_user_meta_data->>'avatar_url',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint * 1000;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_min_role"("room_id_arg" "text", "min_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_role text;
  role_order integer;
  min_order integer;
BEGIN
  SELECT role INTO user_role FROM room_members
    WHERE room_members.room_id = room_id_arg
    AND room_members.user_id = get_auth_user_id()
    LIMIT 1;
  IF user_role IS NULL THEN RETURN false; END IF;

  SELECT CASE user_role WHEN 'owner' THEN 4 WHEN 'sub_owner' THEN 3 WHEN 'user' THEN 2 WHEN 'guest' THEN 1 ELSE 0 END INTO role_order;
  SELECT CASE min_role WHEN 'owner' THEN 4 WHEN 'sub_owner' THEN 3 WHEN 'user' THEN 2 WHEN 'guest' THEN 1 ELSE 0 END INTO min_order;

  RETURN role_order >= min_order;
END;
$$;


ALTER FUNCTION "public"."has_min_role"("room_id_arg" "text", "min_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_member"("room_id_arg" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM room_members
    WHERE room_members.room_id = room_id_arg
      AND room_members.user_id = get_auth_user_id()
  );
END;
$$;


ALTER FUNCTION "public"."is_room_member"("room_id_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "r2_key" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "title" "text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "width" integer DEFAULT 0 NOT NULL,
    "height" integer DEFAULT 0 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "asset_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "created_at" bigint NOT NULL,
    CONSTRAINT "assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['image'::"text", 'audio'::"text"])))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bgms" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "bgm_type" "text",
    "bgm_source" "text",
    "bgm_asset_id" "text",
    "bgm_volume" numeric NOT NULL,
    "bgm_loop" boolean NOT NULL,
    "scene_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_playing" boolean NOT NULL,
    "is_paused" boolean NOT NULL,
    "auto_play_scene_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "fade_in" boolean NOT NULL,
    "fade_in_duration" numeric,
    "fade_out" boolean,
    "fade_duration" numeric,
    "sort_order" numeric,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "bgms_bgm_type_check" CHECK (("bgm_type" = ANY (ARRAY['youtube'::"text", 'url'::"text", 'upload'::"text"]))),
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."bgms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" bigint NOT NULL,
    "room_id" "text" NOT NULL,
    "channel_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "order" numeric NOT NULL,
    "is_archived" boolean NOT NULL,
    "allowed_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "is_private" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."channels_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."channels_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."channels_id_seq" OWNED BY "public"."channels"."id";



CREATE TABLE IF NOT EXISTS "public"."characters_base" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "images" "jsonb" NOT NULL,
    "memo" "text" NOT NULL,
    "secret_memo" "text" NOT NULL,
    "chat_palette" "text" NOT NULL,
    "sheet_url" "text",
    "initiative" numeric NOT NULL,
    "size" numeric NOT NULL,
    "is_status_private" boolean NOT NULL
);


ALTER TABLE "public"."characters_base" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."characters_stats" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "active_image_index" numeric NOT NULL,
    "statuses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "parameters" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_hidden_on_board" boolean NOT NULL,
    "is_speech_hidden" boolean,
    "sort_order" numeric,
    "on_board" boolean,
    "board_x" numeric,
    "board_y" numeric,
    "board_height" numeric,
    "board_visible" boolean,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."characters_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cutins" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text",
    "image_asset_id" "text",
    "text" "text" NOT NULL,
    "animation" "text" NOT NULL,
    "duration" numeric NOT NULL,
    "text_color" "text" NOT NULL,
    "background_color" "text" NOT NULL,
    "sort_order" numeric NOT NULL,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "cutins_animation_check" CHECK (("animation" = ANY (ARRAY['slide'::"text", 'fade'::"text", 'zoom'::"text"]))),
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."cutins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_uid" "uuid",
    "sender_avatar_asset_id" "text",
    "sender_color" "text",
    "content" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "channel" "text",
    "allowed_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" bigint NOT NULL,
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['chat'::"text", 'dice'::"text", 'system'::"text", 'secret_dice'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."objects" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "global" boolean NOT NULL,
    "scene_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "x" numeric NOT NULL,
    "y" numeric NOT NULL,
    "width" numeric NOT NULL,
    "height" numeric NOT NULL,
    "visible" boolean NOT NULL,
    "opacity" numeric NOT NULL,
    "sort_order" numeric NOT NULL,
    "locked" boolean,
    "position_locked" boolean NOT NULL,
    "size_locked" boolean NOT NULL,
    "image_url" "text",
    "image_asset_id" "text",
    "background_color" "text" NOT NULL,
    "image_fit" "text",
    "color_enabled" boolean,
    "text_content" "text",
    "font_size" numeric NOT NULL,
    "font_family" "text" NOT NULL,
    "letter_spacing" numeric NOT NULL,
    "line_height" numeric NOT NULL,
    "auto_size" boolean NOT NULL,
    "text_align" "text",
    "text_vertical_align" "text",
    "text_color" "text" NOT NULL,
    "scale_x" numeric NOT NULL,
    "scale_y" numeric NOT NULL,
    "memo" "text",
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "objects_image_fit_check" CHECK (("image_fit" = ANY (ARRAY['contain'::"text", 'cover'::"text", 'stretch'::"text"]))),
    CONSTRAINT "objects_text_align_check" CHECK (("text_align" = ANY (ARRAY['left'::"text", 'center'::"text", 'right'::"text"]))),
    CONSTRAINT "objects_text_vertical_align_check" CHECK (("text_vertical_align" = ANY (ARRAY['top'::"text", 'middle'::"text", 'bottom'::"text"]))),
    CONSTRAINT "objects_type_check" CHECK (("type" = ANY (ARRAY['panel'::"text", 'text'::"text", 'foreground'::"text", 'background'::"text", 'characters_layer'::"text"]))),
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."objects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pieces" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "x" numeric NOT NULL,
    "y" numeric NOT NULL,
    "width" numeric NOT NULL,
    "height" numeric NOT NULL,
    "image_asset_id" "text",
    "label" "text" NOT NULL,
    "color" "text" NOT NULL,
    "z_index" numeric NOT NULL,
    "statuses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "initiative" numeric NOT NULL,
    "memo" "text" NOT NULL,
    "character_id" "text",
    "created_at" bigint NOT NULL
);


ALTER TABLE "public"."pieces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_members" (
    "id" bigint NOT NULL,
    "room_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" bigint NOT NULL,
    CONSTRAINT "room_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'sub_owner'::"text", 'user'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."room_members" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."room_members_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."room_members_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."room_members_id_seq" OWNED BY "public"."room_members"."id";



CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "owner_id" "uuid" NOT NULL,
    "active_scene_id" "text",
    "thumbnail_asset_id" "text",
    "active_cutin" "jsonb",
    "dice_system" "text" NOT NULL,
    "gm_can_see_secret_memo" boolean NOT NULL,
    "default_login_role" "text",
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "last_accessed_at" bigint,
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "status_change_chat_enabled" boolean DEFAULT true NOT NULL,
    "status_change_chat_channel" "text" DEFAULT 'main'::"text" NOT NULL,
    "grid_visible" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rooms_default_login_role_check" CHECK (("default_login_role" = ANY (ARRAY['sub_owner'::"text", 'user'::"text", 'guest'::"text"]))),
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scenario_texts" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "visible" boolean NOT NULL,
    "speaker_character_id" "text",
    "speaker_name" "text",
    "channel_id" "text",
    "sort_order" numeric NOT NULL,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."scenario_texts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scenes" (
    "id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "background_asset_id" "text",
    "foreground_asset_id" "text",
    "foreground_opacity" numeric NOT NULL,
    "bg_transition" "text",
    "bg_transition_duration" numeric NOT NULL,
    "fg_transition" "text",
    "fg_transition_duration" numeric NOT NULL,
    "bg_blur" boolean NOT NULL,
    "grid_visible" boolean,
    "sort_order" numeric NOT NULL,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    "foreground_x" numeric DEFAULT '-24'::integer NOT NULL,
    "foreground_y" numeric DEFAULT '-14'::integer NOT NULL,
    "foreground_width" numeric DEFAULT 48 NOT NULL,
    "foreground_height" numeric DEFAULT 27 NOT NULL,
    "bg_color_enabled" boolean DEFAULT false NOT NULL,
    "bg_color" "text" DEFAULT '#333333'::"text" NOT NULL,
    "fg_color_enabled" boolean DEFAULT false NOT NULL,
    "fg_color" "text" DEFAULT '#666666'::"text" NOT NULL,
    CONSTRAINT "scenes_bg_transition_check" CHECK (("bg_transition" = ANY (ARRAY['none'::"text", 'fade'::"text"]))),
    CONSTRAINT "scenes_fg_transition_check" CHECK (("fg_transition" = ANY (ARRAY['none'::"text", 'fade'::"text"]))),
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."scenes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT 'ユーザー'::"text" NOT NULL,
    "avatar_url" "text",
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL,
    CONSTRAINT "updated_at_gte_created_at" CHECK (("updated_at" >= "created_at"))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."channels" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."channels_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."room_members" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."room_members_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bgms"
    ADD CONSTRAINT "bgms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_room_id_channel_id_key" UNIQUE ("room_id", "channel_id");



ALTER TABLE ONLY "public"."characters_base"
    ADD CONSTRAINT "characters_base_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."characters_stats"
    ADD CONSTRAINT "characters_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutins"
    ADD CONSTRAINT "cutins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."objects"
    ADD CONSTRAINT "objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pieces"
    ADD CONSTRAINT "pieces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scenario_texts"
    ADD CONSTRAINT "scenario_texts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scenes"
    ADD CONSTRAINT "scenes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_assets_id" ON "public"."assets" USING "btree" ("id");



CREATE INDEX "idx_assets_owner" ON "public"."assets" USING "btree" ("owner_id");



CREATE INDEX "idx_bgms_id" ON "public"."bgms" USING "btree" ("id");



CREATE INDEX "idx_bgms_room" ON "public"."bgms" USING "btree" ("room_id");



CREATE INDEX "idx_channels_room" ON "public"."channels" USING "btree" ("room_id");



CREATE INDEX "idx_channels_room_channel" ON "public"."channels" USING "btree" ("room_id", "channel_id");



CREATE INDEX "idx_characters_base_id" ON "public"."characters_base" USING "btree" ("id");



CREATE INDEX "idx_characters_base_room" ON "public"."characters_base" USING "btree" ("room_id");



CREATE INDEX "idx_characters_stats_id" ON "public"."characters_stats" USING "btree" ("id");



CREATE INDEX "idx_characters_stats_room" ON "public"."characters_stats" USING "btree" ("room_id");



CREATE INDEX "idx_cutins_id" ON "public"."cutins" USING "btree" ("id");



CREATE INDEX "idx_cutins_room" ON "public"."cutins" USING "btree" ("room_id");



CREATE INDEX "idx_messages_id" ON "public"."messages" USING "btree" ("id");



CREATE INDEX "idx_messages_room" ON "public"."messages" USING "btree" ("room_id");



CREATE INDEX "idx_messages_room_time" ON "public"."messages" USING "btree" ("room_id", "created_at");



CREATE INDEX "idx_objects_id" ON "public"."objects" USING "btree" ("id");



CREATE INDEX "idx_objects_room" ON "public"."objects" USING "btree" ("room_id");



CREATE INDEX "idx_pieces_id" ON "public"."pieces" USING "btree" ("id");



CREATE INDEX "idx_pieces_room" ON "public"."pieces" USING "btree" ("room_id");



CREATE INDEX "idx_room_members_room" ON "public"."room_members" USING "btree" ("room_id");



CREATE INDEX "idx_room_members_room_user" ON "public"."room_members" USING "btree" ("room_id", "user_id");



CREATE INDEX "idx_room_members_user" ON "public"."room_members" USING "btree" ("user_id");



CREATE INDEX "idx_rooms_archived" ON "public"."rooms" USING "btree" ("archived");



CREATE INDEX "idx_rooms_id" ON "public"."rooms" USING "btree" ("id");



CREATE INDEX "idx_rooms_owner" ON "public"."rooms" USING "btree" ("owner_id");



CREATE INDEX "idx_scenario_texts_id" ON "public"."scenario_texts" USING "btree" ("id");



CREATE INDEX "idx_scenario_texts_room" ON "public"."scenario_texts" USING "btree" ("room_id");



CREATE INDEX "idx_scenes_id" ON "public"."scenes" USING "btree" ("id");



CREATE INDEX "idx_scenes_room" ON "public"."scenes" USING "btree" ("room_id");



CREATE INDEX "idx_scenes_room_order" ON "public"."scenes" USING "btree" ("room_id", "sort_order");



CREATE UNIQUE INDEX "objects_unique_bg_per_scene" ON "public"."objects" USING "btree" ("room_id", ("scene_ids"[1])) WHERE (("type" = 'background'::"text") AND ("array_length"("scene_ids", 1) = 1));



CREATE UNIQUE INDEX "objects_unique_characters_layer" ON "public"."objects" USING "btree" ("room_id") WHERE ("type" = 'characters_layer'::"text");



CREATE UNIQUE INDEX "objects_unique_fg_per_scene" ON "public"."objects" USING "btree" ("room_id", ("scene_ids"[1])) WHERE (("type" = 'foreground'::"text") AND ("array_length"("scene_ids", 1) = 1));



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bgms"
    ADD CONSTRAINT "bgms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters_base"
    ADD CONSTRAINT "characters_base_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters_stats"
    ADD CONSTRAINT "characters_stats_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters_stats"
    ADD CONSTRAINT "characters_stats_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutins"
    ADD CONSTRAINT "cutins_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."objects"
    ADD CONSTRAINT "objects_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pieces"
    ADD CONSTRAINT "pieces_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scenario_texts"
    ADD CONSTRAINT "scenario_texts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scenes"
    ADD CONSTRAINT "scenes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_delete" ON "public"."assets" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "assets_insert" ON "public"."assets" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "assets_select" ON "public"."assets" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "assets_update" ON "public"."assets" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."bgms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bgms_delete" ON "public"."bgms" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "bgms_insert" ON "public"."bgms" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "bgms_select" ON "public"."bgms" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "bgms_update" ON "public"."bgms" FOR UPDATE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channels_delete" ON "public"."channels" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "channels_insert" ON "public"."channels" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "channels_select" ON "public"."channels" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "channels_update" ON "public"."channels" FOR UPDATE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



ALTER TABLE "public"."characters_base" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "characters_base_delete" ON "public"."characters_base" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "characters_base_insert" ON "public"."characters_base" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'user'::"text"));



CREATE POLICY "characters_base_select" ON "public"."characters_base" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "characters_base_update" ON "public"."characters_base" FOR UPDATE USING ("public"."has_min_role"("room_id", 'user'::"text"));



ALTER TABLE "public"."characters_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "characters_stats_delete" ON "public"."characters_stats" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "characters_stats_insert" ON "public"."characters_stats" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'user'::"text"));



CREATE POLICY "characters_stats_select" ON "public"."characters_stats" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "characters_stats_update" ON "public"."characters_stats" FOR UPDATE USING ("public"."has_min_role"("room_id", 'user'::"text"));



ALTER TABLE "public"."cutins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutins_delete" ON "public"."cutins" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "cutins_insert" ON "public"."cutins" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "cutins_select" ON "public"."cutins" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "cutins_update" ON "public"."cutins" FOR UPDATE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete" ON "public"."messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rooms"
  WHERE (("rooms"."id" = "messages"."room_id") AND ("rooms"."owner_id" = "auth"."uid"())))));



CREATE POLICY "messages_insert" ON "public"."messages" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'user'::"text"));



CREATE POLICY "messages_select" ON "public"."messages" FOR SELECT USING (("public"."is_room_member"("room_id") AND (("allowed_user_ids" IS NULL) OR ("allowed_user_ids" = '{}'::"uuid"[]) OR ("auth"."uid"() = ANY ("allowed_user_ids"))) AND (("message_type" <> 'secret_dice'::"text") OR (("sender_uid")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "messages_update" ON "public"."messages" FOR UPDATE USING (("public"."is_room_member"("room_id") AND (("sender_uid")::"text" = ("auth"."uid"())::"text")));



ALTER TABLE "public"."objects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "objects_delete" ON "public"."objects" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "objects_insert" ON "public"."objects" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "objects_select" ON "public"."objects" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "objects_update" ON "public"."objects" FOR UPDATE USING ("public"."has_min_role"("room_id", 'user'::"text"));



ALTER TABLE "public"."pieces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pieces_delete" ON "public"."pieces" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "pieces_insert" ON "public"."pieces" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'user'::"text"));



CREATE POLICY "pieces_select" ON "public"."pieces" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "pieces_update" ON "public"."pieces" FOR UPDATE USING ("public"."has_min_role"("room_id", 'user'::"text"));



ALTER TABLE "public"."room_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_members_delete" ON "public"."room_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rooms"
  WHERE (("rooms"."id" = "room_members"."room_id") AND ("rooms"."owner_id" = "public"."get_auth_user_id"())))));



CREATE POLICY "room_members_insert_by_owner" ON "public"."room_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rooms"
  WHERE (("rooms"."id" = "room_members"."room_id") AND ("rooms"."owner_id" = "public"."get_auth_user_id"())))));



CREATE POLICY "room_members_insert_self" ON "public"."room_members" FOR INSERT WITH CHECK (("user_id" = "public"."get_auth_user_id"()));



CREATE POLICY "room_members_select" ON "public"."room_members" FOR SELECT USING ((("user_id" = "public"."get_auth_user_id"()) OR "public"."is_room_member"("room_id")));



CREATE POLICY "room_members_update" ON "public"."room_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rooms"
  WHERE (("rooms"."id" = "room_members"."room_id") AND ("rooms"."owner_id" = "public"."get_auth_user_id"())))));



ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_delete" ON "public"."rooms" FOR DELETE USING (("owner_id" = "public"."get_auth_user_id"()));



CREATE POLICY "rooms_insert" ON "public"."rooms" FOR INSERT WITH CHECK (("owner_id" = "public"."get_auth_user_id"()));



CREATE POLICY "rooms_select" ON "public"."rooms" FOR SELECT USING (("public"."get_auth_user_id"() IS NOT NULL));



CREATE POLICY "rooms_update" ON "public"."rooms" FOR UPDATE USING (("owner_id" = "public"."get_auth_user_id"())) WITH CHECK (("owner_id" = "public"."get_auth_user_id"()));



ALTER TABLE "public"."scenario_texts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scenario_texts_delete" ON "public"."scenario_texts" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "scenario_texts_insert" ON "public"."scenario_texts" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "scenario_texts_select" ON "public"."scenario_texts" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "scenario_texts_update" ON "public"."scenario_texts" FOR UPDATE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



ALTER TABLE "public"."scenes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scenes_delete" ON "public"."scenes" FOR DELETE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "scenes_insert" ON "public"."scenes" FOR INSERT WITH CHECK ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



CREATE POLICY "scenes_select" ON "public"."scenes" FOR SELECT USING ("public"."is_room_member"("room_id"));



CREATE POLICY "scenes_update" ON "public"."scenes" FOR UPDATE USING ("public"."has_min_role"("room_id", 'sub_owner'::"text"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select" ON "public"."users" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "users_update" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bgms";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."channels";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."characters_base";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."characters_stats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cutins";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."objects";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pieces";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."room_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."rooms";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."scenario_texts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."scenes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auth_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_auth_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auth_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_data"("room_id_arg" "text", "message_limit_arg" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_data"("room_id_arg" "text", "message_limit_arg" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_data"("room_id_arg" "text", "message_limit_arg" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_room_role"("room_id_arg" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_role"("room_id_arg" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_room_role"("room_id_arg" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_min_role"("room_id_arg" "text", "min_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_min_role"("room_id_arg" "text", "min_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_min_role"("room_id_arg" "text", "min_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_room_member"("room_id_arg" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_room_member"("room_id_arg" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_room_member"("room_id_arg" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."bgms" TO "anon";
GRANT ALL ON TABLE "public"."bgms" TO "authenticated";
GRANT ALL ON TABLE "public"."bgms" TO "service_role";



GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";



GRANT ALL ON SEQUENCE "public"."channels_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channels_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channels_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."characters_base" TO "anon";
GRANT ALL ON TABLE "public"."characters_base" TO "authenticated";
GRANT ALL ON TABLE "public"."characters_base" TO "service_role";



GRANT ALL ON TABLE "public"."characters_stats" TO "anon";
GRANT ALL ON TABLE "public"."characters_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."characters_stats" TO "service_role";



GRANT ALL ON TABLE "public"."cutins" TO "anon";
GRANT ALL ON TABLE "public"."cutins" TO "authenticated";
GRANT ALL ON TABLE "public"."cutins" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."objects" TO "anon";
GRANT ALL ON TABLE "public"."objects" TO "authenticated";
GRANT ALL ON TABLE "public"."objects" TO "service_role";



GRANT ALL ON TABLE "public"."pieces" TO "anon";
GRANT ALL ON TABLE "public"."pieces" TO "authenticated";
GRANT ALL ON TABLE "public"."pieces" TO "service_role";



GRANT ALL ON TABLE "public"."room_members" TO "anon";
GRANT ALL ON TABLE "public"."room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."room_members" TO "service_role";



GRANT ALL ON SEQUENCE "public"."room_members_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."room_members_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."room_members_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."scenario_texts" TO "anon";
GRANT ALL ON TABLE "public"."scenario_texts" TO "authenticated";
GRANT ALL ON TABLE "public"."scenario_texts" TO "service_role";



GRANT ALL ON TABLE "public"."scenes" TO "anon";
GRANT ALL ON TABLE "public"."scenes" TO "authenticated";
GRANT ALL ON TABLE "public"."scenes" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


