import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import { useLocalStorageOrder } from './useLocalStorageOrder';
import type { BgmTrack } from '../types/adrastea.types';
import type { BgmsInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';

const PLAYBACK_DEBOUNCE_MS = 48;

function isPlaybackOnlyPatch(updates: Partial<BgmTrack>): boolean {
  const keys = Object.keys(updates).filter(
    (k) => k !== 'updated_at' && updates[k as keyof BgmTrack] !== undefined
  );
  if (keys.length === 0) return false;
  return keys.every((k) => k === 'is_playing' || k === 'is_paused');
}

/** フル ID 列のうち、orderedSubsetIds に含まれるブロックだけを並べ替えた新しい ID 列（シーン絞り込みパネル用） */
export function mergeBgmSubsetOrderIntoFull(fullIds: string[], orderedSubsetIds: string[]): string[] {
  const subsetSet = new Set(orderedSubsetIds);
  if (orderedSubsetIds.length === 0) return fullIds;
  const firstSubsetIdx = fullIds.findIndex((id) => subsetSet.has(id));
  if (firstSubsetIdx < 0) {
    return [...fullIds.filter((id) => !subsetSet.has(id)), ...orderedSubsetIds];
  }
  const prefix = fullIds.slice(0, firstSubsetIdx).filter((id) => !subsetSet.has(id));
  const suffix = fullIds.slice(firstSubsetIdx + 1).filter((id) => !subsetSet.has(id));
  return [...prefix, ...orderedSubsetIds, ...suffix];
}

export function useBgms(roomId: string, options?: { inject?: BgmsInject; initialData?: unknown[]; enabled?: boolean }) {
  const { inject, initialData, enabled } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;

  const bgmsQuery = useSupabaseQuery<BgmTrack>({
    table: 'bgms',
    columns: 'id,room_id,name,bgm_type,bgm_source,bgm_asset_id,bgm_volume,bgm_loop,scene_ids,is_playing,is_paused,auto_play_scene_ids,fade_in,fade_in_duration,fade_out,fade_duration,sort_order,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    orderBy: { column: 'sort_order', ascending: true },
    enabled: !inject && enabled !== false,
    initialData,
  });
  const bgmsData = bgmsQuery.data;

  const bgmsMutation = useSupabaseMutation<BgmTrack>('bgms', bgmsQuery.setData);
  const bgmsMutationRef = useRef(bgmsMutation);
  bgmsMutationRef.current = bgmsMutation;

  // is_playing / is_paused のローカルオーバーライド
  // Supabase Realtime の楽観更新振動を防ぐ
  const [playbackOverrides, setPlaybackOverrides] = useState<
    Map<string, { is_playing: boolean; is_paused: boolean }>
  >(new Map());
  const overrideTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** is_playing / is_paused の DB 書き込みをまとめる（シーン切替で Realtime が連打されるのを抑える） */
  const playbackPendingRef = useRef<Map<string, Partial<Pick<BgmTrack, 'is_playing' | 'is_paused'>>>>(new Map());
  const playbackDebounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      playbackDebounceTimersRef.current.forEach((t) => clearTimeout(t));
      playbackDebounceTimersRef.current.clear();
      playbackPendingRef.current.clear();
    };
  }, []);

  const setPlaybackOverride = useCallback((id: string, state: { is_playing: boolean; is_paused: boolean }) => {
    setPlaybackOverrides(prev => new Map(prev).set(id, state));
    // 既存タイマーをクリア
    const existing = overrideTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    // 10秒後にオーバーライドを解除（Realtime が収束するまで）
    const timer = setTimeout(() => {
      setPlaybackOverrides(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      overrideTimersRef.current.delete(id);
    }, 10000);
    overrideTimersRef.current.set(id, timer);
  }, []);

  const loading = inject ? false : bgmsQuery.loading;

  const mergedBgms: BgmTrack[] = useMemo(() => {
    if (inject) return inject.data;

    return (bgmsData ?? []).map((b) => {
      const override = playbackOverrides.get(b.id);
      return {
        id: b.id,
        name: b.name,
        bgm_type: b.bgm_type as BgmTrack['bgm_type'],
        bgm_source: b.bgm_source ?? null,
        bgm_volume: b.bgm_volume,
        bgm_loop: b.bgm_loop,
        scene_ids: b.scene_ids,
        is_playing: override ? override.is_playing : b.is_playing,
        is_paused: override ? override.is_paused : b.is_paused,
        auto_play_scene_ids: b.auto_play_scene_ids ?? [],
        fade_in: b.fade_in ?? true,
        fade_in_duration: b.fade_in_duration ?? 500,
        sort_order: b.sort_order ?? 0,
        created_at: b.created_at,
        updated_at: b.updated_at,
      } as BgmTrack;
    });
  }, [inject, bgmsData, playbackOverrides]);

  // useLocalStorageOrder を使用して BGM の並び順を管理（DB sort_order と併用）
  const { orderedItems: bgms, saveOrder: saveBgmOrder, removeFromOrder: removeFromLocalStorageOrder } = useLocalStorageOrder(
    mergedBgms,
    `adrastea-bgm-order-${roomId}`
  );

  const addBgm = useCallback(
    async (data: Partial<Omit<BgmTrack, 'id'>>): Promise<string> => {
      const inj = injectRef.current;
      const id = (data as { id?: string }).id ?? genId();
      const now = Date.now();
      const bgmData = {
        id, room_id: roomId,
        name: data.name ?? '新規BGM',
        bgm_type: data.bgm_type ?? null,
        bgm_source: data.bgm_source ?? null,
        bgm_volume: data.bgm_volume ?? 0.5,
        bgm_loop: data.bgm_loop ?? true,
        scene_ids: data.scene_ids ?? [],
        is_playing: data.is_playing ?? false,
        is_paused: data.is_paused ?? false,
        auto_play_scene_ids: data.auto_play_scene_ids ?? [],
        fade_in: data.fade_in ?? true,
        fade_in_duration: data.fade_in_duration ?? 500,
        sort_order: data.sort_order ?? bgms.length,
        created_at: now, updated_at: now,
      };
      if (inj) {
        await inj.create(bgmData as BgmTrack);
      } else {
        try {
          await bgmsMutation.insert(bgmData as BgmTrack);
        } catch (error) {
          console.error('[useBgms] addBgm failed:', error);
          throw error;
        }
      }
      return id;
    },
    [roomId, bgms.length, bgmsMutation]
  );

  const flushPendingPlaybackWrite = useCallback(
    async (id: string): Promise<void> => {
      const timer = playbackDebounceTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        playbackDebounceTimersRef.current.delete(id);
      }
      const patch = playbackPendingRef.current.get(id);
      playbackPendingRef.current.delete(id);
      if (!patch || Object.keys(patch).length === 0) return;
      const rest = omitKeys(patch as BgmTrack, ['id', 'created_at', 'updated_at']);
      await bgmsMutation.update(id, { ...rest, updated_at: Date.now() } as Partial<BgmTrack>);
    },
    [bgmsMutation]
  );

  const schedulePlaybackWrite = useCallback(
    (id: string, fragment: Partial<Pick<BgmTrack, 'is_playing' | 'is_paused'>>) => {
      const prev = playbackPendingRef.current.get(id) ?? {};
      playbackPendingRef.current.set(id, { ...prev, ...fragment });
      const existing = playbackDebounceTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        playbackDebounceTimersRef.current.delete(id);
        void flushPendingPlaybackWrite(id).catch((e) => {
          console.error('[useBgms] debounced playback flush failed:', e);
        });
      }, PLAYBACK_DEBOUNCE_MS);
      playbackDebounceTimersRef.current.set(id, t);
    },
    [flushPendingPlaybackWrite]
  );

  const updateBgm = useCallback(
    async (id: string, updates: Partial<BgmTrack>): Promise<void> => {
      // is_playing / is_paused の変更はローカルオーバーライドで即座に安定化
      if ('is_playing' in updates || 'is_paused' in updates) {
        const current = bgms.find((b) => b.id === id);
        if (current) {
          setPlaybackOverride(id, {
            is_playing: updates.is_playing ?? current.is_playing,
            is_paused: updates.is_paused ?? current.is_paused,
          });
        }
      }

      const inj = injectRef.current;
      if (inj) {
        await inj.update(id, updates);
        const merged = { ...(bgms.find((b) => b.id === id) ?? {}), ...updates };
        if ((merged as BgmTrack).scene_ids?.length === 0) {
          await inj.remove(id);
        }
        return;
      }

      try {
        const playbackOnly = isPlaybackOnlyPatch(updates);
        if (playbackOnly) {
          const fragment: Partial<Pick<BgmTrack, 'is_playing' | 'is_paused'>> = {};
          if ('is_playing' in updates) fragment.is_playing = updates.is_playing!;
          if ('is_paused' in updates) fragment.is_paused = updates.is_paused!;
          schedulePlaybackWrite(id, fragment);
          return;
        }

        await flushPendingPlaybackWrite(id);

        const rest = omitKeys(updates as BgmTrack, ['id', 'created_at', 'updated_at']);
        await bgmsMutation.update(id, { ...rest, updated_at: Date.now() } as Partial<BgmTrack>);
        const merged = { ...(bgms.find((b) => b.id === id) ?? {}), ...updates };
        if ((merged as BgmTrack).scene_ids?.length === 0) {
          await bgmsMutation.remove(id);
          removeFromLocalStorageOrder(id);
        }
      } catch (error) {
        console.error('[useBgms] updateBgm failed:', error);
      }
    },
    [bgms, removeFromLocalStorageOrder, setPlaybackOverride, bgmsMutation, schedulePlaybackWrite, flushPendingPlaybackWrite]
  );

  const removeBgm = useCallback(
    async (id: string, activeSceneId?: string | null): Promise<void> => {
      const inj = injectRef.current;
      const bgm = bgms.find(b => b.id === id);

      // アクティブシーンが指定されていて、他シーンにも紐づいている場合は scene_ids から除去するだけ
      if (activeSceneId && bgm && bgm.scene_ids.includes(activeSceneId) && bgm.scene_ids.length > 1) {
        const newSceneIds = bgm.scene_ids.filter(s => s !== activeSceneId);
        const newAutoPlay = bgm.auto_play_scene_ids.filter(s => s !== activeSceneId);
        if (inj) {
          await inj.update(id, { scene_ids: newSceneIds, auto_play_scene_ids: newAutoPlay });
        } else {
          try {
            await bgmsMutation.update(id, { scene_ids: newSceneIds, auto_play_scene_ids: newAutoPlay, updated_at: Date.now() } as Partial<BgmTrack>);
          } catch (error) {
            console.error('[useBgms] removeBgm (unlink scene) failed:', error);
          }
        }
        return;
      }

      // 1シーンのみ or シーン未指定 → 完全削除
      if (inj) {
        await inj.remove(id);
      } else {
        try {
          await bgmsMutation.remove(id);
          removeFromLocalStorageOrder(id);
        } catch (error) {
          console.error('[useBgms] removeBgm failed:', error);
        }
      }
    },
    [bgms, removeFromLocalStorageOrder, bgmsMutation]
  );

  const reorderBgms = useCallback(
    async (orderedSubsetIds: string[]): Promise<void> => {
      if (orderedSubsetIds.length === 0) return;
      const fullIds = bgms.map((b) => b.id);
      const newFull = mergeBgmSubsetOrderIntoFull(fullIds, orderedSubsetIds);
      saveBgmOrder(newFull);
      const inj = injectRef.current;
      if (inj) return;
      try {
        await bgmsMutationRef.current.reorder(newFull);
      } catch (error) {
        console.error('[useBgms] reorderBgms failed:', error);
      }
    },
    [bgms, saveBgmOrder]
  );

  return { bgms, loading, addBgm, updateBgm, removeBgm, reorderBgms };
}
