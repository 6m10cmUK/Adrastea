import type { ChatChannel } from '../types/adrastea.types';

export function isPrivateChatChannel(channel: Pick<ChatChannel, 'is_private'>): boolean {
  return Boolean(channel.is_private);
}

/**
 * チャンネルタブ・送信先として表示してよいか。
 * 公開: 全員。
 * プライベート: オーナー・サブオーナー、または allowed_user_ids に含まれる user（guest は含まれない想定）。
 */
export function canViewChatChannel(
  channel: Pick<ChatChannel, 'is_private' | 'allowed_user_ids'>,
  userId: string | undefined,
  roomRole: string
): boolean {
  if (!channel.is_private) return true;
  if (!userId) return false;
  if (roomRole === 'owner' || roomRole === 'sub_owner') return true;
  const allowed = channel.allowed_user_ids ?? [];
  return allowed.includes(userId);
}

/** 保存用: プライベート時の allowed_user_ids（user ロール作成者は必ず含める） */
export function finalizeChannelAllowedUserIds(options: {
  isPrivate: boolean;
  selectedUserMemberIds: string[];
  currentUserId: string | undefined;
  roomRole: string;
}): string[] {
  if (!options.isPrivate) return [];
  const set = new Set(options.selectedUserMemberIds);
  if (options.currentUserId && options.roomRole === 'user') {
    set.add(options.currentUserId);
  }
  return [...set];
}
