import type { RoomRole } from '../contexts/AdrasteaContext';
import { checkPermission, type PermissionKey } from '../config/permissions';
import { DEFAULT_LAYOUT_GUEST } from './layoutStorage';

/** Dockview の views に出る ID → panel_* 権限 */
const VIEW_TO_PERMISSION: Record<string, PermissionKey> = {
  scene: 'panel_scene',
  character: 'panel_character',
  scenarioText: 'panel_scenarioText',
  chatLog: 'panel_chat',
  chatPalette: 'panel_chat',
  chatInput: 'panel_chat',
  board: 'panel_board',
  pdfViewer: 'panel_pdfViewer',
  status: 'panel_status',
  bgm: 'panel_bgm',
  cutin: 'panel_cutin',
  layer: 'panel_layer',
  property: 'panel_property',
  debugConsole: 'panel_debug',
  timeline: 'panel_timeline',
};

/** guest は DEFAULT_LAYOUT_GUEST に合わせたホワイトリスト（permissions 上は user 未満でも表示する） */
const GUEST_ALLOWED_VIEWS = new Set(['board', 'chatLog', 'status']);

export function isPanelViewAllowed(viewId: string, role: RoomRole): boolean {
  if (role === 'guest') return GUEST_ALLOWED_VIEWS.has(viewId);
  const perm = VIEW_TO_PERMISSION[viewId];
  if (!perm) return false;
  return checkPermission(role, perm);
}

function filterLeafViews(data: Record<string, unknown>, role: RoomRole): Record<string, unknown> | null {
  const views = Array.isArray(data.views) ? (data.views as string[]) : [];
  const allowed = views.filter((v) => isPanelViewAllowed(v, role));
  if (allowed.length === 0) return null;
  const activeView = typeof data.activeView === 'string' && allowed.includes(data.activeView)
    ? data.activeView
    : allowed[0];
  return { ...data, views: allowed, activeView };
}

/** 単子ブランチを子へ畳む（親から見た size は子が継承） */
function collapseSingleChildBranches(node: unknown): unknown {
  let n = node as Record<string, unknown> | null;
  while (
    n &&
    n.type === 'branch' &&
    Array.isArray(n.data) &&
    (n.data as unknown[]).length === 1
  ) {
    const inner = (n.data as unknown[])[0] as Record<string, unknown>;
    n = { ...inner, size: n.size };
  }
  return n;
}

function normalizeBranchSizes(children: Array<Record<string, unknown>>, removedSize: number): void {
  if (children.length === 0) return;
  const boardIdx = children.findIndex(
    (c) => c.type === 'leaf' && Array.isArray((c.data as Record<string, unknown>)?.views) &&
      ((c.data as Record<string, unknown>).views as string[]).includes('board')
  );
  if (boardIdx >= 0 && removedSize > 0) {
    const b = children[boardIdx];
    const cur = typeof b.size === 'number' ? b.size : 0;
    b.size = cur + removedSize;
  }
  const sum = children.reduce((s, c) => s + (typeof c.size === 'number' ? c.size : 0), 0);
  if (sum <= 0) return;
  for (const c of children) {
    c.size = (typeof c.size === 'number' ? c.size : 0) / sum;
  }
}

function sanitizeGridNode(node: unknown, role: RoomRole): unknown | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;

  if (n.type === 'leaf') {
    const data = n.data as Record<string, unknown> | undefined;
    if (!data) return null;
    const nextData = filterLeafViews(data, role);
    if (!nextData) return null;
    return { ...n, data: nextData };
  }

  if (n.type === 'branch') {
    const raw = Array.isArray(n.data) ? (n.data as unknown[]) : [];
    let removedSize = 0;
    const kept: Array<Record<string, unknown>> = [];
    for (const child of raw) {
      const sz = typeof (child as Record<string, unknown>).size === 'number'
        ? ((child as Record<string, unknown>).size as number)
        : 0;
      const sanitized = sanitizeGridNode(child, role);
      if (sanitized == null) {
        removedSize += sz;
      } else {
        kept.push(sanitized as Record<string, unknown>);
      }
    }
    if (kept.length === 0) return null;
    normalizeBranchSizes(kept, removedSize);
    const branch = { ...n, data: kept };
    return collapseSingleChildBranches(branch);
  }

  return null;
}

function sanitizeFloatingGroups(
  groups: unknown[] | undefined,
  role: RoomRole
): unknown[] {
  if (!Array.isArray(groups)) return [];
  const out: unknown[] = [];
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    const fg = g as Record<string, unknown>;
    const data = fg.data as Record<string, unknown> | undefined;
    if (!data) continue;
    const nextData = filterLeafViews(data, role);
    if (!nextData) continue;
    out.push({ ...fg, data: nextData });
  }
  return out;
}

function collectGroupIdsFromNode(node: unknown, into: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'leaf' && n.data && typeof n.data === 'object') {
    const id = (n.data as Record<string, unknown>).id;
    if (id != null) into.add(String(id));
  }
  if (n.type === 'branch' && Array.isArray(n.data)) {
    for (const c of n.data) collectGroupIdsFromNode(c, into);
  }
}

function collectReferencedPanelIds(node: unknown, into: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'leaf' && n.data && typeof n.data === 'object') {
    const views = (n.data as Record<string, unknown>).views;
    if (Array.isArray(views)) {
      for (const v of views) into.add(String(v));
    }
  }
  if (n.type === 'branch' && Array.isArray(n.data)) {
    for (const c of n.data) collectReferencedPanelIds(c, into);
  }
}

function collectFromFloatingForPanels(groups: unknown[] | undefined, into: Set<string>): void {
  if (!Array.isArray(groups)) return;
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    const data = (g as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const views = data?.views;
    if (Array.isArray(views)) {
      for (const v of views) into.add(String(v));
    }
  }
}

function fixActiveGroup(layout: Record<string, unknown>, groupIds: Set<string>): void {
  const cur = layout.activeGroup;
  if (cur != null && groupIds.has(String(cur))) return;
  let boardGroupId: string | null = null;
  function findBoardGroup(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'leaf' && n.data && typeof n.data === 'object') {
      const d = n.data as Record<string, unknown>;
      const views = d.views as string[] | undefined;
      const id = d.id;
      if (Array.isArray(views) && views.includes('board') && id != null) {
        boardGroupId = String(id);
      }
    }
    if (n.type === 'branch' && Array.isArray(n.data)) {
      for (const c of n.data) findBoardGroup(c);
    }
  }
  findBoardGroup(layout.grid);
  if (boardGroupId) {
    layout.activeGroup = boardGroupId;
    return;
  }
  const first = groupIds.values().next().value;
  if (first) layout.activeGroup = first;
}

function minimalFallbackLayout(role: RoomRole): Record<string, unknown> {
  if (role === 'guest') {
    return structuredClone(DEFAULT_LAYOUT_GUEST) as unknown as Record<string, unknown>;
  }
  return {
    grid: {
      root: {
        type: 'leaf',
        data: { views: ['board'], activeView: 'board', id: '5' },
        size: 1,
      },
      width: 1,
      height: 1,
      orientation: 'HORIZONTAL',
    },
    panels: {
      board: { id: 'board', contentComponent: 'board', tabComponent: 'boardTab', title: 'Board' },
    },
    activeGroup: '5',
    floatingGroups: [],
  };
}

/**
 * Dockview api.toJSON() 互換オブジェクトを、role で表示できないパネルを除いた形にする。
 * 空いた列幅は同一ブランチ内に board があればそちらへ加算し、size を正規化する。
 */
export function sanitizeDockviewLayoutForRole(layout: object, role: RoomRole): Record<string, unknown> {
  const clone = structuredClone(layout) as Record<string, unknown>;
  const grid = clone.grid as Record<string, unknown> | undefined;
  if (!grid?.root) {
    return minimalFallbackLayout(role);
  }

  const newRoot = sanitizeGridNode(grid.root, role);
  if (newRoot == null) {
    return minimalFallbackLayout(role);
  }
  grid.root = collapseSingleChildBranches(newRoot) as Record<string, unknown>;

  clone.floatingGroups = sanitizeFloatingGroups(clone.floatingGroups as unknown[] | undefined, role);

  const referenced = new Set<string>();
  collectReferencedPanelIds(grid.root, referenced);
  collectFromFloatingForPanels(clone.floatingGroups as unknown[], referenced);

  const panels = clone.panels as Record<string, unknown> | undefined;
  if (panels && typeof panels === 'object') {
    const nextPanels: Record<string, unknown> = {};
    for (const id of referenced) {
      if (panels[id]) nextPanels[id] = panels[id];
    }
    clone.panels = nextPanels;
  }

  const groupIds = new Set<string>();
  collectGroupIdsFromNode(grid.root, groupIds);
  if (Array.isArray(clone.floatingGroups)) {
    for (const fg of clone.floatingGroups) {
      if (fg && typeof fg === 'object') {
        const data = (fg as Record<string, unknown>).data as Record<string, unknown> | undefined;
        const id = data?.id;
        if (id != null) groupIds.add(String(id));
      }
    }
  }
  fixActiveGroup(clone, groupIds);

  return clone;
}
