-- ランドマーク保護を緩和: BG/FG/CL の sort_order 変更を許可する
-- ただし BG < FG < CL の順序制約は維持

CREATE OR REPLACE FUNCTION "public"."batch_update_object_sort"("p_room_id" "text", "p_updates" "jsonb")
RETURNS "jsonb"
LANGUAGE "plpgsql"
AS $$
DECLARE
  v_count int;
  v_bg_sort numeric;
  v_fg_sort numeric;
  v_cl_sort numeric;
BEGIN
  -- 重複チェック
  IF (SELECT count(DISTINCT (u ->> 'sort')::numeric)
      FROM jsonb_array_elements(p_updates) AS u) != jsonb_array_length(p_updates) THEN
    RAISE EXCEPTION '入力内に sort_order の重複あり';
  END IF;

  -- 一時的に負の値にして unique 制約回避
  UPDATE public.objects o
  SET sort_order = -100000 - (u.rn)
  FROM (
    SELECT (item ->> 'id')::text AS id, ROW_NUMBER() OVER () AS rn
    FROM jsonb_array_elements(p_updates) AS item
  ) u
  WHERE o.id = u.id AND o.room_id = p_room_id;

  -- 本番の sort_order を設定
  UPDATE public.objects o
  SET sort_order = (u ->> 'sort')::numeric,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
  FROM jsonb_array_elements(p_updates) AS u
  WHERE o.id = (u ->> 'id') AND o.room_id = p_room_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- BG < FG < CL の順序制約チェック
  SELECT sort_order INTO v_bg_sort FROM public.objects
    WHERE room_id = p_room_id AND type = 'background' LIMIT 1;
  SELECT sort_order INTO v_fg_sort FROM public.objects
    WHERE room_id = p_room_id AND type = 'foreground' LIMIT 1;
  SELECT sort_order INTO v_cl_sort FROM public.objects
    WHERE room_id = p_room_id AND type = 'characters_layer' LIMIT 1;

  IF v_bg_sort IS NOT NULL AND v_fg_sort IS NOT NULL AND v_bg_sort >= v_fg_sort THEN
    RAISE EXCEPTION 'background が foreground 以上の sort_order になっています';
  END IF;

  IF v_fg_sort IS NOT NULL AND v_cl_sort IS NOT NULL AND v_fg_sort >= v_cl_sort THEN
    RAISE EXCEPTION 'foreground が characters_layer 以上の sort_order になっています';
  END IF;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;
