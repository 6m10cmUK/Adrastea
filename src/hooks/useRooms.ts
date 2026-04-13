import { useCallback, useMemo } from 'react';
import type { Room } from '../types/adrastea.types';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import { useLocalStorageOrder } from './useLocalStorageOrder';
import { generateUUID } from '../utils/uuid';

const ROOM_ORDER_KEY = 'adrastea-room-order';

export type RoomUI = {
  id: string;
  name: string;
  dice_system: string;
  tags: string[];
  thumbnail_asset_id: string | null;
  created_at: number;
  updated_at: number;
};

// Re-export Room 型
export type { Room };

export function useRooms(_uid?: string) {
  const { user } = useAuth();
  const roomsQuery = useSupabaseQuery<Room>({
    table: 'rooms',
    columns: 'id,name,dice_system,tags,created_at,updated_at,thumbnail_asset_id,archived,owner_id',
    roomId: 'global',
    filter: (q) => q.eq('archived', false).eq('owner_id', user?.uid ?? ''),
  });

  const loading = roomsQuery.loading;
  const roomsMutation = useSupabaseMutation<Room>('rooms', roomsQuery.setData);

  const mergedRooms = useMemo<RoomUI[]>(() => {
    if (!roomsQuery.data) return [];
    return roomsQuery.data.map((r) => ({
      id: r.id,
      name: r.name ?? '',
      dice_system: r.dice_system ?? 'DiceBot',
      tags: (r as any).tags ?? [],
      thumbnail_asset_id: r.thumbnail_asset_id ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }, [roomsQuery.data]);

  // useLocalStorageOrder を使用してルーム順序を管理（カスタム順序がない場合は updated_at 順）
  const { orderedItems: rooms, saveOrder } = useLocalStorageOrder(mergedRooms, ROOM_ORDER_KEY);

  // mergedRooms の順序がない場合は updated_at 降順
  const sortedRooms = useMemo<RoomUI[]>(() => {
    // rooms は useLocalStorageOrder で保存順に並んでいる
    // new rooms が mergedRooms に追加されると、rooms の末尾に追加される
    // 新規ルームを updated_at 順でソートするため、保存順がない部分だけソート
    const savedIds = new Set<string>();
    try {
      const raw = localStorage.getItem(ROOM_ORDER_KEY);
      const ids = raw ? JSON.parse(raw) : [];
      ids.forEach((id: string) => savedIds.add(id));
    } catch {
      // ignore
    }

    const ordered: RoomUI[] = [];
    const unordered: RoomUI[] = [];
    for (const room of rooms) {
      if (savedIds.has(room.id)) {
        ordered.push(room);
      } else {
        unordered.push(room);
      }
    }

    // 未保存ルームを updated_at 降順でソート
    unordered.sort((a, b) => b.updated_at - a.updated_at);
    return [...ordered, ...unordered];
  }, [rooms]);

  const deleteRoom = useCallback(
    (roomId: string) => {
      void (async () => {
        try {
          await roomsMutation.remove(roomId);
        } catch (err) {
          console.error('ルーム削除に失敗:', err);
        }
      })();
    },
    [roomsMutation]
  );

  const updateRoom = useCallback(
    (roomId: string, data: Partial<Pick<RoomUI, 'name' | 'dice_system' | 'tags'>>) => {
      // name/dice_system/tags は Supabase に保存
      const supabaseData: Partial<Pick<RoomUI, 'name' | 'dice_system' | 'tags'>> = {};
      if (data.name !== undefined) supabaseData.name = data.name;
      if (data.dice_system !== undefined) supabaseData.dice_system = data.dice_system;
      if (data.tags !== undefined) supabaseData.tags = data.tags;
      if (Object.keys(supabaseData).length > 0) {
        void (async () => {
          try {
            await roomsMutation.update(roomId, supabaseData as Partial<Room>);
          } catch (err) {
            console.error('ルーム更新に失敗:', err);
          }
        })();
      }
    },
    [roomsMutation]
  );

  const reorderRooms = useCallback((orderedIds: string[]) => {
    saveOrder(orderedIds);
  }, [saveOrder]);

  const fetchRooms = useCallback(async () => {
    // Realtime が自動で最新データを返すため no-op
  }, []);

  const addRoom = useCallback(
    async (name: string, dice_system: string, tags: string[]): Promise<string> => {
      const id = generateUUID();
      const now = Date.now();
      let roomCreated = false;
      let sceneCreated = false;
      let objectsCreated = false;

      try {
        // 現在のユーザー情報を AuthContext から取得
        if (!user) throw new Error('User not authenticated');

        // 1. ルーム作成
        const { error: roomError } = await supabase.from('rooms').insert({
          id,
          name,
          dice_system,
          tags,
          owner_id: user.uid,
          gm_can_see_secret_memo: false,
          created_at: now,
          updated_at: now,
        });
        if (roomError) throw roomError;
        roomCreated = true;

        // 1.5. room_members に自分を owner として追加（RLS が role チェックするため必須）
        const { error: memberError } = await supabase.from('room_members').insert({
          room_id: id,
          user_id: user.uid,
          role: 'owner',
          joined_at: now,
        });
        if (memberError) throw memberError;

        // 2. デフォルトシーン「メイン」を作成（単色背景/前景）
        const sceneId = generateUUID();
        const { error: sceneError } = await supabase.from('scenes').insert({
          id: sceneId,
          room_id: id,
          name: 'メイン',
          background_asset_id: null,
          foreground_asset_id: null,
          foreground_opacity: 1,
          bg_transition: 'none',
          bg_transition_duration: 500,
          fg_transition: 'none',
          fg_transition_duration: 500,
          bg_blur: true,
          bg_color_enabled: true,
          bg_color: '#222222',
          fg_color_enabled: true,
          fg_color: '#111111',
          foreground_x: -24,
          foreground_y: -14,
          foreground_width: 48,
          foreground_height: 27,
          position: 0,
          created_at: now,
          updated_at: now,
        });
        if (sceneError) throw sceneError;
        sceneCreated = true;

        // 3. 背景・前景・キャラクターレイヤーオブジェクトを作成（連番: 0, 1, 2）
        const { error: objectsError } = await supabase.from('objects').insert([
          {
            id: generateUUID(),
            room_id: id,
            type: 'background',
            name: '背景',
            is_global: true,
            scene_start_id: null,
            scene_end_id: null,
            x: 0, y: 0, width: 0, height: 0,
            visible: true, opacity: 1, sort_order: 0,
            position_locked: true, size_locked: true,
            image_asset_id: null,
            background_color: '#222222', color_enabled: false, image_fit: 'cover',
            text_content: null, font_size: 16, font_family: 'sans-serif',
            letter_spacing: 0, line_height: 1.2, auto_size: true,
            text_align: 'left', text_vertical_align: 'top', text_color: '#ffffff',
            scale_x: 1, scale_y: 1,
            created_at: now, updated_at: now,
          },
          {
            id: generateUUID(),
            room_id: id,
            type: 'foreground',
            name: '前景',
            is_global: true,
            scene_start_id: null,
            scene_end_id: null,
            x: 0, y: 0, width: 0, height: 0,
            visible: true, opacity: 1, sort_order: 1,
            position_locked: true, size_locked: true,
            image_asset_id: null,
            background_color: '#111111', color_enabled: false, image_fit: 'cover',
            text_content: null, font_size: 16, font_family: 'sans-serif',
            letter_spacing: 0, line_height: 1.2, auto_size: true,
            text_align: 'left', text_vertical_align: 'top', text_color: '#ffffff',
            scale_x: 1, scale_y: 1,
            created_at: now, updated_at: now,
          },
          {
            id: generateUUID(),
            room_id: id,
            type: 'characters_layer',
            name: 'キャラクター',
            is_global: true,
            scene_start_id: null,
            scene_end_id: null,
            x: 0, y: 0, width: 0, height: 0,
            visible: true, opacity: 1, sort_order: 2,
            position_locked: true, size_locked: true,
            image_asset_id: null,
            background_color: '#333333', color_enabled: false, image_fit: 'cover',
            text_content: null, font_size: 16, font_family: 'sans-serif',
            letter_spacing: 0, line_height: 1.5, auto_size: false,
            text_align: 'left', text_vertical_align: 'top', text_color: '#000000',
            scale_x: 1, scale_y: 1,
            created_at: now, updated_at: now,
          },
        ]);
        // 23505: unique violation = 他タブが先にINSERT済み → 正常扱い
        if (objectsError && objectsError.code !== '23505') throw objectsError;
        objectsCreated = true;

        // 4. active_scene_id を設定
        const { error: updateError } = await supabase.from('rooms').update({ active_scene_id: sceneId }).eq('id', id);
        if (updateError) throw updateError;

        return id;
      } catch (err) {
        // ロールバック: 成功したステップのみ逆順で削除
        console.error('ルーム作成失敗:', err);
        if (objectsCreated) {
          await supabase.from('objects').delete().eq('room_id', id).then(() => {}, () => {});
        }
        if (sceneCreated) {
          await supabase.from('scenes').delete().eq('room_id', id).then(() => {}, () => {});
        }
        if (roomCreated) {
          await supabase.from('rooms').delete().eq('id', id).then(() => {}, () => {});
        }
        throw err;
      }
    },
    []
  );

  return { rooms: sortedRooms, loading, fetchRooms, deleteRoom, updateRoom, reorderRooms, addRoom };
}
