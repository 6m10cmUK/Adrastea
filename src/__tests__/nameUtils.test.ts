import { describe, it, expect } from 'vitest';
import { generateDuplicateName } from '../utils/nameUtils';

describe('generateDuplicateName', () => {
  it('末尾に (n) がない場合は (2) を付加', () => {
    expect(generateDuplicateName('マップA')).toBe('マップA(2)');
  });

  it('末尾が (2) の場合は (3) にインクリメント', () => {
    expect(generateDuplicateName('マップA(2)')).toBe('マップA(3)');
  });

  it('末尾が (5) の場合は (6) にインクリメント', () => {
    expect(generateDuplicateName('マップA(5)')).toBe('マップA(6)');
  });

  it('末尾が (99) の場合は (100) にインクリメント', () => {
    expect(generateDuplicateName('テスト(99)')).toBe('テスト(100)');
  });

  it('空文字列の場合は (2) を付加', () => {
    expect(generateDuplicateName('')).toBe('(2)');
  });

  it('括弧を含むが末尾でない場合は (2) を付加', () => {
    expect(generateDuplicateName('マップ(A)テスト')).toBe('マップ(A)テスト(2)');
  });

  it('数字なしの括弧の場合は (2) を付加', () => {
    expect(generateDuplicateName('マップ(abc)')).toBe('マップ(abc)(2)');
  });

  it('日本語名でも正しく動作', () => {
    expect(generateDuplicateName('新しいシーン')).toBe('新しいシーン(2)');
    expect(generateDuplicateName('新しいシーン(2)')).toBe('新しいシーン(3)');
  });

  // existingNames あり
  it('existingNames に同名がなければそのまま返す', () => {
    expect(generateDuplicateName('マップA', ['マップB', 'マップC'])).toBe('マップA');
  });

  it('existingNames に同名があれば (2) を付ける', () => {
    expect(generateDuplicateName('マップA', ['マップA'])).toBe('マップA(2)');
  });

  it('existingNames に (2) まであれば (3) を返す', () => {
    expect(generateDuplicateName('マップA', ['マップA', 'マップA(2)'])).toBe('マップA(3)');
  });

  it('existingNames で元が (2) 形式でも空き番号を探す', () => {
    expect(generateDuplicateName('マップA(2)', ['マップA', 'マップA(2)', 'マップA(3)'])).toBe('マップA(4)');
  });

  it('existingNames が空配列なら同名なしと同じ', () => {
    expect(generateDuplicateName('マップA', [])).toBe('マップA');
  });
});
