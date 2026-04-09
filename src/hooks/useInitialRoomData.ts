import { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabase';
import { isAdrasteaQueryDebug } from '../utils/debugFlags';

/**
 * RPC get_room_initial_data で全テーブルのデータを1リクエストで取得する。
 * Realtime subscription は各フックが個別に行う。
 */

export interface RoomInitialData {
  room: Record<string, unknown> | null;
  scenes: Record<string, unknown>[];
  characters_stats: Record<string, unknown>[];
  characters_base: Record<string, unknown>[];
  objects: Record<string, unknown>[];
  bgms: Record<string, unknown>[];
  scenario_texts: Record<string, unknown>[];
  cutins: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  room_members: Record<string, unknown>[];
  channels: Record<string, unknown>[];
}

const MESSAGE_INITIAL_LIMIT = 100;

// モジュールレベルキャッシュ（roomId → Promise）
// 同一 roomId で複数コンポーネントが同時に呼んでも RPC は1回のみ実行される
const _rpcPromiseCache = new Map<string, Promise<RoomInitialData>>();
const _rpcDataCache = new Map<string, RoomInitialData>();

function fetchRpcData(roomId: string): Promise<RoomInitialData> {
  if (_rpcPromiseCache.has(roomId)) {
    return _rpcPromiseCache.get(roomId)!;
  }
  const promise = (async () => {
    if (isAdrasteaQueryDebug()) {
      console.log('[Adrastea:Query] RPC get_room_data', { roomId });
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_room_data',
      { room_id_arg: roomId, message_limit_arg: MESSAGE_INITIAL_LIMIT }
    );
    if (rpcError) throw rpcError;
    if (isAdrasteaQueryDebug()) {
      const tables = rpcData ? Object.keys(rpcData) : [];
      console.log('[Adrastea:Query] RPC success', { tables, roomId });
    }
    const result = rpcData as RoomInitialData;
    _rpcDataCache.set(roomId, result);
    return result;
  })();
  _rpcPromiseCache.set(roomId, promise);
  return promise;
}

export function useInitialRoomData(roomId: string) {
  const [data, setData] = useState<RoomInitialData | null>(() => _rpcDataCache.get(roomId) ?? null);
  const [loading, setLoading] = useState(() => !_rpcDataCache.has(roomId));
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!roomId || fetchedRef.current) return;
    fetchedRef.current = true;

    if (_rpcDataCache.has(roomId)) return;

    fetchRpcData(roomId)
      .then(result => {
        setData(result);
      })
      .catch(err => {
        console.error('[useInitialRoomData] RPC failed, falling back to individual queries', err);
        setError(err as Error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [roomId]);

  return { data, loading, error };
}
