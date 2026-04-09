import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { isAdrasteaRealtimeDebug, isAdrasteaQueryDebug, isLayerSortDebug } from '../utils/debugFlags';
import { rowIdKey, sameRowId } from '../utils/supabaseRealtimeRowId';

/**
 * Supabase Realtime 購読オプション
 */
export interface UseSupabaseQueryOptions {
  table: string;
  columns: string; // 'id,name,...' — select('*') 禁止（カラム指定必須）
  roomId: string; // チャネルキー用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any; // フィルタ関数（e.g., (q) => q.eq('room_id', roomId)）。Supabase の PostgrestFilterBuilder の型は非常に複雑なため any を許容
  orderBy?: { column: string; ascending?: boolean };
  /** postgres_changes 用 filter（例: rooms は `id=eq.<roomId>` で自ルーム行のみ） */
  realtimeFilter?: string;
  /**
   * 同一 roomId・同一 table を複数フックで購読する場合に必ず異なる値を付ける。
   * チャンネル名が被ると2本目の subscribe が無視され Realtime が片方にしか届かない。
   */
  realtimeChannelSuffix?: string;
  enabled?: boolean; // false なら購読しない
  /**
   * false のとき初回 SELECT のみ（Realtime しない）。
   * 同一 table で channel 名が被ると2本目の subscribe が無視され、片方だけイベントが届かない。
   */
  realtime?: boolean;
  /** RPC 等で取得済みの初期データ。指定時は初回 SELECT をスキップ */
  initialData?: unknown[];
}

export interface UseSupabaseQueryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  setData: React.Dispatch<React.SetStateAction<T[]>>;
}

/**
 * モジュールレベル echo suppression キャッシュ
 * テーブル → pending ID → timer ID
 */
const pendingUpdatesRegistry = new Map<string, Map<string, NodeJS.Timeout>>();

/**
 * 楽観更新直後の Realtime echo 用タイマー管理。
 * UPDATE 受信時は pending を解除したうえで必ず newData をマージする（他端末の更新を落とさない）。
 */
/** 楽観更新後の Realtime echo 抑制用（他モジュールから characters_stats 等にマークする場合） */
export function markAsPending(table: string, id: unknown): void {
  const key = rowIdKey(id);
  if (!key) return;
  if (!pendingUpdatesRegistry.has(table)) {
    pendingUpdatesRegistry.set(table, new Map());
  }

  const pending = pendingUpdatesRegistry.get(table)!;

  // 既存の timer をクリア
  if (pending.has(key)) {
    clearTimeout(pending.get(key)!);
  }

  // 10秒後に自動削除（取りこぼし防止）
  const timerId = setTimeout(() => {
    pending.delete(key);
  }, 10000);

  pending.set(key, timerId);
}

function isPending(table: string, id: unknown): boolean {
  const key = rowIdKey(id);
  if (!key) return false;
  return pendingUpdatesRegistry.get(table)?.has(key) ?? false;
}

export function clearPending(table: string, id: unknown): void {
  const key = rowIdKey(id);
  if (!key) return;
  const pending = pendingUpdatesRegistry.get(table);
  if (pending?.has(key)) {
    clearTimeout(pending.get(key)!);
    pending.delete(key);
  }
}

/**
 * Supabase Realtime 購読 + 初回取得
 *
 * @param options 購読オプション
 * @returns data, loading, error
 */
export function useSupabaseQuery<T extends { id: string }>(
  options: UseSupabaseQueryOptions
): UseSupabaseQueryResult<T> {
  const {
    table,
    columns,
    roomId,
    filter,
    orderBy,
    realtimeFilter,
    realtimeChannelSuffix,
    enabled = true,
    realtime = true,
    initialData,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const filterRef = useRef(filter);
  const orderByRef = useRef(orderBy);
  const realtimeFilterRef = useRef(realtimeFilter);
  const initialDataRef = useRef(initialData);

  // filter, orderBy, initialData を ref で保持（毎レンダーの新参照を防ぐ）
  filterRef.current = filter;
  orderByRef.current = orderBy;
  realtimeFilterRef.current = realtimeFilter;
  initialDataRef.current = initialData;

  useEffect(() => {
    if (!enabled) {
      // loading=true のまま返す。enabled=false → true の遷移時に allObjects=[] + loading=false の
      // 中間状態が生じ、characters_layer 等の自動生成トリガーが誤発火するのを防ぐ。
      return;
    }

    let isMounted = true;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    if (realtime) {
      // 1. チャネル作成（テーブル別・同一 table の複数購読は suffix で分離）
      const channelName =
        realtimeChannelSuffix != null && realtimeChannelSuffix !== ''
          ? `room:${roomId}:${table}:${realtimeChannelSuffix}`
          : `room:${roomId}:${table}`;
      channel = supabase.channel(channelName);

      // 2. Realtime リスナー登録（subscribe の前に！）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          ...(realtimeFilterRef.current
            ? { filter: realtimeFilterRef.current }
            : {}),
        },
        (payload: any) => {
          const { eventType, new: newData, old: oldData } = payload;

          if (!isMounted) return;

          const debug = isAdrasteaRealtimeDebug();
          if (debug) {
            const rowId = newData?.id ?? oldData?.id;
            const detail: Record<string, unknown> = {
              eventType,
              rowId,
              channelTable: table,
              subscribeRoomId: roomId,
            };
            if (newData && table === 'rooms') {
              detail.active_scene_id = (newData as { active_scene_id?: string | null }).active_scene_id;
              detail.room_id_field = (newData as { room_id?: unknown }).room_id;
            }
            if (newData && table === 'scenes') {
              detail.scene_id = newData.id;
              detail.name = (newData as { name?: string }).name;
            }
            if (newData) {
              detail.matchesFilter = matchesFilter(newData, roomId, table);
            }
            if (eventType === 'UPDATE' && newData) {
              detail.wasPending = isPending(table, newData.id);
            }
            console.log('[Adrastea:Realtime] postgres_changes', detail);
          }

          switch (eventType) {
            case 'INSERT': {
              if (!matchesFilter(newData, roomId, table)) return;
              setData((prev) => {
                const exists = prev.some((row) => sameRowId(row.id, newData.id));
                if (exists) return prev;
                return [...prev, newData];
              });
              break;
            }
            case 'UPDATE': {
              const id = newData.id;
              if (
                isLayerSortDebug() &&
                table === 'objects' &&
                newData &&
                typeof (newData as { sort_order?: unknown }).sort_order === 'number'
              ) {
                console.log('[LayerSortDebug] Realtime objects UPDATE', {
                  id,
                  sort_order: (newData as { sort_order: number }).sort_order,
                  updated_at: (newData as { updated_at?: number }).updated_at,
                });
              }
              // RPC の一時退避値（-100000 以下）は無視
              if (
                table === 'objects' &&
                typeof (newData as { sort_order?: unknown }).sort_order === 'number' &&
                (newData as { sort_order: number }).sort_order <= -100000
              ) {
                break;
              }
              if (isPending(table, id)) {
                clearPending(table, id);
              }
              if (!matchesFilter(newData, roomId, table)) {
                if (debug) {
                  console.warn('[Adrastea:Realtime] UPDATE skipped (matchesFilter=false)', {
                    table,
                    rowId: id,
                    subscribeRoomId: roomId,
                  });
                }
                // rooms は1行のみ: 誤フィルタで行を消すと active_scene 等が全クライアントで壊れる
                if (table !== 'rooms') {
                  setData((prev) => prev.filter((row) => !sameRowId(row.id, id)));
                }
                break;
              }
              setData((prev) =>
                prev.map((row) =>
                  sameRowId(row.id, id) ? ({ ...row, ...newData } as T) : row
                )
              );
              break;
            }
            case 'DELETE': {
              const id = oldData.id;
              clearPending(table, id);
              setData((prev) => prev.filter((row) => !sameRowId(row.id, id)));
              break;
            }
          }
        }
      );

      // 3. subscribe（.on() の後）
      channel.subscribe((status, err) => {
        if (isAdrasteaRealtimeDebug()) {
          console.log('[Adrastea:Realtime] channel subscribe', {
            table,
            subscribeRoomId: roomId,
            realtimeFilter: realtimeFilterRef.current ?? null,
            status,
            err: err?.message ?? null,
          });
        }
      });
    }

    // 4. 初回データ注入または SELECT
    if (initialDataRef.current) {
      // initialData がある場合: effect 内で注入
      setData(initialDataRef.current as T[]);
      setLoading(false);
      if (isAdrasteaQueryDebug()) {
        console.log('[Adrastea:Query] skip SELECT (initialData provided)', { table });
      }
    } else {
      // initialData がない場合: SELECT で取得
      const fetchInitial = async () => {
        try {
          if (isAdrasteaQueryDebug()) {
            console.log('[Adrastea:Query] SELECT', { table, columns: columns.substring(0, 50) + '...' });
          }
          let query = supabase.from(table).select(columns);
          if (filterRef.current) {
            query = filterRef.current(query);
          }
          if (orderByRef.current) {
            query = query.order(orderByRef.current.column, {
              ascending: orderByRef.current.ascending !== false,
            });
          }
          const { data: fetchedData, error: fetchError } = await query;
          if (fetchError) {
            console.debug(`[useSupabaseQuery] ${table} / columns: ${columns}`, fetchError);
            throw fetchError;
          }
          if (!isMounted) return;
          setData((fetchedData || []) as unknown as T[]);
          setLoading(false);
          setError(null);
        } catch (err) {
          if (isMounted) {
            setError(err as Error);
            setLoading(false);
          }
        }
      };
      fetchInitial();
    }

    // 5. クリーンアップ
    return () => {
      isMounted = false;
      void channel?.unsubscribe();
    };
  }, [table, columns, roomId, enabled, realtimeFilter, realtimeChannelSuffix, realtime]);

  return { data, loading, error, setData };
}

/**
 * Realtime ペイロードがこの購読（roomId）に属するか。
 * - rooms テーブルは PK が id (= ルームID) で room_id 列がない。payload に room_id:null が付くと従来比較で誤って除外され、
 *   UPDATE 時にルーム行が state から消え active_scene が同期しなくなることがある。
 */
function matchesFilter(
  data: Record<string, unknown>,
  roomId: string | undefined,
  table: string
): boolean {
  if (!roomId) return true;
  if (table === 'rooms') {
    return data.id === roomId;
  }
  if ('room_id' in data && data.room_id !== roomId) return false;
  return true;
}

/**
 * 楽観的更新用 mutation ヘルパー
 * 使用例: useSupabaseMutation<Scene>('scenes', setScenes)
 */
export function useSupabaseMutation<T extends { id: string }>(
  table: string,
  setData: React.Dispatch<React.SetStateAction<T[]>>
) {
  const insert = async (item: T): Promise<void> => {
    // スナップショットを closure で保持
    let snapshot: T[] = [];
    setData((prev) => {
      snapshot = [...prev]; // スナップショット取得
      return [...prev, item];
    });

    try {
      const { error } = await supabase.from(table).insert([item]);
      if (error) {
        // ロールバック: closure のスナップショットを使用
        setData(snapshot);
        throw error;
      }
      // 成功時もclearPending
      clearPending(table, item.id);
    } catch (err) {
      console.error(`[useSupabaseMutation] insert failed:`, err);
      throw err;
    }
  };

  /** ローカル state のみ更新（通信なし）。ドラッグ中のプレビュー用 */
  const localUpdate = (id: string, updates: Partial<T>): void => {
    setData((prev) =>
      prev.map((row) => row.id === id ? { ...row, ...updates } : row)
    );
    markAsPending(table, id);
  };

  const update = async (id: string, updates: Partial<T>): Promise<void> => {
    // スナップショットを closure で保持
    let snapshot: T[] = [];
    setData((prev) => {
      snapshot = [...prev]; // スナップショット取得
      return prev.map((row) =>
        row.id === id ? { ...row, ...updates } : row
      );
    });

    // echo suppression マーク
    markAsPending(table, id);

    try {
      const { error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id);
      if (error) {
        // ロールバック: closure のスナップショットを使用
        setData(snapshot);
        clearPending(table, id);
        throw error;
      }
      // 成功時もclearPending
      clearPending(table, id);
    } catch (err) {
      console.error(`[useSupabaseMutation] update failed:`, err);
      throw err;
    }
  };

  const remove = async (id: string): Promise<void> => {
    // スナップショットを closure で保持
    let snapshot: T[] = [];
    setData((prev) => {
      snapshot = [...prev]; // スナップショット取得
      return prev.filter((row) => row.id !== id);
    });

    try {
      const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);
      if (error) {
        // ロールバック: closure のスナップショットを使用
        setData(snapshot);
        throw error;
      }
      if (count === 0) {
        // RLS で拒否された（エラーなし・0件削除）→ ロールバック
        setData(snapshot);
        throw new Error(`削除権限がありません (${table}/${id})`);
      }
      // 成功時もclearPending
      clearPending(table, id);
    } catch (err) {
      console.error(`[useSupabaseMutation] remove failed:`, err);
      throw err;
    }
  };

  const reorder = async (orderedIds: string[]): Promise<void> => {
    // スナップショットを closure で保持
    let snapshot: T[] = [];
    const now = Date.now();

    setData((prev) => {
      snapshot = [...prev]; // スナップショット取得
      const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map((row) => {
        const idx = idToIndex.get(row.id);
        return idx !== undefined
          ? { ...row, sort_order: idx, updated_at: now } as T
          : row;
      }).sort((a, b) => {
        const aOrder = (a as Record<string, unknown>).sort_order as number | undefined ?? 0;
        const bOrder = (b as Record<string, unknown>).sort_order as number | undefined ?? 0;
        return aOrder - bOrder;
      });
    });

    try {
      const results = await Promise.all(
        orderedIds.map((id, i) =>
          supabase.from(table).update({ sort_order: i, updated_at: now }).eq('id', id)
        )
      );
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        // ロールバック: closure のスナップショットを使用
        setData(snapshot);
        throw new Error('reorder failed with partial updates');
      }
    } catch (err) {
      console.error(`[useSupabaseMutation] reorder failed:`, err);
      throw err;
    }
  };

  return { insert, update, localUpdate, remove, reorder };
}
