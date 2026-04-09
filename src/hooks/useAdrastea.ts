import { useCallback } from 'react';
import type { Room } from '../types/adrastea.types';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import { omitKeys } from '../utils/object';

export function useAdrastea(
  roomId: string,
  options?: { initialRoom?: unknown[]; initialPieces?: unknown[]; enabled?: boolean }
) {
  const queryEnabled = options?.enabled !== false;
  // postgres_changes の server-side filter は型・エスケープでイベントが来ない事例があるため付けない。
  // 自ルーム以外の行は matchesFilter(data.id === roomId) で無視する。
  const roomsQuery = useSupabaseQuery<Room>({
    table: 'rooms',
    columns: 'id,name,dice_system,created_at,updated_at,active_scene_id,active_cutin,thumbnail_asset_id,gm_can_see_secret_memo,owner_id,description,default_login_role,status_change_chat_enabled,status_change_chat_channel,grid_visible',
    roomId,
    filter: (q) => q.eq('id', roomId),
    enabled: queryEnabled,
    initialData: options?.initialRoom,
  });

  const roomsMutation = useSupabaseMutation<Room>('rooms', roomsQuery.setData);

  const loading = roomsQuery.loading;

  const room: Room | null = roomsQuery.data[0] ?? null;


  const updateRoom = useCallback(
    (updates: Partial<Room>) => {
      const rest = omitKeys(updates as Room, ['id', 'owner_id', 'created_at']);
      void roomsMutation.update(roomId, rest as Partial<Room>).catch((error) => {
        console.error('[useAdrastea] updateRoom failed:', error);
        // TODO: showToast でユーザー通知
      });
    },
    [roomId, roomsMutation]
  );

  return { room, loading, updateRoom };
}
