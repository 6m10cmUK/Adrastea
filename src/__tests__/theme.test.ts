import { describe, it, expect } from 'vitest';
import { theme } from '../styles/theme';

describe('theme tokens — Phase 1 (5層背景)', () => {
  it('bgDeep トークンが存在する', () => {
    expect(theme.bgDeep).toBe('var(--ad-bg-deep)');
  });

  it('bgElevated トークンが存在する', () => {
    expect(theme.bgElevated).toBe('var(--ad-bg-elevated)');
  });

  it('shadowLg トークンが存在する', () => {
    expect(theme.shadowLg).toBe('var(--ad-shadow-lg)');
  });

  it('dangerBgSubtle トークンが存在する', () => {
    expect(theme.dangerBgSubtle).toBe('var(--ad-danger-bg-subtle)');
  });

  it('全背景トークンが正しいCSS変数を参照している', () => {
    expect(theme.bgDeep).toBe('var(--ad-bg-deep)');
    expect(theme.bgInput).toBe('var(--ad-bg-input)');
    expect(theme.bgBase).toBe('var(--ad-bg-base)');
    expect(theme.bgSurface).toBe('var(--ad-bg-surface)');
    expect(theme.bgToolbar).toBe('var(--ad-bg-toolbar)');
    expect(theme.bgElevated).toBe('var(--ad-bg-elevated)');
  });
});

describe('theme tokens — Phase 7 (ボタン階層)', () => {
  it('bgHover トークンが存在する', () => {
    expect(theme.bgHover).toBe('var(--ad-bg-hover)');
  });
});
