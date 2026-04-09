import { useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useSupabaseQuery, markAsPending, clearPending } from './useSupabaseQuery';
import { useLocalStorageOrder } from './useLocalStorageOrder';
import type { Character, CharacterStatus } from '../types/adrastea.types';
import type { CharactersInject } from '../types/adrastea-persistence';
import { genId } from '../utils/id';
import { omitKeys } from '../utils/object';

/**
 * ステータス +/- 連打: 表示は毎回 setData で即時更新（UX）、
 * Supabase への PATCH はこの間隔でまとめて 1 回（負荷・競合抑制）。
 */
const CHARACTER_STATUSES_DEBOUNCE_MS = 300;

const CHAR_STATS_TABLE = 'characters_stats';

interface CharacterStatsRow {
  id: string;
  room_id: string;
  owner_id: string;
  name: string;
  color: string;
  active_image_index: number;
  statuses: unknown;
  parameters: unknown;
  is_hidden_on_board: boolean;
  sort_order: number | null;
  on_board: boolean | null;
  board_x: number | null;
  board_y: number | null;
  board_height: number | null;
  board_visible: boolean | null;
  created_at: number;
  updated_at: number;
}

interface CharacterBaseRow {
  id: string;
  room_id: string;
  images: unknown;
  memo: string;
  secret_memo: string;
  chat_palette: string;
  sheet_url: string | null;
  initiative: number;
  size: number;
  is_status_private: boolean;
}

export type CharacterStatusesPersistedPayload = {
  characterName: string;
  isStatusPrivate: boolean;
  prevStatuses: CharacterStatus[];
  nextStatuses: CharacterStatus[];
};

export function useCharacters(
  roomId: string,
  options?: {
    inject?: CharactersInject;
    initialStats?: unknown[];
    initialBase?: unknown[];
    enabled?: boolean;
    /** DB 反映確定後（デバウンス flush 成功 or updateCharacter の statuses 更新成功） */
    onCharacterStatusesPersisted?: (payload: CharacterStatusesPersistedPayload) => void;
  }
) {
  const { inject, initialStats, initialBase, enabled, onCharacterStatusesPersisted } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;

  const statsQuery = useSupabaseQuery<CharacterStatsRow>({
    table: 'characters_stats',
    columns: 'id,room_id,owner_id,name,color,active_image_index,statuses,parameters,is_hidden_on_board,sort_order,on_board,board_x,board_y,board_height,board_visible,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled: !inject && enabled !== false,
    initialData: initialStats,
  });
  const baseQuery = useSupabaseQuery<CharacterBaseRow>({
    table: 'characters_base',
    columns: 'id,room_id,images,memo,secret_memo,chat_palette,sheet_url,initiative,size,is_status_private',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled: !inject && enabled !== false,
    initialData: initialBase,
  });

  const statsData = statsQuery.data;
  const baseData = baseQuery.data;
  const setCharacterStatsData = statsQuery.setData;

  const loading = inject ? false : (statsQuery.loading || baseQuery.loading);

  const mergedCharacters: Character[] = useMemo(() => {
    if (inject) return inject.data;

    // 両テーブルが loading 中なら空配列を返す
    if (!statsData.length && !baseData.length && (statsQuery.loading || baseQuery.loading)) return [];

    if (!statsData || !baseData) return [];

    // Create map of base data for quick lookup
    const baseMap = new Map(baseData.map(b => [b.id, b]));

    return statsData.map((stat) => {
      const base = baseMap.get(stat.id);
      return {
        id: stat.id,
        room_id: stat.room_id,
        owner_id: stat.owner_id,
        name: stat.name,
        color: stat.color,
        active_image_index: stat.active_image_index,
        statuses: stat.statuses ?? [],
        parameters: stat.parameters ?? [],
        is_hidden_on_board: stat.is_hidden_on_board,
        sort_order: stat.sort_order ?? 0,
        board_x: stat.board_x ?? 0,
        board_y: stat.board_y ?? 0,
        board_visible: stat.board_visible ?? true,
        created_at: stat.created_at,
        updated_at: stat.updated_at,
        // From base table
        images: base?.images ?? [],
        memo: base?.memo ?? '',
        secret_memo: base?.secret_memo ?? '',
        chat_palette: base?.chat_palette ?? '',
        sheet_url: base?.sheet_url ?? null,
        initiative: base?.initiative ?? 0,
        size: base?.size ?? 1,
        is_status_private: base?.is_status_private ?? false,
      } as Character;
    });
  }, [inject, statsData, baseData, statsQuery.loading, baseQuery.loading]);

  // useLocalStorageOrder を使用してチャーパネルの並び順を管理
  const { orderedItems: characters, saveOrder: saveCharOrder } = useLocalStorageOrder(
    mergedCharacters,
    `adrastea-char-order-${roomId}`
  );

  // レイヤーパネルの並び順（DB の sort_order から導出）
  const layerOrderedCharacters: Character[] = useMemo(() => {
    return [...mergedCharacters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [mergedCharacters]);

  // chat_palette のローカルキャッシュオーバーレイ
  const charactersWithCachedPalette: Character[] = useMemo(() => {
    return characters.map((char) => {
      const cachedPalette = localStorage.getItem(`adrastea-chat-palette-${char.id}`);
      if (cachedPalette !== null) {
        return { ...char, chat_palette: cachedPalette };
      }
      return char;
    });
  }, [characters]);

  const fetchSecretMemo = useCallback(
    async (charId: string): Promise<string> => {
      const { data, error } = await supabase
        .from('characters_base')
        .select('secret_memo')
        .eq('id', charId)
        .single();
      if (error) {
        console.error('Failed to fetch secret_memo:', error);
        return '';
      }
      return data?.secret_memo ?? '';
    },
    []
  );

  const statusFlushTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingStatusesByCharRef = useRef<Map<string, CharacterStatus[]>>(new Map());
  const scheduleStatusesFlushRef = useRef<(charId: string) => void>(() => {});
  const statusPersistSnapshotRef = useRef<
    Map<string, { statuses: CharacterStatus[]; name: string; isStatusPrivate: boolean }>
  >(new Map());
  const onCharacterStatusesPersistedRef = useRef(onCharacterStatusesPersisted);
  onCharacterStatusesPersistedRef.current = onCharacterStatusesPersisted;

  // characters ref: addCharacter の sort_order 初期値計算に使用
  const charactersRef = useRef<Character[]>([]);
  charactersRef.current = characters;

  const flushStatusesForCharacter = useCallback(async (charId: string) => {
    statusFlushTimersRef.current.delete(charId);
    const latest = pendingStatusesByCharRef.current.get(charId);
    if (!latest) return;
    const snap = statusPersistSnapshotRef.current.get(charId);
    try {
      const { error } = await supabase
        .from(CHAR_STATS_TABLE)
        .update({ statuses: latest })
        .eq('id', charId);
      if (error) throw error;
      if (pendingStatusesByCharRef.current.get(charId) === latest) {
        pendingStatusesByCharRef.current.delete(charId);
        clearPending(CHAR_STATS_TABLE, charId);
        statusPersistSnapshotRef.current.delete(charId);
        if (snap) {
          onCharacterStatusesPersistedRef.current?.({
            characterName: snap.name,
            isStatusPrivate: snap.isStatusPrivate,
            prevStatuses: snap.statuses,
            nextStatuses: latest.map((s) => ({ ...s })),
          });
        }
      } else {
        scheduleStatusesFlushRef.current(charId);
      }
    } catch (err) {
      console.error('[useCharacters] debounced statuses flush failed:', err);
      statusPersistSnapshotRef.current.delete(charId);
      clearPending(CHAR_STATS_TABLE, charId);
    }
  }, []);

  const scheduleStatusesFlush = useCallback(
    (charId: string) => {
      const prevTimer = statusFlushTimersRef.current.get(charId);
      if (prevTimer !== undefined) clearTimeout(prevTimer);
      const t = setTimeout(() => {
        statusFlushTimersRef.current.delete(charId);
        void flushStatusesForCharacter(charId);
      }, CHARACTER_STATUSES_DEBOUNCE_MS);
      statusFlushTimersRef.current.set(charId, t);
    },
    [flushStatusesForCharacter]
  );

  scheduleStatusesFlushRef.current = scheduleStatusesFlush;

  /** タブ退避・離脱時: 未送信の statuses を即 PATCH（デバウンス中の値を落とさない） */
  const flushAllPendingStatusWrites = useCallback(() => {
    if (injectRef.current) return;
    const pendingIds = [...pendingStatusesByCharRef.current.keys()];
    for (const charId of pendingIds) {
      const timer = statusFlushTimersRef.current.get(charId);
      if (timer !== undefined) clearTimeout(timer);
      statusFlushTimersRef.current.delete(charId);
      void flushStatusesForCharacter(charId);
    }
  }, [flushStatusesForCharacter]);

  const patchCharacterStatus = useCallback(
    (charId: string, statusIndex: number, recipe: (s: CharacterStatus) => CharacterStatus) => {
      const inj = injectRef.current;
      if (inj) {
        const char = inj.data.find((c) => c.id === charId);
        if (!char) return;
        const base =
          pendingStatusesByCharRef.current.get(charId) ?? (char.statuses as CharacterStatus[]);
        const nextStatuses = base.map((s, i) => (i === statusIndex ? recipe(s) : s));
        pendingStatusesByCharRef.current.set(charId, nextStatuses);
        void inj.update(charId, { statuses: nextStatuses });
        return;
      }

      // 楽観的 UI: ここで即座にキャラ行が再レンダーされ、連打も常に最新行を recipe に渡せる
      setCharacterStatsData((prev) =>
        prev.map((row) => {
          if (row.id !== charId) return row;
          if (!statusPersistSnapshotRef.current.has(charId)) {
            const snapSrc = Array.isArray(row.statuses) ? (row.statuses as CharacterStatus[]) : [];
            const base = baseData.find((b) => b.id === charId);
            statusPersistSnapshotRef.current.set(charId, {
              statuses: snapSrc.map((s) => ({ ...s })),
              name: row.name,
              isStatusPrivate: Boolean(base?.is_status_private),
            });
          }
          const rowStatuses = Array.isArray(row.statuses) ? [...(row.statuses as CharacterStatus[])] : [];
          const cur = rowStatuses[statusIndex];
          if (!cur) return row;
          rowStatuses[statusIndex] = recipe(cur);
          pendingStatusesByCharRef.current.set(charId, rowStatuses);
          return { ...row, statuses: rowStatuses };
        })
      );
      markAsPending(CHAR_STATS_TABLE, charId);
      scheduleStatusesFlush(charId);
    },
    [setCharacterStatsData, scheduleStatusesFlush, baseData]
  );

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushAllPendingStatusWrites();
      }
    };
    const onPageHide = () => flushAllPendingStatusWrites();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushAllPendingStatusWrites]);

  useEffect(() => {
    return () => {
      for (const timer of statusFlushTimersRef.current.values()) {
        clearTimeout(timer);
      }
      statusFlushTimersRef.current.clear();
      if (!injectRef.current) {
        for (const [id, statuses] of pendingStatusesByCharRef.current.entries()) {
          void supabase.from(CHAR_STATS_TABLE).update({ statuses }).eq('id', id);
        }
      }
      pendingStatusesByCharRef.current.clear();
    };
  }, []);

  const addCharacter = useCallback(
    async (data: Partial<Omit<Character, 'id' | 'room_id' | 'created_at' | 'updated_at'>>): Promise<Character> => {
      const inj = injectRef.current;
      const now = Date.now();
      const id = (data as { id?: string }).id ?? genId();
      const newChar: Character = {
        id,
        room_id: roomId,
        owner_id: data.owner_id ?? '',
        name: data.name ?? '新規キャラクター',
        images: data.images ?? [],
        active_image_index: data.active_image_index ?? 0,
        color: data.color ?? '#555555',
        sheet_url: data.sheet_url ?? null,
        initiative: data.initiative ?? 0,
        size: data.size ?? 5,
        statuses: data.statuses ?? [],
        parameters: data.parameters ?? [],
        memo: data.memo ?? '',
        secret_memo: data.secret_memo ?? '',
        chat_palette: data.chat_palette ?? '',
        is_status_private: data.is_status_private ?? false,
        is_hidden_on_board: data.is_hidden_on_board ?? false,
        sort_order: data.sort_order ?? charactersRef.current.length,
        board_x: data.board_x ?? 0,
        board_y: data.board_y ?? 0,
        board_visible: data.board_visible ?? true,
        created_at: now,
        updated_at: now,
      };
      try {
        if (inj) {
          await inj.create(newChar);
        } else {
          const statsData = {
            id: newChar.id,
            room_id: newChar.room_id,
            owner_id: newChar.owner_id,
            name: newChar.name,
            color: newChar.color,
            active_image_index: newChar.active_image_index,
            statuses: newChar.statuses,
            parameters: newChar.parameters,
            is_hidden_on_board: newChar.is_hidden_on_board,
            sort_order: newChar.sort_order,
            board_x: newChar.board_x,
            board_y: newChar.board_y,
            board_visible: newChar.board_visible,
            created_at: newChar.created_at,
            updated_at: newChar.updated_at,
          };
          const baseData = {
            id: newChar.id,
            room_id: newChar.room_id,
            images: newChar.images,
            memo: newChar.memo,
            secret_memo: newChar.secret_memo,
            chat_palette: newChar.chat_palette,
            sheet_url: newChar.sheet_url,
            initiative: newChar.initiative,
            size: newChar.size,
            is_status_private: newChar.is_status_private,
          };
          // 楽観的 UI 更新
          statsQuery.setData((prev) => [...prev, statsData as unknown as CharacterStatsRow]);
          baseQuery.setData((prev) => [...prev, baseData as unknown as CharacterBaseRow]);
          // useSupabaseMutation 非経由: 2テーブル同時 INSERT のトランザクション保証が必要
          const [statsResult, baseResult] = await Promise.all([
            supabase.from('characters_stats').insert([statsData]),
            supabase.from('characters_base').insert([baseData]),
          ]);
          if (statsResult.error) throw statsResult.error;
          if (baseResult.error) throw baseResult.error;
        }
      } catch (err) {
        console.error('キャラクター作成失敗:', err);
        // 楽観的更新をロールバック
        statsQuery.setData((prev) => prev.filter((row) => row.id !== newChar.id));
        baseQuery.setData((prev) => prev.filter((row) => row.id !== newChar.id));
        // ロールバック: 片方が成功した可能性があるため削除
        const statsResult = await supabase.from('characters_stats').delete().eq('id', newChar.id);
        if (statsResult.error) console.error('Rollback stats failed:', statsResult.error);
        const baseResult = await supabase.from('characters_base').delete().eq('id', newChar.id);
        if (baseResult.error) console.error('Rollback base failed:', baseResult.error);
        throw err;
      }
      return newChar;
    },
    [roomId]
  );

  const updateCharacter = useCallback(
    async (charId: string, updates: Partial<Character>): Promise<void> => {
      const inj = injectRef.current;
      if (inj) {
        await inj.update(charId, updates);
        return;
      }

      // Fields that belong in characters_stats
      const statsFields = [
        'name', 'color', 'active_image_index',
        'statuses', 'parameters', 'owner_id',
        'is_hidden_on_board',
        'sort_order',
        'board_x', 'board_y', 'board_visible'
      ];

      // Fields that belong in characters_base
      const baseFields = [
        'images', 'memo', 'secret_memo', 'chat_palette',
        'sheet_url', 'initiative', 'size', 'is_status_private'
      ];

      // Separate updates
      const statsUpdates: Record<string, unknown> = { id: charId };
      const baseUpdates: Record<string, unknown> = { id: charId };

      Object.entries(updates).forEach(([key, value]) => {
        if (statsFields.includes(key)) {
          statsUpdates[key] = value;
        } else if (baseFields.includes(key)) {
          baseUpdates[key] = value;
        }
      });

      // Cache chat_palette in localStorage before mutation
      if ('chat_palette' in baseUpdates) {
        localStorage.setItem(`adrastea-chat-palette-${charId}`, (baseUpdates.chat_palette as string) ?? '');
      }

      const prevStatsRow = statsData.find((r) => r.id === charId);
      const prevBaseRow = baseData.find((b) => b.id === charId);

      // Build promises for Promise.all
      const promises: Array<Promise<{ error: Error | null }>> = [];
      let statsRestForNotify: Record<string, unknown> | null = null;

      if (Object.keys(statsUpdates).length > 1) {
        const statsRest = omitKeys(statsUpdates, ['id']);
        if ('statuses' in statsRest) statsRestForNotify = statsRest;
        promises.push(
          (async () => {
            const result = await supabase.from('characters_stats').update(statsRest).eq('id', charId);
            return { error: result.error };
          })()
        );
      }

      if (Object.keys(baseUpdates).length > 1) {
        const baseRest = omitKeys(baseUpdates, ['id']);
        promises.push(
          (async () => {
            const result = await supabase.from('characters_base').update(baseRest).eq('id', charId);
            return { error: result.error };
          })()
        );
      }

      // Execute all promises in parallel
      if (promises.length > 0) {
        const results = await Promise.all(promises);
        const errors = results.filter((r) => r.error);
        if (errors.length > 0) {
          console.error('updateCharacter partial failure:', errors);
          throw new Error('Character update failed');
        }
      }

      if (statsRestForNotify && prevStatsRow && 'statuses' in statsRestForNotify) {
        const prevStatuses = Array.isArray(prevStatsRow.statuses)
          ? (prevStatsRow.statuses as CharacterStatus[]).map((s) => ({ ...s }))
          : [];
        const nextStatuses = (statsRestForNotify.statuses as CharacterStatus[]).map((s) => ({ ...s }));
        onCharacterStatusesPersistedRef.current?.({
          characterName: prevStatsRow.name,
          isStatusPrivate: Boolean(prevBaseRow?.is_status_private),
          prevStatuses,
          nextStatuses,
        });
      }
    },
    [statsData, baseData]
  );

  const moveCharacter = useCallback(
    async (charId: string, updates: { board_x?: number; board_y?: number }): Promise<void> => {
      const inj = injectRef.current;
      if (inj) {
        await inj.move(charId, updates);
      } else {
        await supabase.from('characters_stats').update(updates).eq('id', charId);
      }
    },
    []
  );

  const removeCharacter = useCallback(
    async (charId: string): Promise<void> => {
      const inj = injectRef.current;
      try {
        if (inj) {
          await inj.remove(charId);
        } else {
          await Promise.all([
            supabase.from('characters_stats').delete().eq('id', charId),
            supabase.from('characters_base').delete().eq('id', charId),
          ]);
        }
      } catch (err) {
        console.error('キャラクター削除失敗:', err);
        throw err;
      }
    },
    []
  );

  // useLocalStorageOrder の saveOrder メソッドを外部公開
  // メモ: ここで characters ではなく mergedCharacters を再取得し saveOrder を呼ぶ
  const reorderCharacters = useCallback(
    (orderedIds: string[]): void => {
      saveCharOrder(orderedIds);
    },
    [saveCharOrder]
  );

  const reorderLayerCharacters = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      const inj = injectRef.current;
      const now = Date.now();
      try {
        if (inj) {
          await Promise.all(orderedIds.map((id, i) => inj.update(id, { sort_order: i, updated_at: now })));
        } else {
          const p_updates = orderedIds.map((id, i) => ({ id, sort: i }));
          const { error } = await supabase.rpc('batch_update_character_sort', {
            p_room_id: roomId,
            p_updates,
          });
          if (error) throw error;
        }
      } catch (err) {
        console.error('reorderLayerCharacters failed:', err);
      }
    },
    [roomId]
  );

  return {
    characters: charactersWithCachedPalette,
    layerOrderedCharacters,
    loading,
    addCharacter,
    updateCharacter,
    patchCharacterStatus,
    moveCharacter,
    removeCharacter,
    reorderCharacters,
    reorderLayerCharacters,
    fetchSecretMemo,
  };
}
