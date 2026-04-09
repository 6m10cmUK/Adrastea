import { useCallback, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import type { Scene, BoardObject } from '../types/adrastea.types';
import type { ScenesInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';

export type OnObjectsCreated = (objects: BoardObject[]) => void;

export function useScenes(
  roomId: string,
  options?: {
    inject?: ScenesInject;
    onObjectsCreated?: OnObjectsCreated;
    onActivateScene?: (sceneId: string | null) => Promise<void>;
    initialData?: unknown[];
    enabled?: boolean;
  }
) {
  const { inject, onObjectsCreated, onActivateScene, initialData, enabled } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;
  const onActivateSceneRef = useRef(onActivateScene);
  onActivateSceneRef.current = onActivateScene;

  const { data: scenesData, loading: scenesLoading, setData: setScenesData } = useSupabaseQuery<Scene>({
    table: 'scenes',
    columns: 'id,room_id,name,background_asset_id,foreground_asset_id,foreground_opacity,bg_transition,bg_transition_duration,fg_transition,fg_transition_duration,bg_blur,bg_color_enabled,bg_color,fg_color_enabled,fg_color,foreground_x,foreground_y,foreground_width,foreground_height,grid_visible,sort_order,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled: !inject && enabled !== false,
    initialData,
  });

  const scenesMutation = useSupabaseMutation<Scene>('scenes', setScenesData);

  const loading = inject ? false : scenesLoading;
  const scenes: Scene[] = useMemo(
    () => {
      const data = inject ? inject.data : (scenesData ?? []);
      return [...data].sort((a, b) => a.sort_order - b.sort_order);
    },
    [inject, scenesData]
  );

  const addScene = useCallback(
    async (
      data: Partial<Omit<Scene, 'id' | 'room_id'>>,
      duplicateFromSceneId?: string,
      allObjects?: BoardObject[]
    ) => {
      const inj = injectRef.current;
      const id = genId();
      const now = Date.now();
      const newScene: Scene = {
        id,
        room_id: roomId,
        name: data.name ?? '新しいシーン',
        background_asset_id: data.background_asset_id ?? null,
        foreground_asset_id: data.foreground_asset_id ?? null,
        foreground_opacity: data.foreground_opacity ?? 1,
        foreground_x: data.foreground_x ?? 0,
        foreground_y: data.foreground_y ?? 0,
        foreground_width: data.foreground_width ?? 100,
        foreground_height: data.foreground_height ?? 100,
        bg_transition: data.bg_transition ?? 'none',
        bg_transition_duration: data.bg_transition_duration ?? 500,
        fg_transition: data.fg_transition ?? 'none',
        fg_transition_duration: data.fg_transition_duration ?? 500,
        bg_blur: data.bg_blur ?? true,
        bg_color_enabled: data.bg_color_enabled ?? false,
        bg_color: data.bg_color ?? '#333333',
        fg_color_enabled: data.fg_color_enabled ?? false,
        fg_color: data.fg_color ?? '#666666',
        grid_visible: data.grid_visible ?? false,
        sort_order: data.sort_order ?? scenes.length,
        created_at: now,
        updated_at: now,
      };

      // 複製時: シーンオブジェクト（panel/text）を sort_order ごと複製
      const createdObjects: BoardObject[] = [];
      if (duplicateFromSceneId && allObjects) {
        const sourceObjects = allObjects.filter(
          (o) => !o.global && o.scene_ids.includes(duplicateFromSceneId)
            && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
        );
        for (const obj of sourceObjects) {
          createdObjects.push({
            ...obj,
            id: genId(),
            room_id: roomId,
            scene_ids: [id],
            sort_order: obj.sort_order,
            created_at: now,
            updated_at: now,
          });
        }
      }
      // 新規作成時: オブジェクトは生成しない（bg/fg/characters_layer はルーム作成時に1回だけ作成済み）

      if (inj) {
        await inj.create(newScene);
        if (createdObjects.length > 0) {
          await inj.createObjectBatch(createdObjects);
          onObjectsCreated?.(createdObjects);
        }
      } else {
        try {
          await scenesMutation.insert(newScene);

          if (createdObjects.length > 0) {
            const { error: objectError } = await supabase.from('objects').insert(createdObjects);
            if (objectError && objectError.code !== '23505') {
              console.error('[useScenes] addScene object insert failed:', objectError);
              throw objectError;
            }
            onObjectsCreated?.(createdObjects);
          }
        } catch (error) {
          console.error('[useScenes] addScene failed:', error);
          throw error;
        }
      }

      return { scene: newScene, objects: [] };
    },
    [roomId, scenes.length, onObjectsCreated, scenesMutation]
    // ← inject は injectRef 経由なので deps に入れない
  );

  const updateScene = useCallback(
    async (sceneId: string, updates: Partial<Scene>) => {
      const inj = injectRef.current;
      if (inj) {
        await inj.update(sceneId, updates);
      } else {
        try {
          const rest = omitKeys(updates as Scene, ['id', 'room_id', 'created_at']);
          await scenesMutation.update(sceneId, { ...rest, updated_at: Date.now() } as Partial<Scene>);
        } catch (error) {
          console.error('[useScenes] updateScene failed:', error);
        }
      }
    },
    [scenesMutation]
  );

  const removeScene = useCallback(
    async (sceneId: string) => {
      const inj = injectRef.current;
      if (inj) {
        await inj.remove(sceneId);
      } else {
        try {
          await scenesMutation.remove(sceneId);
        } catch (error) {
          console.error('[useScenes] removeScene failed:', error);
        }
      }
    },
    [scenesMutation]
  );

  const activateScene = useCallback(
    async (sceneId: string | null) => {
      const callback = onActivateSceneRef.current;
      if (callback) {
        await callback(sceneId);
      }
    },
    []
  );

  const reorderScenes = useCallback(
    async (orderedIds: string[]) => {
      const inj = injectRef.current;
      const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
      if (inj) {
        await inj.reorder(updates);
      } else {
        try {
          await scenesMutation.reorder(orderedIds);
        } catch (error) {
          console.error('[useScenes] reorderScenes failed:', error);
          throw error;
        }
      }
    },
    [scenesMutation]
  );

  return { scenes, loading, addScene, updateScene, removeScene, reorderScenes, activateScene };
}
