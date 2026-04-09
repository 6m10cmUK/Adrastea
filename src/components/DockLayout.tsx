import React, { useCallback, useMemo, useEffect, useRef, memo } from 'react';
import {
  DockviewReact,
  DockviewDefaultTab,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type DockviewTheme,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import '../styles/dockview-catppuccin.css';
import { PictureInPicture2, Minus, Maximize2, ArrowDownToLine } from 'lucide-react';
import { theme } from '../styles/theme';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { Tooltip } from './ui';
import { usePermission } from '../hooks/usePermission';
import { panelComponents } from './dock-panels/sharedComponents';
import { BgmEngine } from './BgmEngine';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ZoomBar } from './ZoomBar';
import { fixGroupWidth, relaxGroupWidth, fixAllNonBoardWidths } from './dock-panels/dockColumnState';
import type { RoomRole } from '../contexts/AdrasteaContext';
import {
  scaleLayout,
  DEFAULT_LAYOUT_OWNER,
  DEFAULT_LAYOUT_GUEST,
  migrateStatusPanelBoardOverlay,
} from '../services/layoutStorage';
import { sanitizeDockviewLayoutForRole } from '../services/layoutSanitize';

/* ── レイアウト保存/復元 ── */

const catppuccinTheme: DockviewTheme = {
  name: 'catppuccin',
  className: 'dockview-theme-catppuccin',
};

const LAYOUT_VERSION = 3;

/** owner / sub_owner は同一セッション（GM 側キー）を共有 */
function sessionLayoutSuffix(role: string): string {
  if (role === 'owner' || role === 'sub_owner') return 'gm';
  if (role === 'user') return 'user';
  return 'guest';
}

function layoutKey(role: string): string {
  return `adrastea-dock-layout-${sessionLayoutSuffix(role)}`;
}

const LEGACY_GM_SESSION_KEYS = [
  'adrastea-dock-layout-owner',
  'adrastea-dock-layout-sub_owner',
] as const;

interface LayoutWrapper {
  _version: number;
  layout: object;
  statusPanelOnBoard?: boolean;
  /** @deprecated 読み込みマイグレーション用 */
  statusOverlayVisibility?: Record<string, boolean>;
}

/* ── Board 専用タブ（閉じるボタンなし） ── */

const BoardTab: React.FunctionComponent<IDockviewPanelHeaderProps> = (props) => {
  return <DockviewDefaultTab {...props} hideClose />;
};

/** 直近のセッション状態のみ保存。保存済みプリセット（layoutStorage の一覧）は触らない */
function saveLayout(api: DockviewApi, role: string, statusPanelOnBoard: boolean) {
  try {
    const layoutJson = api.toJSON();
    const wrapper: LayoutWrapper = {
      _version: LAYOUT_VERSION,
      layout: layoutJson,
      statusPanelOnBoard,
    };

    localStorage.setItem(layoutKey(role), JSON.stringify(wrapper));
  } catch { /* ignore */ }
}

function parseSessionWrapper(raw: string): LayoutWrapper | null {
  try {
    const wrapper = JSON.parse(raw) as LayoutWrapper;
    if (wrapper._version === LAYOUT_VERSION) return wrapper;
  } catch { /* ignore */ }
  return null;
}

function loadLayout(role: string): LayoutWrapper | null {
  const primary = layoutKey(role);
  const primaryRaw = localStorage.getItem(primary);
  if (primaryRaw) {
    const w = parseSessionWrapper(primaryRaw);
    if (w) return w;
  }

  if (role === 'owner' || role === 'sub_owner') {
    for (const legacyKey of LEGACY_GM_SESSION_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      const w = parseSessionWrapper(raw);
      if (w) return w;
    }
  }

  return null;
}


/* ── タブヘッダー左側アクション（ドラッグハンドル） ── */

function PrefixHeaderActions({ group }: IDockviewHeaderActionsProps) {
  const isFloating = group.api.location.type === 'floating';
  if (!isFloating) return null;

  return (
    <div
      style={{
        cursor: 'grab',
        padding: '0 4px',
        display: 'flex',
        alignItems: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        userSelect: 'none',
        height: '100%',
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();

        // フロートパネルのコンテナ要素（.dv-resize-container）を取得
        const container = (e.currentTarget as HTMLElement).closest('.dv-resize-container') as HTMLElement | null;
        if (!container) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = container.offsetLeft;
        const startTop = container.offsetTop;

        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';

        const onPointerMove = (moveE: PointerEvent) => {
          const dx = moveE.clientX - startX;
          const dy = moveE.clientY - startY;
          container.style.left = `${startLeft + dx}px`;
          container.style.top = `${startTop + dy}px`;
        };

        const onPointerUp = () => {
          document.body.style.cursor = '';
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
      }}
    >
      ⠿
    </div>
  );
}

/* ── タブヘッダー右側アクション ── */

const iconBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  color: theme.textSecondary,
  cursor: 'pointer',
  padding: 0,
};

// 最小化状態の管理（グループID → 元の高さ）
const minimizedGroups = new Map<string, number>();
const TAB_BAR_HEIGHT = 35;

function RightHeaderActions({ containerApi, group }: IDockviewHeaderActionsProps) {
  const { boardRef } = useAdrasteaContext();
  const [isMinimized, setIsMinimized] = React.useState(() => minimizedGroups.has(group.id));

  const activePanel = group.activePanel;
  const hasBoardPanel = group.panels.some((p) => p.id === 'board');
  const isFloating = group.api.location.type === 'floating';

  // フローティング時に親コンテナに半透明クラスを付与
  useEffect(() => {
    const el = (group.header as any)?.element?.closest('.dv-resize-container') as HTMLElement | null;
    if (!el) return;
    if (isFloating) {
      el.classList.add('dv-floating-translucent');
    } else {
      el.classList.remove('dv-floating-translucent');
    }
  }, [isFloating, (group.header as any)?.element]);

  // フロート/ドック時に幅制約を管理
  useEffect(() => {
    const disposable = group.api.onDidLocationChange((event) => {
      if (event.location.type !== 'floating') {
        // ドックに戻った → 幅を現在値で固定
        requestAnimationFrame(() => {
          if (!group.panels.some((p) => p.id === 'board')) {
            fixGroupWidth(group);
          }
        });
      } else {
        // フロートになった → 制約解除
        relaxGroupWidth(group);
      }
    });
    return () => disposable.dispose();
  }, [group]);

  const handleMinimize = useCallback(() => {
    const container = (group.header as any)?.element?.closest('.dv-resize-container') as HTMLElement | null;
    if (!container) return;
    minimizedGroups.set(group.id, container.offsetHeight);
    container.style.height = `${TAB_BAR_HEIGHT}px`;
    container.style.minHeight = `${TAB_BAR_HEIGHT}px`;
    container.style.overflow = 'hidden';
    setIsMinimized(true);
  }, [group]);

  const handleRestore = useCallback(() => {
    const savedHeight = minimizedGroups.get(group.id);
    const container = (group.header as any)?.element?.closest('.dv-resize-container') as HTMLElement | null;
    minimizedGroups.delete(group.id);
    if (container && savedHeight) {
      container.style.height = `${savedHeight}px`;
      container.style.minHeight = '';
      container.style.overflow = '';
    }
    setIsMinimized(false);
  }, [group]);

  if (!activePanel) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%', paddingRight: 4 }}>
      {/* board がアクティブなら ZoomBar */}
      {hasBoardPanel && activePanel.id === 'board' && (
        <ZoomBar boardRef={boardRef} />
      )}

      {/* フローティング時: ドックに戻す / 最小化/復元 */}
      {isFloating && (
        <>
          <Tooltip label="ドックに戻す">
            <button
              type="button"
              className="adra-btn adra-btn--ghost"
              onClick={() => {
                if (minimizedGroups.has(group.id)) {
                  const container = (group.header as any)?.element?.closest('.dv-resize-container') as HTMLElement | null;
                  if (container) {
                    container.style.height = '';
                    container.style.minHeight = '';
                    container.style.overflow = '';
                  }
                  minimizedGroups.delete(group.id);
                }
                group.api.moveTo({ position: 'right' });
              }}
              style={iconBtnStyle}
            >
              <ArrowDownToLine size={12} />
            </button>
          </Tooltip>
          {isMinimized ? (
            <Tooltip label="復元">
              <button type="button" className="adra-btn adra-btn--ghost" onClick={handleRestore} style={iconBtnStyle}>
                <Maximize2 size={12} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip label="最小化">
              <button type="button" className="adra-btn adra-btn--ghost" onClick={handleMinimize} style={iconBtnStyle}>
                <Minus size={12} />
              </button>
            </Tooltip>
          )}
        </>
      )}

      {/* フロート（既にフロート中なら非表示） */}
      {!isFloating && (
        <Tooltip label="フロートにする">
          <button
            type="button"
            className="adra-btn adra-btn--ghost"
            onClick={() => {
              containerApi.addFloatingGroup(activePanel);
            }}
            style={iconBtnStyle}
          >
            <PictureInPicture2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/* ── DockviewInner（memo で Context 変更による再レンダリングを防止） ── */

const DockviewInner = memo(function DockviewInner({
  onApiReady,
  role,
  statusPanelBoardOverlay,
  setStatusPanelBoardOverlay,
}: {
  onApiReady: (api: DockviewApi) => void;
  role: string;
  statusPanelBoardOverlay: boolean;
  setStatusPanelBoardOverlay: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const dockviewComponents = useMemo(() => {
    const comps: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {};
    for (const [key, Comp] of Object.entries(panelComponents)) {
      comps[key] = React.memo(function DockPanelWrapper() {
        return (
          <ErrorBoundary>
            <Comp />
          </ErrorBoundary>
        );
      });
    }
    return comps;
  }, []);

  const apiRef = useRef<DockviewApi | null>(null);
  const statusPanelBoardOverlayRef = useRef(statusPanelBoardOverlay);
  statusPanelBoardOverlayRef.current = statusPanelBoardOverlay;

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;
      onApiReady(api);

      const rr = role as RoomRole;

      // セッション復元 → 無ければ組み込み初期レイアウト
      const saved = loadLayout(role);
      if (saved) {
        try {
          const layout = sanitizeDockviewLayoutForRole(saved.layout, rr);
          api.fromJSON(layout as unknown as Parameters<DockviewApi['fromJSON']>[0]);
          setStatusPanelBoardOverlay(migrateStatusPanelBoardOverlay(saved));
          requestAnimationFrame(() => requestAnimationFrame(() => fixAllNonBoardWidths(api)));
          return;
        } catch {
          // 復元失敗 → 壊れたレイアウトを削除して後続処理へ
          localStorage.removeItem(layoutKey(role));
        }
      }

      // 組み込み初期: guest のみ別マスタ。それ以外は GM 用マスタ共通＋サニタイズ
      const defaultJson = role === 'guest' ? DEFAULT_LAYOUT_GUEST : DEFAULT_LAYOUT_OWNER;
      try {
        const scaled = scaleLayout(defaultJson, api.width, api.height);
        const layout = sanitizeDockviewLayoutForRole(scaled, rr);
        api.fromJSON(layout as unknown as Parameters<DockviewApi['fromJSON']>[0]);
        setStatusPanelBoardOverlay(role !== 'guest');
        requestAnimationFrame(() => requestAnimationFrame(() => fixAllNonBoardWidths(api)));
      } catch {
        // フォールスルー: 空のままになる。board が存在しない場合のみ追加
        if (!api.getPanel('board')) {
          api.addPanel({ id: 'board', component: 'board', title: 'Board', tabComponent: 'boardTab' });
        }
      }
    },
    [onApiReady, role, setStatusPanelBoardOverlay],
  );

  // レイアウト変更時に自動保存（debounce で連続変更をまとめる）
  // ユーザーが sash をドラッグ中のみ制約を解除し、離したら再固定
  const roleRef = useRef(role);
  roleRef.current = role;

  // statusPanelBoardOverlay の変更時に即保存
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    saveLayout(api, roleRef.current, statusPanelBoardOverlay);
  }, [statusPanelBoardOverlay]);
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    let timer: ReturnType<typeof setTimeout>;

    let sashDragging = false;
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.dv-sash')) {
        sashDragging = true;
        api.groups.forEach((g) => {
          if (g.api.location.type !== 'floating' && !g.panels.some((p) => p.id === 'board')) {
            relaxGroupWidth(g);
          }
        });
      }
    };
    const onPointerUp = () => {
      if (!sashDragging) return;
      sashDragging = false;
      api.groups.forEach((g) => {
        if (g.api.location.type !== 'floating' && !g.panels.some((p) => p.id === 'board')) {
          fixGroupWidth(g);
        }
      });
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);

    const disposable = api.onDidLayoutChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => saveLayout(api, roleRef.current, statusPanelBoardOverlayRef.current), 300);
    });

    return () => {
      clearTimeout(timer);
      disposable.dispose();
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <DockviewReact
      components={dockviewComponents}
      tabComponents={{ boardTab: BoardTab }}
      onReady={onReady}
      theme={catppuccinTheme}
      floatingGroupBounds="boundedWithinViewport"
      prefixHeaderActionsComponent={PrefixHeaderActions}
      rightHeaderActionsComponent={RightHeaderActions}
    />
  );
});

/* ── DockLayout ── */

export function DockLayout() {
  const { setDockviewApi, statusPanelBoardOverlay, setStatusPanelBoardOverlay } = useAdrasteaContext();
  const { roomRole } = usePermission();

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <BgmEngine />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DockviewInner
          key={roomRole}
          onApiReady={setDockviewApi}
          role={roomRole}
          statusPanelBoardOverlay={statusPanelBoardOverlay}
          setStatusPanelBoardOverlay={setStatusPanelBoardOverlay}
        />
      </div>
    </div>
  );
}
