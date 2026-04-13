import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { useAuth } from '../../contexts/AuthContext';
import { hasRole } from '../../config/permissions';
import { handleClipboardImport } from '../../hooks/usePasteHandler';
import { DropdownMenu, shortcutLabel } from '../ui/DropdownMenu';
import { theme } from '../../styles/theme';
import { filterAndSortStatusPanelCharacters } from '../status/statusDisplayUtils';
import { StatusPanelCharacterRow } from '../status/StatusPanelCharacterRow';

const STATUS_COL_MIN_WIDTH = 120;

export function StatusDockPanel() {
  const ctx = useAdrasteaContext();
  const { user } = useAuth();
  const currentUserId = user?.uid ?? '';
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [statusCols, setStatusCols] = useState(2);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setStatusCols(Math.max(1, Math.floor(w / STATUS_COL_MIN_WIDTH)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const visible = filterAndSortStatusPanelCharacters(ctx.characters);

  const isSubOwnerPlus = hasRole(ctx.roomRole, 'sub_owner');

  const handleClick = useCallback((charId: string) => {
    const char = ctx.characters.find(c => c.id === charId);
    if (char && (char.owner_id === user?.uid || isSubOwnerPlus)) {
      ctx.clearAllEditing();
      ctx.setEditingCharacter(char);
    }
  }, [ctx, user?.uid, isSubOwnerPlus]);

  const handleDoubleClick = useCallback((charId: string) => {
    const char = ctx.characters.find(c => c.id === charId);
    if (char && (char.owner_id === user?.uid || isSubOwnerPlus)) {
      ctx.setCharacterToOpenModal(char);
    }
  }, [ctx, user?.uid, isSubOwnerPlus]);

  const patchCharacterStatus = ctx.patchCharacterStatus;


  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      await handleClipboardImport(
        text,
        (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
        ctx.showToast,
        async (data) => {
          const { sort_order: _so, ...rest } = data;
          return ctx.addObject({ ...rest, scene_start_id: rest.is_global ? null : (ctx.activeScene?.id ?? null), scene_end_id: rest.is_global ? null : (ctx.activeScene?.id ?? null) });
        },
        undefined,
        undefined,
        ctx.updateObject,
        ctx.activeObjects,
        ctx.activeScene?.id ?? null,
        undefined,
        ctx.characters?.map(c => c.name),
        ctx.scenarioTexts?.map(t => t.title),
        ctx.updateScene,
      );
    } catch {
      ctx.showToast('クリップボードの読み取りに失敗しました', 'error');
    }
  }, [ctx]);

  return (
    <>
      <div
        ref={panelRef}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuPos({ x: e.clientX, y: e.clientY });
        }}
        style={{
          height: '100%',
          overflow: 'auto',
          background: theme.bgSurface,
          color: theme.textPrimary,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {visible.length === 0 ? (
          <div style={{ padding: 16, color: theme.textMuted, textAlign: 'center', fontSize: 12 }}>
            表示するキャラクターがいません
          </div>
        ) : visible.map(char => (
          <StatusPanelCharacterRow
            key={char.id}
            char={char}
            currentUserId={currentUserId}
            isSubOwnerPlus={isSubOwnerPlus}
            statusCols={statusCols}
            patchCharacterStatus={patchCharacterStatus}
            onIconClick={handleClick}
            onIconDoubleClick={handleDoubleClick}
          />
        ))}
      </div>
      <DropdownMenu
        mode="context"
        open={contextMenuPos !== null}
        onOpenChange={(open) => { if (!open) setContextMenuPos(null); }}
        position={contextMenuPos ?? { x: 0, y: 0 }}
        items={[
          {
            label: ctx.statusPanelBoardOverlay ? '盤面から非表示' : '盤面に表示',
            onClick: () => {
              ctx.setStatusPanelBoardOverlay(prev => !prev);
              setContextMenuPos(null);
            },
          },
          {
            label: '貼り付け',
            shortcut: shortcutLabel('V'),
            onClick: () => {
              handlePaste();
              setContextMenuPos(null);
            },
          },
        ]}
      />
    </>
  );
}
