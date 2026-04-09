import { describe, it, expect } from 'vitest';
import { mergeBgmSubsetOrderIntoFull } from '../hooks/useBgms';

describe('mergeBgmSubsetOrderIntoFull', () => {
  it('サブセットを先頭ブロックとして並べ替え、前後の非サブセットを保持する', () => {
    expect(mergeBgmSubsetOrderIntoFull(['A', 'B', 'C'], ['B', 'A'])).toEqual(['B', 'A', 'C']);
  });

  it('非連続なサブセットを一塊として新順序に差し替える', () => {
    expect(mergeBgmSubsetOrderIntoFull(['A', 'B', 'C', 'D'], ['D', 'B'])).toEqual(['A', 'D', 'B', 'C']);
  });

  it('フルに存在しないサブセット ID は末尾に付与するフォールバック', () => {
    expect(mergeBgmSubsetOrderIntoFull(['A', 'B'], ['X', 'B', 'A'])).toEqual(['X', 'B', 'A']);
  });

  it('空サブセットはフルをそのまま返す', () => {
    expect(mergeBgmSubsetOrderIntoFull(['A', 'B'], [])).toEqual(['A', 'B']);
  });
});
