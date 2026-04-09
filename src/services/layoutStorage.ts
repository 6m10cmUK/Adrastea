import { generateUUID } from '../utils/uuid';
import { DEFAULT_LAYOUT_OWNER } from './defaultLayoutOwner';

// localStorage キー
const STORE_KEY = 'adrastea-layouts';
const LEGACY_OWNER_KEY = 'adrastea-dock-layout-owner';
const LEGACY_USER_KEY = 'adrastea-dock-layout-user';

// 型定義
export interface SavedLayout {
  id: string;
  name: string;
  layout: object; // Dockview の api.toJSON() の結果
  /** ステータスパネル全体を盤面にオーバーレイするか */
  statusPanelOnBoard?: boolean;
  /** @deprecated 旧形式（ステータス個別トグル）。読み込み時のみマイグレーションに使用 */
  statusOverlayVisibility?: Record<string, boolean>;
}

/** レイアウト JSON から盤面オーバーフラグを復元（旧 Record 形式はいずれか true なら ON） */
export function migrateStatusPanelBoardOverlay(
  saved: {
    statusPanelOnBoard?: boolean;
    statusOverlayVisibility?: Record<string, boolean>;
  } | null
): boolean {
  if (!saved) return false;
  if (saved.statusPanelOnBoard !== undefined) return !!saved.statusPanelOnBoard;
  const vis = saved.statusOverlayVisibility;
  if (!vis) return false;
  return Object.values(vis).some(Boolean);
}

/** 2: gmDefault/plDefault および内蔵 GM/PL プリセット条項を廃止 */
const LAYOUT_STORE_VERSION = 2;

export interface LayoutStore {
  version: number;
  layouts: SavedLayout[];
}

function cloneSavedLayoutEntry(raw: unknown): SavedLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !o.layout || typeof o.layout !== 'object') {
    return null;
  }
  const entry: SavedLayout = {
    id: o.id,
    name: o.name,
    layout: structuredClone(o.layout),
  };
  if (typeof o.statusPanelOnBoard === 'boolean') entry.statusPanelOnBoard = o.statusPanelOnBoard;
  if (o.statusOverlayVisibility && typeof o.statusOverlayVisibility === 'object') {
    entry.statusOverlayVisibility = o.statusOverlayVisibility as Record<string, boolean>;
  }
  return entry;
}

/** 旧ストアを正規化（タグ・内蔵デフォルト名の条項を除去） */
function normalizeLayoutStore(raw: unknown): LayoutStore {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const layoutsRaw = Array.isArray(obj.layouts) ? obj.layouts : [];
  const layouts: SavedLayout[] = [];
  for (const item of layoutsRaw) {
    const cl = cloneSavedLayoutEntry(item);
    if (!cl) continue;
    if (cl.name === 'GMデフォルト' || cl.name === 'PLデフォルト') continue;
    layouts.push(cl);
  }
  return { version: LAYOUT_STORE_VERSION, layouts };
}

function isLegacyLayoutStoreBlob(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true;
  const o = raw as Record<string, unknown>;
  if ('gmDefault' in o || 'plDefault' in o) return true;
  if (o.version !== LAYOUT_STORE_VERSION) return true;
  const layouts = o.layouts;
  if (!Array.isArray(layouts)) return true;
  return layouts.some(
    (l: unknown) =>
      l &&
      typeof l === 'object' &&
      ((l as { name?: string }).name === 'GMデフォルト' ||
        (l as { name?: string }).name === 'PLデフォルト')
  );
}

// 初期値を生成する関数
function createInitialStore(): LayoutStore {
  return {
    version: LAYOUT_STORE_VERSION,
    layouts: [],
  };
}

// モジュールレベルキャッシュ
let store: LayoutStore | null = null;

/**
 * ストア全体のロード。なければ初期値を返す。
 * 初回実行時に旧形式マイグレーションを実行。
 */
export function loadStore(): LayoutStore {
  if (store !== null) {
    return store;
  }

  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isLegacyLayoutStoreBlob(parsed)) {
        store = normalizeLayoutStore(parsed);
        persistStore(store);
      } else {
        store = parsed as LayoutStore;
      }
      return store;
    }

    // 新しいストアが存在しない → 旧形式をマイグレーション
    store = migrateFromLegacy();
    return store;
  } catch (error) {
    console.error('Failed to load layout store:', error);
    store = createInitialStore();
    return store;
  }
}

/**
 * 旧形式（adrastea-dock-layout-owner, adrastea-dock-layout-user）から新形式へマイグレーション
 */
function migrateFromLegacy(): LayoutStore {
  const newStore = createInitialStore();

  try {
    // owner のマイグレーション
    const legacyOwner = localStorage.getItem(LEGACY_OWNER_KEY);
    if (legacyOwner) {
      const parsed = JSON.parse(legacyOwner) as { _version?: number; layout?: object };
      if (parsed._version === 3 && parsed.layout) {
        const ownerLayout: SavedLayout = {
          id: generateUUID(),
          name: '(自動保存)',
          layout: parsed.layout,
        };
        newStore.layouts.push(ownerLayout);
      }
    }
  } catch (error) {
    console.warn('Failed to migrate legacy owner layout:', error);
  }

  try {
    // user のマイグレーション
    const legacyUser = localStorage.getItem(LEGACY_USER_KEY);
    if (legacyUser) {
      const parsed = JSON.parse(legacyUser) as { _version?: number; layout?: object };
      if (parsed._version === 3 && parsed.layout) {
        const userLayout: SavedLayout = {
          id: generateUUID(),
          name: '(自動保存)',
          layout: parsed.layout,
        };
        newStore.layouts.push(userLayout);
      }
    }
  } catch (error) {
    console.warn('Failed to migrate legacy user layout:', error);
  }

  return newStore;
}

/**
 * ストアを localStorage に保存（内部用だが export）
 */
export function persistStore(storeData: LayoutStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(storeData));
    store = storeData;
  } catch (error) {
    console.error('Failed to persist layout store:', error);
  }
}

/**
 * レイアウト一覧取得
 */
export function getSavedLayouts(): SavedLayout[] {
  const currentStore = loadStore();
  return currentStore.layouts.map((layout) => structuredClone(layout));
}

/**
 * レイアウト保存（新規追加）。id は generateUUID() で生成。返り値は id
 */
export function addLayout(
  name: string,
  layout: object,
  statusPanelOnBoard?: boolean
): string {
  const currentStore = loadStore();
  const id = generateUUID();
  const newLayout: SavedLayout = {
    id,
    name,
    layout: structuredClone(layout),
    ...(statusPanelOnBoard !== undefined ? { statusPanelOnBoard } : {}),
  };
  currentStore.layouts.push(newLayout);
  persistStore(currentStore);
  return id;
}

/**
 * 既存条項を現在の Dockview JSON（とオーバ状態）で上書きする
 */
export function updateLayout(
  id: string,
  layout: object,
  statusPanelOnBoard?: boolean
): boolean {
  const currentStore = loadStore();
  const entry = currentStore.layouts.find((l) => l.id === id);
  if (!entry) return false;
  entry.layout = structuredClone(layout);
  if (statusPanelOnBoard !== undefined) {
    entry.statusPanelOnBoard = statusPanelOnBoard;
    delete entry.statusOverlayVisibility;
  }
  persistStore(currentStore);
  return true;
}

/**
 * レイアウト削除
 */
export function deleteLayout(id: string): void {
  const currentStore = loadStore();
  currentStore.layouts = currentStore.layouts.filter((layout) => layout.id !== id);
  persistStore(currentStore);
}

/**
 * レイアウトの grid サイズを現在の画面サイズにスケーリングする。
 * デフォルトレイアウトは特定の画面サイズ (1858x933) でエクスポートされているため、
 * 異なる画面サイズで復元する際にスケーリングが必要。
 */
export function scaleLayout(layout: object, targetWidth: number, targetHeight: number): object {
  const scaled = structuredClone(layout) as Record<string, any>;
  const grid = scaled.grid;
  if (!grid?.root || !grid.width || !grid.height) return scaled;

  const wRatio = targetWidth / grid.width;
  const hRatio = targetHeight / grid.height;

  const isHorizontal = grid.orientation === 'HORIZONTAL';

  function scaleNode(node: any, horizontal: boolean) {
    if (node.size != null) {
      node.size = Math.round(node.size * (horizontal ? wRatio : hRatio));
    }
    if (node.type === 'branch' && Array.isArray(node.data)) {
      node.data.forEach((child: any) => scaleNode(child, !horizontal));
    }
  }

  // root.size は orientation の逆方向
  if (grid.root.size != null) {
    grid.root.size = Math.round(grid.root.size * (isHorizontal ? hRatio : wRatio));
  }
  // root の子は orientation 方向
  if (Array.isArray(grid.root.data)) {
    grid.root.data.forEach((child: any) => scaleNode(child, isHorizontal));
  }

  grid.width = targetWidth;
  grid.height = targetHeight;

  // floatingGroups の position もスケーリング
  if (Array.isArray(scaled.floatingGroups)) {
    for (const fg of scaled.floatingGroups) {
      if (fg.position) {
        fg.position.top = Math.round(fg.position.top * hRatio);
        fg.position.left = Math.round(fg.position.left * wRatio);
        fg.position.width = Math.round(fg.position.width * wRatio);
        fg.position.height = Math.round(fg.position.height * hRatio);
      }
    }
  }

  return scaled;
}

export { DEFAULT_LAYOUT_OWNER };

export const DEFAULT_LAYOUT_GUEST = {"grid":{"root":{"type":"branch","data":[{"type":"leaf","data":{"views":["board"],"activeView":"board","id":"5"},"size":0.8094},{"type":"leaf","data":{"views":["chatLog"],"activeView":"chatLog","id":"2"},"size":0.1906}],"size":1},"width":1,"height":1,"orientation":"HORIZONTAL"},"panels":{"board":{"id":"board","contentComponent":"board","tabComponent":"boardTab","title":"Board"},"chatLog":{"id":"chatLog","contentComponent":"chatLog","title":"チャットログ"},"status":{"id":"status","contentComponent":"status","title":"ステータス"}},"activeGroup":"2","floatingGroups":[{"data":{"views":["status"],"activeView":"status","id":"4"},"position":{"top":0.0386,"left":0.0027,"width":0.1329,"height":0.3742}}]};
