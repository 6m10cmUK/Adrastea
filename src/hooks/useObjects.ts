import { useCallback, useMemo, useRef } from 'react';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import { supabase } from '../services/supabase';
import type { BoardObject } from '../types/adrastea.types';
import type { ObjectsInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';
import { isLayerSortDebug } from '../utils/debugFlags';

export function useObjects(
  roomId: string,
  activeSceneId: string | null,
  options?: { inject?: ObjectsInject; initialData?: unknown[]; enabled?: boolean }
) {
  const { inject, initialData, enabled } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;
  const { data: objectsData, loading: objectsLoading, setData: setObjectsData } = useSupabaseQuery<BoardObject>({
    table: 'objects',
    columns: 'id,room_id,type,name,global,scene_ids,x,y,width,height,visible,opacity,sort_order,position_locked,size_locked,image_asset_id,background_color,image_fit,color_enabled,text_content,font_size,font_family,letter_spacing,line_height,auto_size,text_align,text_vertical_align,text_color,scale_x,scale_y,memo,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled: !inject && enabled !== false,
    initialData,
  });

  const mutation = useSupabaseMutation<BoardObject>('objects', setObjectsData);

  const loading = inject ? false : objectsLoading;

  const allObjects: BoardObject[] = useMemo(() => {
    if (inject) return inject.data;
    return objectsData ?? [];
  }, [inject, objectsData]);


  const activeObjects = useMemo(() => {
    if (!activeSceneId) return allObjects.filter((o) => o.global);
    return allObjects
      .filter((o) => o.global || o.scene_ids.includes(activeSceneId))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [allObjects, activeSceneId]);

  const addObject = useCallback(
    async (data: Partial<BoardObject>): Promise<string> => {
      const inj = injectRef.current;
      const type = data.type ?? 'panel';
      const now = Date.now();
      const id = (data as { id?: string }).id ?? genId();
      const newObj: BoardObject = {
        id,
        room_id: roomId,
        type,
        name: data.name ?? '新規オブジェクト',
        global: data.global ?? false,
        scene_ids: data.scene_ids ?? [],
        x: data.x ?? 50, y: data.y ?? 50,
        width: data.width ?? 4, height: data.height ?? 4,
        visible: data.visible ?? true, opacity: data.opacity ?? 1,
        sort_order: data.sort_order ?? (Math.max(0, ...allObjects.map(o => o.sort_order)) + 1),
        position_locked: data.position_locked ?? false,
        size_locked: data.size_locked ?? false,
        image_asset_id: data.image_asset_id ?? null,
        background_color: data.background_color ?? 'transparent',
        image_fit: data.image_fit ?? 'contain',
        text_content: data.text_content ?? null, font_size: data.font_size ?? 128,
        font_family: data.font_family ?? 'sans-serif',
        letter_spacing: data.letter_spacing ?? 0, line_height: data.line_height ?? 1.2,
        auto_size: data.auto_size ?? true,
        text_align: data.text_align ?? 'left',
        text_vertical_align: data.text_vertical_align ?? 'top',
        text_color: data.text_color ?? '#ffffff',
        scale_x: data.scale_x ?? 1, scale_y: data.scale_y ?? 1,
        memo: data.memo ?? '',
        created_at: now, updated_at: now,
      };
      if (inj) {
        await inj.create(newObj);
      } else {
        try {
          await mutation.insert(newObj);
        } catch (error) {
          console.error('[useObjects] addObject failed:', error);
          throw error;
        }
      }
      return id;
    },
    [roomId, allObjects.length, mutation]
  );

  const updateObject = useCallback(
    async (id: string, updates: Partial<BoardObject>): Promise<void> => {
      const inj = injectRef.current;
      if (inj) {
        await inj.update(id, updates);
      } else {
        const rest = omitKeys(updates as BoardObject, ['id', 'room_id', 'type', 'created_at']);
        try {
          await mutation.update(id, { ...rest, updated_at: Date.now() } as Partial<BoardObject>);
        } catch (error) {
          console.error('[useObjects] updateObject failed:', error);
        }
      }
    },
    [mutation]
  );

  /** ローカルのみ更新（通信なし）。ドラッグ中のプレビュー用 */
  const localUpdateObject = useCallback(
    (id: string, updates: Partial<BoardObject>): void => {
      const rest = omitKeys(updates as BoardObject, ['id', 'room_id', 'type', 'created_at']);
      mutation.localUpdate(id, rest as Partial<BoardObject>);
    },
    [mutation]
  );

  const removeObject = useCallback(
    async (id: string): Promise<void> => {
      const inj = injectRef.current;
      if (inj) {
        await inj.remove(id);
      } else {
        try {
          await mutation.remove(id);
        } catch (error) {
          console.error('[useObjects] removeObject failed:', error);
        }
      }
    },
    [mutation]
  );

  const reorderObjects = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      const inj = injectRef.current;
      const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
      if (inj) {
        await inj.reorder(updates);
      } else {
        try {
          await mutation.reorder(orderedIds);
        } catch (error) {
          console.error('[useObjects] reorderObjects failed:', error);
          throw error;
        }
      }
    },
    [mutation]
  );

  const batchUpdateSort = useCallback(
    async (updates: { id: string; sort: number }[]): Promise<void> => {
      if (isLayerSortDebug()) {
        console.log('[LayerSortDebug] batchUpdateSort 開始', { count: updates.length, updates });
      }
      const inj = injectRef.current;
      if (inj) {
        await inj.batchUpdateSort(updates);
        return;
      }

      // 楽観的更新
      let snapshot: BoardObject[] = [];
      setObjectsData((prev) => {
        snapshot = [...prev];
        return prev.map((o) => {
          const u = updates.find((u) => u.id === o.id);
          return u ? { ...o, sort_order: u.sort } : o;
        });
      });

      try {
        const { error } = await supabase.rpc('batch_update_object_sort', {
          p_room_id: roomId,
          p_updates: updates.map(({ id, sort }) => ({ id, sort })),
        });
        if (error) throw error;
        if (isLayerSortDebug()) {
          console.log('[LayerSortDebug] batchUpdateSort RPC 完了');
        }
      } catch (error) {
        console.error('[useObjects] batchUpdateSort RPC failed:', error);
        // ロールバック
        setObjectsData(snapshot);
        throw error;
      }
    },
    [roomId, setObjectsData]
  );

  return {
    allObjects, activeObjects, loading,
    addObject, updateObject, localUpdateObject, removeObject, reorderObjects, batchUpdateSort,
  };
}
