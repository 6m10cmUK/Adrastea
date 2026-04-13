import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import type { Scene, BoardObject, BgmTrack } from '../types/adrastea.types';
import type { ScenesInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';

// ---- Clipboard ----
interface SceneClipboard {
  sceneData: Partial<Omit<Scene, 'id' | 'room_id' | 'position' | 'created_at' | 'updated_at'>>;
  type: 'copy' | 'cut';
}

// ---- Helper Functions ----
function isObjectInScene(obj: BoardObject, sceneId: string, scenes: Scene[]): boolean {
  if (obj.is_global) return true;
  if (!obj.scene_start_id || !obj.scene_end_id) return false;
  const targetPos = scenes.find(s => s.id === sceneId)?.position;
  const startPos = scenes.find(s => s.id === obj.scene_start_id)?.position;
  const endPos = scenes.find(s => s.id === obj.scene_end_id)?.position;
  if (targetPos === undefined || startPos === undefined || endPos === undefined) return false;
  return startPos <= targetPos && targetPos <= endPos;
}

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
    columns: 'id,room_id,name,background_asset_id,foreground_asset_id,foreground_opacity,bg_transition,bg_transition_duration,fg_transition,fg_transition_duration,bg_blur,bg_color_enabled,bg_color,fg_color_enabled,fg_color,foreground_x,foreground_y,foreground_width,foreground_height,grid_visible,position,created_at,updated_at',
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
      return [...data].sort((a, b) => a.position - b.position);
    },
    [inject, scenesData]
  );

  // Clipboard state
  const [sceneClipboard, setSceneClipboard] = useState<SceneClipboard | null>(null);

  const addScene = useCallback(
    async (
      data: Partial<Omit<Scene, 'id' | 'room_id'>>,
      options?: { insertIndex?: number; duplicateFromSceneId?: string; allObjects?: BoardObject[]; allBgms?: BgmTrack[] }
    ) => {
      const inj = injectRef.current;
      const { insertIndex, duplicateFromSceneId, allObjects } = options ?? {};
      const id = genId();
      const now = Date.now();

      // Determine position
      const position = data.position ?? insertIndex ?? scenes.length;

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
        position,
        created_at: now,
        updated_at: now,
      };

      // 複製時: シーンオブジェクト（panel/text）を複製
      const createdObjects: BoardObject[] = [];
      if (duplicateFromSceneId && allObjects) {
        const sourceObjects = allObjects.filter(
          (o) => isObjectInScene(o, duplicateFromSceneId, scenes)
            && o.type !== 'background' && o.type !== 'foreground' && o.type !== 'characters_layer'
        );
        for (const obj of sourceObjects) {
          createdObjects.push({
            ...obj,
            id: genId(),
            room_id: roomId,
            is_global: false,
            scene_start_id: id,
            scene_end_id: id,
            sort_order: obj.sort_order,
            created_at: now,
            updated_at: now,
          });
        }
      }
      // 新規作成時: オブジェクトは生成しない（bg/fg/characters_layer はルーム作成時に1回だけ作成済み）

      if (inj) {
        await inj.create(newScene);
        if (insertIndex !== undefined) {
          // Shift position for scenes after insertIndex
          const scenesToShift = scenes.filter(s => s.position >= insertIndex);
          for (const scene of scenesToShift) {
            await inj.update(scene.id, { position: scene.position + 1 });
          }
        }
        if (createdObjects.length > 0) {
          await inj.createObjectBatch(createdObjects);
          onObjectsCreated?.(createdObjects);
        }
      } else {
        try {
          await scenesMutation.insert(newScene);

          // Shift position for scenes after insertIndex
          if (insertIndex !== undefined) {
            const scenesToShift = scenes.filter(s => s.position >= insertIndex);
            for (const scene of scenesToShift) {
              const { error } = await supabase
                .from('scenes')
                .update({ position: scene.position + 1, updated_at: Date.now() })
                .eq('id', scene.id);
              if (error) {
                console.error('[useScenes] addScene position shift failed:', error);
                throw error;
              }
            }
          }

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

      return { scene: newScene, objects: createdObjects };
    },
    [roomId, scenes, onObjectsCreated, scenesMutation]
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
    async (sceneId: string, allObjects?: BoardObject[], allBgms?: BgmTrack[]) => {
      const inj = injectRef.current;
      const sceneToRemove = scenes.find(s => s.id === sceneId);
      if (!sceneToRemove) return;

      const scenePos = sceneToRemove.position;
      const nextScene = scenes.find(s => s.position === scenePos + 1);
      const prevScene = scenes.find(s => s.position === scenePos - 1);

      if (inj) {
        // Adjust objects and BGMs
        if (allObjects) {
          for (const obj of allObjects) {
            if (obj.is_global) continue;
            if (obj.scene_start_id === sceneId && obj.scene_end_id === sceneId) {
              await inj.removeObject?.(obj.id);
            } else if (obj.scene_start_id === sceneId && nextScene) {
              await inj.updateObject?.(obj.id, { scene_start_id: nextScene.id });
            } else if (obj.scene_end_id === sceneId && prevScene) {
              await inj.updateObject?.(obj.id, { scene_end_id: prevScene.id });
            }
          }
        }
        if (allBgms) {
          for (const bgm of allBgms) {
            if (bgm.scene_start_id === sceneId && bgm.scene_end_id === sceneId) {
              await inj.removeBgm?.(bgm.id);
            } else if (bgm.scene_start_id === sceneId && nextScene) {
              await inj.updateBgm?.(bgm.id, { scene_start_id: nextScene.id });
            } else if (bgm.scene_end_id === sceneId && prevScene) {
              await inj.updateBgm?.(bgm.id, { scene_end_id: prevScene.id });
            }
          }
        }
        // Remove scene
        await inj.remove(sceneId);
        // Shift position for scenes after removed scene
        const scenesToShift = scenes.filter(s => s.position > scenePos);
        for (const scene of scenesToShift) {
          await inj.update(scene.id, { position: scene.position - 1 });
        }
      } else {
        try {
          // Adjust objects and BGMs
          if (allObjects) {
            for (const obj of allObjects) {
              if (obj.is_global) continue;
              if (obj.scene_start_id === sceneId && obj.scene_end_id === sceneId) {
                const { error } = await supabase.from('objects').delete().eq('id', obj.id);
                if (error) console.error('[useScenes] removeScene object delete failed:', error);
              } else if (obj.scene_start_id === sceneId && nextScene) {
                const { error } = await supabase
                  .from('objects')
                  .update({ scene_start_id: nextScene.id, updated_at: Date.now() })
                  .eq('id', obj.id);
                if (error) console.error('[useScenes] removeScene object update failed:', error);
              } else if (obj.scene_end_id === sceneId && prevScene) {
                const { error } = await supabase
                  .from('objects')
                  .update({ scene_end_id: prevScene.id, updated_at: Date.now() })
                  .eq('id', obj.id);
                if (error) console.error('[useScenes] removeScene object update failed:', error);
              }
            }
          }
          if (allBgms) {
            for (const bgm of allBgms) {
              if (bgm.scene_start_id === sceneId && bgm.scene_end_id === sceneId) {
                const { error } = await supabase.from('bgms').delete().eq('id', bgm.id);
                if (error) console.error('[useScenes] removeScene bgm delete failed:', error);
              } else if (bgm.scene_start_id === sceneId && nextScene) {
                const { error } = await supabase
                  .from('bgms')
                  .update({ scene_start_id: nextScene.id, updated_at: Date.now() })
                  .eq('id', bgm.id);
                if (error) console.error('[useScenes] removeScene bgm update failed:', error);
              } else if (bgm.scene_end_id === sceneId && prevScene) {
                const { error } = await supabase
                  .from('bgms')
                  .update({ scene_end_id: prevScene.id, updated_at: Date.now() })
                  .eq('id', bgm.id);
                if (error) console.error('[useScenes] removeScene bgm update failed:', error);
              }
            }
          }
          // Remove scene
          await scenesMutation.remove(sceneId);
          // Shift position for scenes after removed scene
          const scenesToShift = scenes.filter(s => s.position > scenePos);
          for (const scene of scenesToShift) {
            const { error } = await supabase
              .from('scenes')
              .update({ position: scene.position - 1, updated_at: Date.now() })
              .eq('id', scene.id);
            if (error) console.error('[useScenes] removeScene position shift failed:', error);
          }
        } catch (error) {
          console.error('[useScenes] removeScene failed:', error);
        }
      }
    },
    [scenes, scenesMutation]
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

  // Clipboard operations
  const copyScene = useCallback(
    (sceneId: string) => {
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;
      const sceneData = omitKeys(scene, ['id', 'room_id', 'position', 'created_at', 'updated_at']);
      setSceneClipboard({ sceneData, type: 'copy' });
    },
    [scenes]
  );

  const cutScene = useCallback(
    async (sceneId: string, allObjects?: BoardObject[], allBgms?: BgmTrack[]) => {
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;
      const sceneData = omitKeys(scene, ['id', 'room_id', 'position', 'created_at', 'updated_at']);
      setSceneClipboard({ sceneData, type: 'cut' });
      await removeScene(sceneId, allObjects, allBgms);
    },
    [scenes, removeScene]
  );

  const pasteScene = useCallback(
    async (insertIndex: number, allObjects?: BoardObject[], allBgms?: BgmTrack[]) => {
      if (!sceneClipboard) return;
      const result = await addScene(sceneClipboard.sceneData, { insertIndex, allObjects, allBgms });
      if (sceneClipboard.type === 'cut') {
        setSceneClipboard(null);
      }
      return result;
    },
    [sceneClipboard, addScene]
  );

  return { scenes, loading, addScene, updateScene, removeScene, activateScene, sceneClipboard, copyScene, cutScene, pasteScene };
}
