import { useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import type { ChatChannel } from '../types/adrastea.types';
import { canViewChatChannel } from '../utils/chatChannelVisibility';

interface ChannelRow {
  id: string;
  room_id: string;
  channel_id: string;
  label: string;
  order: number;
  is_archived: boolean;
  is_private: boolean;
  allowed_user_ids: string[];
}

export const DEFAULT_CHANNELS: ChatChannel[] = [
  { channel_id: 'main', label: 'メイン', order: 0, is_archived: false, is_private: false, allowed_user_ids: [] },
  { channel_id: 'info', label: '情報', order: 1, is_archived: false, is_private: false, allowed_user_ids: [] },
  { channel_id: 'other', label: '雑談', order: 2, is_archived: false, is_private: false, allowed_user_ids: [] },
];

export function useChannels(
  roomId: string,
  options?: {
    initialData?: unknown[];
    enabled?: boolean;
    /** 閲覧者（未指定時はフィルタしない） */
    viewAsUserId?: string;
    viewAsRoomRole?: string;
  }
) {
  const { initialData, enabled, viewAsUserId, viewAsRoomRole } = options ?? {};
  const channelsQuery = useSupabaseQuery<ChannelRow>({
    table: 'channels',
    columns: 'id,room_id,channel_id,label,"order",is_archived,is_private,allowed_user_ids',
    roomId,
    filter: (q) => q.eq('room_id', roomId ?? ''),
    enabled: enabled !== false,
    initialData,
  });
  const channelsData = channelsQuery.data;
  const channelsMutation = useSupabaseMutation<ChannelRow>('channels', channelsQuery.setData);

  const mergedChannels: ChatChannel[] = useMemo(
    () =>
      DEFAULT_CHANNELS.concat(
        (channelsData ?? [])
          .filter((c) => {
            if (c.is_archived) return false;
            const isDefault = DEFAULT_CHANNELS.some((dc) => dc.channel_id === c.channel_id);
            return !isDefault;
          })
          .sort((a, b) => a.order - b.order)
          .map((c) => ({
            channel_id: c.channel_id,
            label: c.label,
            order: c.order,
            is_archived: c.is_archived,
            is_private: Boolean(c.is_private),
            allowed_user_ids: c.allowed_user_ids ?? [],
          }))
      ),
    [channelsData]
  );

  const channels: ChatChannel[] = useMemo(() => {
    if (!viewAsUserId || !viewAsRoomRole) return mergedChannels;
    return mergedChannels.filter((ch) => canViewChatChannel(ch, viewAsUserId, viewAsRoomRole));
  }, [mergedChannels, viewAsUserId, viewAsRoomRole]);

  const upsertChannel = useCallback(
    async (channel: ChatChannel) => {
      const data = {
        room_id: roomId,
        channel_id: channel.channel_id,
        label: channel.label,
        order: channel.order,
        is_archived: channel.is_archived,
        is_private: channel.is_private,
        allowed_user_ids: channel.allowed_user_ids,
      };
      const { error } = await supabase.from('channels').upsert(data, { onConflict: 'room_id,channel_id' });
      if (error) throw error;
    },
    [roomId]
  );

  const deleteChannel = useCallback(
    async (channelId: string) => {
      const channelToDelete = channelsData.find((c) => c.channel_id === channelId);
      if (channelToDelete) {
        await channelsMutation.remove(channelToDelete.id);
      }
    },
    [channelsData, channelsMutation]
  );

  return { channels, upsertChannel, deleteChannel, loading: channelsQuery.loading };
}
