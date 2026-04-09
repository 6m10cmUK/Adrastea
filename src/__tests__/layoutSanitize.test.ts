import { describe, it, expect } from 'vitest';
import { sanitizeDockviewLayoutForRole, isPanelViewAllowed } from '../services/layoutSanitize';
import { DEFAULT_LAYOUT_OWNER } from '../services/defaultLayoutOwner';

function collectViews(layout: Record<string, unknown>): string[] {
  const s = new Set<string>();
  function walk(n: unknown) {
    if (!n || typeof n !== 'object') return;
    const node = n as Record<string, unknown>;
    if (node.type === 'leaf' && node.data && typeof node.data === 'object') {
      const views = (node.data as Record<string, unknown>).views;
      if (Array.isArray(views)) {
        for (const v of views) s.add(String(v));
      }
    }
    if (node.type === 'branch' && Array.isArray(node.data)) {
      for (const c of node.data) walk(c);
    }
  }
  const grid = layout.grid as Record<string, unknown> | undefined;
  if (grid?.root) walk(grid.root);
  const fgs = layout.floatingGroups as unknown[] | undefined;
  if (Array.isArray(fgs)) {
    for (const fg of fgs) {
      if (fg && typeof fg === 'object') {
        const data = (fg as Record<string, unknown>).data as Record<string, unknown> | undefined;
        const views = data?.views;
        if (Array.isArray(views)) {
          for (const v of views) s.add(String(v));
        }
      }
    }
  }
  return [...s].sort();
}

describe('layoutSanitize', () => {
  it('owner は GM マスタのビューを落とさない', () => {
    const raw = structuredClone(DEFAULT_LAYOUT_OWNER) as unknown as Record<string, unknown>;
    const out = sanitizeDockviewLayoutForRole(raw, 'owner');
    expect(collectViews(out).sort()).toEqual(collectViews(raw).sort());
  });

  it('user は sub_owner 専用パネルを除去する', () => {
    const raw = structuredClone(DEFAULT_LAYOUT_OWNER) as unknown as Record<string, unknown>;
    const out = sanitizeDockviewLayoutForRole(raw, 'user');
    const v = collectViews(out);
    expect(v).not.toContain('scene');
    expect(v).not.toContain('bgm');
    expect(v).not.toContain('layer');
    expect(v).not.toContain('scenarioText');
    expect(v).toContain('board');
    expect(v).toContain('character');
    expect(v).toContain('status');
    expect(v).toContain('property');
    expect(v).toContain('chatLog');
  });

  it('guest は board / chatLog / status のみ', () => {
    const raw = structuredClone(DEFAULT_LAYOUT_OWNER) as unknown as Record<string, unknown>;
    const out = sanitizeDockviewLayoutForRole(raw, 'guest');
    expect(collectViews(out).sort()).toEqual(['board', 'chatLog', 'status'].sort());
  });

  it('isPanelViewAllowed: guest は board のみ許可リスト', () => {
    expect(isPanelViewAllowed('board', 'guest')).toBe(true);
    expect(isPanelViewAllowed('scene', 'guest')).toBe(false);
  });
});
