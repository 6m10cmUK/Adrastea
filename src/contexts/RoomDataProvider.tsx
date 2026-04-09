import React, { useContext, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type {
  ChatMessage,
  BoardObject,
} from '../types/adrastea.types';
import type { AuthUser } from './AuthContext';
import { supabase } from '../services/supabase';
import { useAdrastea } from '../hooks/useAdrastea';
import { useAdrasteaChat } from '../hooks/useAdrasteaChat';
import { useScenes } from '../hooks/useScenes';
import { useCharacters, type CharacterStatusesPersistedPayload } from '../hooks/useCharacters';
import { buildStatusChangeChatContents } from '../utils/statusChangeChat';
import { useObjects } from '../hooks/useObjects';
import { useBgms } from '../hooks/useBgms';
import { useAssets, resolveAssetId, primeAssetCache } from '../hooks/useAssets';
import { preloadImageBlobs } from '../components/DomObjectOverlay';
import { useInitialRoomData } from '../hooks/useInitialRoomData';
import { resolveTemplateVars } from '../components/utils/chatEditorUtils';
import type { RoomDataContextValue } from './AdrasteaContexts';
import { RoomDataContext } from './AdrasteaContexts';
import { isAdrasteaRealtimeDebug } from '../utils/debugFlags';

/** bg/fg 画像プリフェッチの上限待ち時間（ms）。タイムアウト時はフォールバックとして UI を進める。 */
const IMAGE_FETCH_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RoomDataProviderProps {
  children: React.ReactNode;
  roomId: string;
  initialLoadDone: boolean;
  withPermission: <F extends (...args: any[]) => any>(
    permission: string,
    fn: F,
  ) => F;
  user: AuthUser | null;
  activeChatChannel: string;
}

export const RoomDataProvider: React.FC<RoomDataProviderProps> = ({
  children,
  roomId,
  initialLoadDone,
  withPermission,
  user,
  activeChatChannel,
}) => {
  // --- Chat state management ---
  const [activeSpeakerCharId, setActiveSpeakerCharId] = useState<string | null>(null);

  // --- onObjectsCreated コールバック用 Ref（循環依存を回避） ---
  const objectsCreatedRef = useRef<((objects: BoardObject[]) => void) | null>(null);

  // --- RPC 一括取得（初回のみ） ---
  const { data: initialRoomData, loading: initialLoading } = useInitialRoomData(roomId);
  const rpcReady = !initialLoading;

  // --- Data hooks ---

  const {
    room,
    loading: roomLoading,
    updateRoom,
  } = useAdrastea(roomId, {
    initialRoom: initialRoomData?.room ? [initialRoomData.room] : undefined,
    enabled: rpcReady,
  });

  const {
    messages,
    loading: chatLoading,
    loadingMore,
    hasMore,
    sendMessage,
    loadMore,
    clearMessages,
    openSecretDice,
  } = useAdrasteaChat(roomId, {
    initialData: initialRoomData?.messages,
    enabled: rpcReady,
  });

  const roomRef = useRef(room);
  roomRef.current = room;

  const onCharacterStatusesPersisted = useCallback(
    (payload: CharacterStatusesPersistedPayload) => {
      const r = roomRef.current;
      if (!r || payload.isStatusPrivate) return;
      if (r.status_change_chat_enabled === false) return;
      const channel = r.status_change_chat_channel ?? 'main';
      const lines = buildStatusChangeChatContents(
        payload.characterName,
        payload.prevStatuses,
        payload.nextStatuses
      );
      for (const content of lines) {
        void sendMessage('システム', content, 'system', undefined, undefined, undefined, channel);
      }
    },
    [sendMessage]
  );

  // NOTE: channels, upsertChannel, deleteChannel は AdrasteaContext で管理される

  const {
    scenes,
    loading: scenesLoading,
    addScene,
    updateScene,
    removeScene,
    reorderScenes,
    activateScene,
  } = useScenes(roomId, {
    onObjectsCreated: (objs) => objectsCreatedRef.current?.(objs),
    onActivateScene: async (sceneId) => {
      // active_scene は rooms の楽観更新 + Realtime のみ。別 state で上書きすると他端末の切替に追随できない
      if (isAdrasteaRealtimeDebug()) {
        console.log('[Adrastea:Room] activateScene → updateRoom', { roomId, sceneId });
      }
      await updateRoom({ active_scene_id: sceneId });
    },
    initialData: initialRoomData?.scenes,
    enabled: rpcReady,
  });

  const {
    characters,
    layerOrderedCharacters,
    loading: charsLoading,
    addCharacter,
    updateCharacter,
    patchCharacterStatus,
    moveCharacter,
    removeCharacter,
    reorderCharacters,
    reorderLayerCharacters,
  } = useCharacters(roomId, {
    initialStats: initialRoomData?.characters_stats,
    initialBase: initialRoomData?.characters_base,
    enabled: rpcReady,
    onCharacterStatusesPersisted,
  });

  const effectiveSceneId = room?.active_scene_id ?? null;

  const prevActiveSceneLoggedRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isAdrasteaRealtimeDebug()) return;
    const next = room?.active_scene_id ?? null;
    if (prevActiveSceneLoggedRef.current === next) return;
    console.log('[Adrastea:Room] room.active_scene_id（表示用）', {
      roomId,
      from: prevActiveSceneLoggedRef.current,
      to: next,
    });
    prevActiveSceneLoggedRef.current = next;
  }, [room?.active_scene_id, roomId]);

  const {
    allObjects,
    activeObjects,
    loading: objectsLoading,
    addObject,
    updateObject,
    localUpdateObject,
    removeObject,
    reorderObjects,
    batchUpdateSort,
  } = useObjects(roomId, effectiveSceneId, {
    initialData: initialRoomData?.objects,
    enabled: rpcReady,
  });


  // NOTE: scenarioTexts と cutins は AdrasteaContext で管理される
  // （lazy loading のため、UIState の activePanels に依存）

  const {
    bgms,
    loading: bgmsLoading,
    addBgm,
    updateBgm,
    removeBgm,
    reorderBgms,
  } = useBgms(roomId, {
    initialData: initialRoomData?.bgms,
    enabled: rpcReady,
  });

  const { loading: assetsLoading } = useAssets();

  // --- RPC データから asset_id を抽出して一括プリフェッチ ---
  const assetPrimingDoneRef = useRef(false);
  useEffect(() => {
    if (assetPrimingDoneRef.current || !initialRoomData || !user?.uid) return;
    assetPrimingDoneRef.current = true;

    const assetIds = new Set<string>();

    // objects の image_asset_id
    for (const obj of initialRoomData.objects ?? []) {
      const id = (obj as any).image_asset_id;
      if (id && typeof id === 'string' && !id.startsWith('http')) assetIds.add(id);
    }

    // scenes の background_asset_id, foreground_asset_id
    for (const scene of initialRoomData.scenes ?? []) {
      const s = scene as any;
      if (s.background_asset_id && typeof s.background_asset_id === 'string') assetIds.add(s.background_asset_id);
      if (s.foreground_asset_id && typeof s.foreground_asset_id === 'string') assetIds.add(s.foreground_asset_id);
    }

    // characters_base の images[].asset_id
    for (const char of initialRoomData.characters_base ?? []) {
      const images = (char as any).images;
      if (Array.isArray(images)) {
        for (const img of images) {
          if (img?.asset_id && typeof img.asset_id === 'string') assetIds.add(img.asset_id);
        }
      }
    }

    if (assetIds.size === 0) return;

    // 一括取得（非同期、ノンブロッキング）
    const ids = [...assetIds];
    supabase
      .from('assets')
      .select('id,owner_id,url,r2_key,filename,title,size_bytes,width,height,tags,asset_type,created_at')
      .in('id', ids)
      .then(({ data: assets, error }) => {
        if (error || !assets) {
          console.error('[RoomDataProvider] Asset prefetch failed:', error);
          return;
        }
        const typed = assets.map(a => ({ ...a, tags: a.tags ?? [] })) as any[];
        primeAssetCache(typed, user.uid);
        const imageUrls = typed
          .filter((a: any) => a.asset_type === 'image')
          .map((a: any) => a.url as string)
          .filter(Boolean);
        if (imageUrls.length > 0) preloadImageBlobs(imageUrls);
      }, (err: any) => {
        console.error('[RoomDataProvider] Asset prefetch error:', err);
      });
  }, [initialRoomData, user?.uid]);

  // --- handleSendMessage: sendMessage の wrapper ---
  const handleSendMessage = useCallback(
    (
      content: string,
      messageType: ChatMessage['message_type'],
      characterName?: string,
      characterAvatarAssetId?: string | null,
      channel?: string,
    ) => {
      const senderName = characterName ?? 'noname';
      const senderUid = user?.uid;
      // キャラクター名からキャラクターを検索し、テンプレート変数を展開
      const character = characterName ? (characters.find(c => c.name === characterName) ?? null) : null;
      const commandMatch = content.trim().match(/^:([^+\-=]+)([+\-=])(-?\d+(?:\.\d+)?)$/);
      if (character && commandMatch) {
        const [, rawLabel, operator, rawAmount] = commandMatch;
        const label = rawLabel.trim();
        const amount = Number(rawAmount);
        if (Number.isFinite(amount)) {
          const statusIndex = character.statuses.findIndex((s) => s.label === label);
          if (statusIndex >= 0) {
            const target = character.statuses[statusIndex];
            const current = Number(target.value);
            if (Number.isFinite(current)) {
              const next =
                operator === '+' ? current + amount :
                operator === '-' ? current - amount :
                amount;
              const nextStatuses = [...character.statuses];
              nextStatuses[statusIndex] = { ...target, value: next };
              void updateCharacter(character.id, { statuses: nextStatuses });
              return;
            }
          }

          const paramIndex = character.parameters.findIndex((p) => p.label === label);
          if (paramIndex >= 0) {
            const target = character.parameters[paramIndex];
            const current = Number(target.value);
            if (Number.isFinite(current)) {
              const next =
                operator === '+' ? current + amount :
                operator === '-' ? current - amount :
                amount;
              const nextParameters = [...character.parameters];
              nextParameters[paramIndex] = { ...target, value: next };
              void updateCharacter(character.id, { parameters: nextParameters });
              return;
            }
          }
        }
      }
      const resolved = resolveTemplateVars(content, character);
      sendMessage(senderName, resolved, messageType, senderUid, characterAvatarAssetId ?? null, room?.dice_system, channel ?? activeChatChannel);
    },
    [sendMessage, user?.uid, activeChatChannel, room?.dice_system, characters, updateCharacter],
  );

  // --- characters_layer 自動生成 ---
  // ルーム入室後、characters_layer オブジェクトがなければ自動作成
  const charactersLayerCreatedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadDone || objectsLoading || !rpcReady) return;
    if (charactersLayerCreatedRef.current) return;
    const hasCharactersLayer = allObjects.some(o => o.type === 'characters_layer');
    if (!hasCharactersLayer) {
      charactersLayerCreatedRef.current = true;
      (async () => {
        try {
          await addObject({
            type: 'characters_layer',
            name: 'キャラクター',
            global: true,
            scene_ids: [],
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            visible: true,
            opacity: 1,
            sort_order: 9999,
            position_locked: true,
            size_locked: true,
            image_asset_id: null,
            background_color: 'transparent',
            image_fit: 'contain',
            text_content: null,
            font_size: 16,
            font_family: 'sans-serif',
            letter_spacing: 0,
            line_height: 1.2,
            auto_size: false,
            text_align: 'left',
            text_vertical_align: 'top',
            text_color: '#ffffff',
            scale_x: 1,
            scale_y: 1,
          });
        } catch (e) {
          // unique constraint violation (23505) = 他タブ/ユーザーが先にINSERT済み → 正常扱い
          const code = (e as { code?: string })?.code ?? (e as { error?: { code?: string } })?.error?.code;
          if (code === '23505') return;
          charactersLayerCreatedRef.current = false;
        }
      })();
    } else {
      const existingCharactersLayer = allObjects.find(o => o.type === 'characters_layer');
      if (existingCharactersLayer && !existingCharactersLayer.visible) {
        updateObject(existingCharactersLayer.id, { visible: true });
      }
    }
  }, [initialLoadDone, objectsLoading, rpcReady, allObjects, addObject, updateObject]);


  // --- 浮きBGMトラックの自動クリーンアップ ---
  // scenes と bgms の両方がロード完了してから実行（scenes 空状態での誤削除を防ぐ）
  const bgmCleanupDoneRef = useRef(false);
  const allLoaded = initialLoadDone && !scenesLoading && !bgmsLoading;
  useEffect(() => {
    if (bgmCleanupDoneRef.current || !allLoaded || scenes.length === 0) return;
    bgmCleanupDoneRef.current = true;
    const sceneIdSet = new Set(scenes.map(s => s.id));
    const orphans = bgms.filter(b =>
      b.scene_ids.length === 0 || b.scene_ids.every(sid => !sceneIdSet.has(sid))
    );
    if (orphans.length > 0) {
      (async () => {
        await Promise.all(orphans.map(b => removeBgm(b.id)));
      })();
    }
  }, [allLoaded, bgms, removeBgm, scenes]);

  // シーン削除後のorphan BGM即時削除（初回クリーンアップ後のみ）
  useEffect(() => {
    if (!bgmCleanupDoneRef.current) return;
    const sceneIdSet = new Set(scenes.map(s => s.id));
    const orphans = bgms.filter(b =>
      b.scene_ids.length === 0 || b.scene_ids.every(sid => !sceneIdSet.has(sid))
    );
    if (orphans.length > 0) {
      (async () => {
        await Promise.all(orphans.map(b => removeBgm(b.id)));
      })();
    }
  }, [scenes, bgms, removeBgm]);

  // スナップショット復元後、active_scene_id が未設定ならシーンを自動アクティベート
  const updateRoomRef = useRef(updateRoom);
  updateRoomRef.current = updateRoom;

  useEffect(() => {
    if (!initialLoadDone) return;
    if (effectiveSceneId) return; // すでにアクティブなシーンがある
    if (scenes.length > 0) {
      void updateRoomRef.current({ active_scene_id: scenes[0].id });
    }
  }, [initialLoadDone, effectiveSceneId, scenes]);

  // --- Loading state aggregate ---
  const [imagesReady, setImagesReady] = useState(false);
  const dataQueryReady = !roomLoading && !scenesLoading && !charsLoading && !objectsLoading && !bgmsLoading && !assetsLoading;

  // アクティブシーンの bg/fg 画像フェッチ完了を待つ
  useEffect(() => {
    if (!dataQueryReady || imagesReady) return;

    // アクティブシーンの背景/前景オブジェクトの画像を先にfetch
    const bgObj = activeObjects.find(o => o.type === 'background');
    const fgObj = activeObjects.find(o => o.type === 'foreground');

    const urls: string[] = [];
    if (bgObj?.image_asset_id && !bgObj.color_enabled) {
      const url = resolveAssetId(bgObj.image_asset_id);
      if (url) urls.push(url);
    }
    if (fgObj?.image_asset_id && !fgObj.color_enabled) {
      const url = resolveAssetId(fgObj.image_asset_id);
      if (url) urls.push(url);
    }

    if (urls.length === 0) {
      setImagesReady(true);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // タイムアウト時はフォールバックとして UI を進める（未完了の fetch は AbortController で中断）
    const timeoutPromise = new Promise<void>(resolve => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve();
      }, IMAGE_FETCH_TIMEOUT_MS);
    });

    const fetchPromise = Promise.all(
      urls.map(url =>
        fetch(url, { signal })
          .then(r => r.blob())
          .catch(() => null),
      ),
    ).then(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    });

    let cancelled = false;
    void Promise.race([fetchPromise, timeoutPromise]).then(() => {
      if (cancelled) return;
      setImagesReady(true);
    });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      controller.abort();
    };
  }, [dataQueryReady, imagesReady, activeObjects]);

  const dataReady = dataQueryReady && imagesReady;

  // --- Derived values ---
  const activeScene = useMemo(() => {
    if (!effectiveSceneId) return null;
    return scenes.find(s => s.id === effectiveSceneId) ?? null;
  }, [effectiveSceneId, scenes]);

  // Permission-guarded functions
  const guardedAddScene = withPermission('scene_edit', addScene);
  const guardedUpdateScene = withPermission('scene_edit', updateScene);
  const guardedRemoveScene = withPermission('scene_edit', removeScene);
  const guardedReorderScenes = withPermission('scene_edit', reorderScenes);
  const guardedActivateScene = withPermission('scene_edit', activateScene);
  const guardedAddObject = withPermission('object_edit', addObject);
  // updateObject をラップ: fg/bg の image_asset_id 変更時にシーンのサムネイル asset_id を同期
  const updateObjectWithThumbnailSync = useCallback(
    async (id: string, updates: Partial<BoardObject>): Promise<void> => {
      await updateObject(id, updates);
      if ('image_asset_id' in updates) {
        const obj = allObjects.find(o => o.id === id);
        if (obj && (obj.type === 'foreground' || obj.type === 'background')) {
          const sceneId = obj.scene_ids[0];
          if (sceneId) {
            const field = obj.type === 'foreground' ? 'foreground_asset_id' : 'background_asset_id';
            updateScene(sceneId, { [field]: updates.image_asset_id ?? null });
          }
        }
      }
    },
    [updateObject, allObjects, updateScene]
  );
  const guardedUpdateObject = withPermission('object_edit', updateObjectWithThumbnailSync);
  const guardedMoveObject = withPermission('object_move', updateObject);
  const guardedLocalUpdateObject = withPermission('object_move', localUpdateObject);
  const guardedRemoveObject = withPermission('object_edit', removeObject);
  const guardedReorderObjects = withPermission('object_edit', reorderObjects);
  const guardedBatchSort = withPermission('object_edit', batchUpdateSort);
  const guardedAddCharacter = withPermission('character_edit', addCharacter);
  const guardedUpdateCharacter = withPermission('character_edit', updateCharacter);
  const guardedPatchCharacterStatus = withPermission('character_edit', patchCharacterStatus);
  const guardedRemoveCharacter = withPermission('character_edit', removeCharacter);
  const guardedReorderCharacters = withPermission('character_edit', reorderCharacters);
  const guardedReorderLayerCharacters = withPermission('character_edit', reorderLayerCharacters);
  const guardedReorderBgms = withPermission('bgm_manage', reorderBgms);

  // --- Context value ---
  const value = useMemo<RoomDataContextValue>(
    () => ({
      // Rooms
      room,
      updateRoom,

      // Chat
      messages,
      chatLoading,
      loadingMore,
      hasMore,
      sendMessage,
      loadMore,
      clearMessages,
      openSecretDice,
      handleSendMessage,
      activeSpeakerCharId,
      setActiveSpeakerCharId,

      // Scenes
      scenes,
      addScene: guardedAddScene,
      updateScene: guardedUpdateScene,
      removeScene: guardedRemoveScene,
      reorderScenes: guardedReorderScenes,
      activateScene: guardedActivateScene,

      // Characters
      characters,
      layerOrderedCharacters,
      addCharacter: guardedAddCharacter,
      updateCharacter: guardedUpdateCharacter,
      patchCharacterStatus: guardedPatchCharacterStatus,
      moveCharacter,
      removeCharacter: guardedRemoveCharacter,
      reorderCharacters: guardedReorderCharacters,
      reorderLayerCharacters: guardedReorderLayerCharacters,

      // Objects
      allObjects,
      activeObjects,
      addObject: guardedAddObject,
      updateObject: guardedUpdateObject,
      moveObject: guardedMoveObject,
      localUpdateObject: guardedLocalUpdateObject,
      removeObject: guardedRemoveObject,
      reorderObjects: guardedReorderObjects,
      batchUpdateSort: guardedBatchSort,

      // ScenarioTexts (lazy-loaded, provided by AdrasteaContext)
      scenarioTexts: [] as any,
      addScenarioText: (async () => '') as any,
      updateScenarioText: (async () => {}) as any,
      removeScenarioText: (async () => {}) as any,
      reorderScenarioTexts: (async () => {}) as any,

      // Cutins (lazy-loaded, provided by AdrasteaContext)
      cutins: [] as any,
      addCutin: (async () => '') as any,
      updateCutin: (async () => {}) as any,
      removeCutin: (async () => {}) as any,
      reorderCutins: (async () => {}) as any,
      triggerCutin: (async () => {}) as any,
      clearCutin: (async () => {}) as any,

      // BGMs
      bgms,
      addBgm: withPermission('bgm_manage', addBgm),
      updateBgm: withPermission('bgm_manage', updateBgm),
      removeBgm: withPermission('bgm_manage', removeBgm),
      reorderBgms: guardedReorderBgms,

      // Derived
      activeScene,
      dataReady,
    }),
    [
      room,
      updateRoom,
      messages,
      chatLoading,
      loadingMore,
      hasMore,
      sendMessage,
      loadMore,
      clearMessages,
      openSecretDice,
      handleSendMessage,
      activeSpeakerCharId,
      setActiveSpeakerCharId,
      scenes,
      guardedAddScene,
      guardedUpdateScene,
      guardedRemoveScene,
      guardedReorderScenes,
      activateScene,
      characters,
      layerOrderedCharacters,
      guardedAddCharacter,
      guardedUpdateCharacter,
      guardedPatchCharacterStatus,
      moveCharacter,
      guardedRemoveCharacter,
      guardedReorderCharacters,
      guardedReorderLayerCharacters,
      allObjects,
      activeObjects,
      guardedAddObject,
      guardedUpdateObject,
      guardedMoveObject,
      guardedRemoveObject,
      guardedReorderObjects,
      guardedBatchSort,
      bgms,
      withPermission,
      addBgm,
      updateBgm,
      removeBgm,
      guardedReorderBgms,
      activeScene,
      dataReady,
      imagesReady,
    ]
  );

  return (
    <RoomDataContext.Provider value={value}>
      {children}
    </RoomDataContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useRoomData(): RoomDataContextValue {
  const ctx = useContext(RoomDataContext);
  if (!ctx) {
    throw new Error('useRoomData must be used within RoomDataProvider');
  }
  return ctx;
}
