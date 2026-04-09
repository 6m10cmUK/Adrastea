import { describe, expect, it } from 'vitest';
import { rowIdKey, sameRowId } from '../utils/supabaseRealtimeRowId';

describe('supabaseRealtimeRowId', () => {
  it('sameRowId は bigint と string の同一値を同一行とみなす', () => {
    expect(sameRowId(42n, '42')).toBe(true);
    expect(sameRowId(42, '42')).toBe(true);
    expect(sameRowId('42', 42)).toBe(true);
  });

  it('異なる id は false', () => {
    expect(sameRowId(1, 2)).toBe(false);
    expect(sameRowId('a', 'b')).toBe(false);
  });

  it('rowIdKey は null/undefined を空文字にする', () => {
    expect(rowIdKey(null)).toBe('');
    expect(rowIdKey(undefined)).toBe('');
    expect(sameRowId(null, null)).toBe(false);
  });
});
