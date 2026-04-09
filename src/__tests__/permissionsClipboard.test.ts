import { describe, it, expect } from 'vitest';
import { canClipboardCopyCharacters } from '../config/permissions';

describe('canClipboardCopyCharacters', () => {
  const mine = { owner_id: 'u1' };
  const theirs = { owner_id: 'u2' };

  it('sub_owner 以上は他人キャラもコピー可', () => {
    expect(canClipboardCopyCharacters('owner', [theirs], 'u1')).toBe(true);
    expect(canClipboardCopyCharacters('sub_owner', [theirs], 'u1')).toBe(true);
  });

  it('user は本人キャラのみコピー可', () => {
    expect(canClipboardCopyCharacters('user', [mine], 'u1')).toBe(true);
    expect(canClipboardCopyCharacters('user', [theirs], 'u1')).toBe(false);
    expect(canClipboardCopyCharacters('user', [mine, theirs], 'u1')).toBe(false);
  });

  it('未ログイン相当（uid 空）は user で不可', () => {
    expect(canClipboardCopyCharacters('user', [mine], '')).toBe(false);
  });

  it('空選択は不可', () => {
    expect(canClipboardCopyCharacters('user', [], 'u1')).toBe(false);
  });
});
