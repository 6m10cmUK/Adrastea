import { describe, it, expect } from 'vitest';
import { buildStatusChangeChatContents } from '../utils/statusChangeChat';

describe('buildStatusChangeChatContents', () => {
  it('同じラベルで value が変わったときだけ行を返す', () => {
    const prev = [
      { label: 'HP', value: 10, max: 10 },
      { label: 'MP', value: 5, max: 5 },
    ];
    const next = [
      { label: 'HP', value: 7, max: 10 },
      { label: 'MP', value: 5, max: 5 },
    ];
    expect(buildStatusChangeChatContents('太郎', prev, next)).toEqual(['[太郎] HP : 10 → 7']);
  });

  it('複数ラベルが変われば複数行', () => {
    const prev = [
      { label: 'HP', value: 10, max: 10 },
      { label: 'MP', value: 3, max: 5 },
    ];
    const next = [
      { label: 'HP', value: 9, max: 10 },
      { label: 'MP', value: 2, max: 5 },
    ];
    expect(buildStatusChangeChatContents('花子', prev, next)).toEqual([
      '[花子] HP : 10 → 9',
      '[花子] MP : 3 → 2',
    ]);
  });

  it('新規ラベルや削除のみでは行を出さない', () => {
    const prev = [{ label: 'HP', value: 10, max: 10 }];
    const next = [{ label: 'SAN', value: 50, max: 99 }];
    expect(buildStatusChangeChatContents('次郎', prev, next)).toEqual([]);
  });
});
