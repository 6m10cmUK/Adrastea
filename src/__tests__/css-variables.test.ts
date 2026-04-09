import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const cssContent = readFileSync(
  resolve(__dirname, '../styles/dockview-catppuccin.css'),
  'utf-8',
);

function extractVar(name: string): string | null {
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`);
  const match = cssContent.match(re);
  return match ? match[1].trim() : null;
}

describe('CSS変数 — Phase 1 背景5層', () => {
  it('--ad-bg-deep は #1e1e1e', () => {
    expect(extractVar('--ad-bg-deep')).toBe('#1e1e1e');
  });

  it('--ad-bg-input は #222222', () => {
    expect(extractVar('--ad-bg-input')).toBe('#222222');
  });

  it('--ad-bg-base は #282828', () => {
    expect(extractVar('--ad-bg-base')).toBe('#282828');
  });

  it('--ad-bg-surface は #313131', () => {
    expect(extractVar('--ad-bg-surface')).toBe('#313131');
  });

  it('--ad-bg-toolbar は #383838', () => {
    expect(extractVar('--ad-bg-toolbar')).toBe('#383838');
  });

  it('--ad-bg-elevated は #414141', () => {
    expect(extractVar('--ad-bg-elevated')).toBe('#414141');
  });
});

describe('CSS変数 — Phase 1 bgHover + シャドウ', () => {
  it('--ad-bg-hover は 0.12', () => {
    const val = extractVar('--ad-bg-hover');
    expect(val).toContain('0.12');
  });

  it('--ad-shadow-lg が存在する', () => {
    const val = extractVar('--ad-shadow-lg');
    expect(val).toBeTruthy();
    expect(val).toContain('24px');
  });
});

describe('CSS変数 — Phase 7 danger', () => {
  it('--ad-danger-bg-subtle が存在する', () => {
    const val = extractVar('--ad-danger-bg-subtle');
    expect(val).toBeTruthy();
    expect(val).toContain('rgba');
  });
});

describe('CSS変数 — レイヤー間の差が適切', () => {
  it('背景色が暗→明の順序（深度順）', () => {
    const colors = [
      { name: 'bgDeep', hex: extractVar('--ad-bg-deep')! },
      { name: 'bgInput', hex: extractVar('--ad-bg-input')! },
      { name: 'bgBase', hex: extractVar('--ad-bg-base')! },
      { name: 'bgSurface', hex: extractVar('--ad-bg-surface')! },
      { name: 'bgToolbar', hex: extractVar('--ad-bg-toolbar')! },
      { name: 'bgElevated', hex: extractVar('--ad-bg-elevated')! },
    ];

    for (let i = 0; i < colors.length - 1; i++) {
      const current = parseInt(colors[i].hex.replace('#', ''), 16);
      const next = parseInt(colors[i + 1].hex.replace('#', ''), 16);
      expect(next).toBeGreaterThan(current);
    }
  });
});

describe('CSS変数 — Phase 3 テキストコントラスト', () => {
  it('--ad-text-primary は #e8e8e8', () => {
    expect(extractVar('--ad-text-primary')).toBe('#e8e8e8');
  });

  it('--ad-text-secondary は #a0a0a0', () => {
    expect(extractVar('--ad-text-secondary')).toBe('#a0a0a0');
  });

  it('--ad-text-muted は #888888', () => {
    expect(extractVar('--ad-text-muted')).toBe('#888888');
  });
});

describe('CSS変数 — Phase 4 ボーダー', () => {
  it('--ad-border は #444444', () => {
    expect(extractVar('--ad-border')).toBe('#444444');
  });

  it('--ad-border-input は #505050', () => {
    expect(extractVar('--ad-border-input')).toBe('#505050');
  });

  it('--ad-border-subtle は rgba で定義されている', () => {
    const val = extractVar('--ad-border-subtle');
    expect(val).toContain('rgba');
  });
});
