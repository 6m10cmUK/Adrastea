import { describe, it, expect } from 'vitest';
import {
  canViewChatChannel,
  finalizeChannelAllowedUserIds,
  isPrivateChatChannel,
} from '../utils/chatChannelVisibility';

describe('isPrivateChatChannel', () => {
  it('is_private が false なら公開', () => {
    expect(isPrivateChatChannel({ is_private: false })).toBe(false);
  });
  it('is_private が true ならプライベート', () => {
    expect(isPrivateChatChannel({ is_private: true })).toBe(true);
  });
});

describe('canViewChatChannel', () => {
  const pub = { is_private: false, allowed_user_ids: [] as string[] };
  const priv = { is_private: true, allowed_user_ids: ['u1', 'u2'] };

  it('公開は誰でも', () => {
    expect(canViewChatChannel(pub, 'guest-1', 'guest')).toBe(true);
  });
  it('プライベートは guest で不可', () => {
    expect(canViewChatChannel(priv, 'guest-1', 'guest')).toBe(false);
  });
  it('プライベートは user でリスト内のみ', () => {
    expect(canViewChatChannel(priv, 'u1', 'user')).toBe(true);
    expect(canViewChatChannel(priv, 'u9', 'user')).toBe(false);
  });
  it('プライベートは sub_owner / owner は常に可', () => {
    expect(canViewChatChannel(priv, 'any', 'sub_owner')).toBe(true);
    expect(canViewChatChannel(priv, 'any', 'owner')).toBe(true);
  });
  it('スタッフのみプライベート（allowed 空）でも user は不可', () => {
    const staffOnly = { is_private: true, allowed_user_ids: [] as string[] };
    expect(canViewChatChannel(staffOnly, 'u1', 'user')).toBe(false);
    expect(canViewChatChannel(staffOnly, 'any', 'sub_owner')).toBe(true);
  });
});

describe('finalizeChannelAllowedUserIds', () => {
  it('公開なら空配列', () => {
    expect(
      finalizeChannelAllowedUserIds({
        isPrivate: false,
        selectedUserMemberIds: ['a'],
        currentUserId: 'me',
        roomRole: 'user',
      })
    ).toEqual([]);
  });
  it('user ロールは自分を必ず含める', () => {
    expect(
      finalizeChannelAllowedUserIds({
        isPrivate: true,
        selectedUserMemberIds: [],
        currentUserId: 'me',
        roomRole: 'user',
      })
    ).toEqual(['me']);
  });
  it('sub_owner は自分を自動追加しない', () => {
    expect(
      finalizeChannelAllowedUserIds({
        isPrivate: true,
        selectedUserMemberIds: ['u1'],
        currentUserId: 'so',
        roomRole: 'sub_owner',
      })
    ).toEqual(['u1']);
  });
});
