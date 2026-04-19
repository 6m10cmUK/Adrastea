-- batch_update_character_sort: キャラクターの sort_order を一括更新する RPC
CREATE OR REPLACE FUNCTION public.batch_update_character_sort(
  p_room_id text,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.characters_stats cs
  SET
    sort_order = (u ->> 'sort')::numeric,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
  FROM jsonb_array_elements(p_updates) AS u
  WHERE cs.id = (u ->> 'id')
    AND cs.room_id = p_room_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;
