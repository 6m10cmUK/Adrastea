import { useCallback, useState, useEffect } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { Plus, Send, Trash2, Copy } from 'lucide-react';
import { theme } from '../styles/theme';
import type { ScenarioText } from '../types/adrastea.types';
import { SortableListPanel, SortableListItem, Tooltip } from './ui';
import { DropdownMenu, shortcutLabel } from './ui/DropdownMenu';

interface ScenarioTextPanelProps {
  texts: ScenarioText[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onAdd: () => void;
  onRemove: (textIds: string[]) => void;
  onReorderTexts?: (orderedIds: string[]) => void;
  onSendToChat?: (textId: string) => void;
  onCopy?: (textIds: string[]) => void;
  onDuplicate?: (textIds: string[]) => void;
  onPaste?: () => void;
  channels?: { channel_id: string; label: string }[];
  keyboardActionsRef?: React.MutableRefObject<{ copy?: () => void; duplicate?: () => void; delete?: () => void }>;
  panelSelection?: { panel: string; ids: string[] } | null;
}

export function ScenarioTextPanel({
  texts,
  selectedIds,
  onSelectIds,
  onAdd,
  onRemove,
  onReorderTexts,
  onSendToChat,
  onCopy,
  onDuplicate,
  onPaste,
  channels,
  keyboardActionsRef,
  panelSelection,
}: ScenarioTextPanelProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; textId?: string } | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderTexts) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 複数選択中なら選択アイテム全部、そうでなければドラッグしたもの1つ
    const dragIds = selectedIds.includes(activeId) && selectedIds.length > 1
      ? selectedIds
      : [activeId];
    const dragSet = new Set(dragIds);
    if (dragSet.has(overId)) return;

    // ドラッグ対象を除外した残りリスト
    const rest = texts.filter(item => !dragSet.has(item.id));
    const draggedItems = texts.filter(item => dragSet.has(item.id));

    // 挿入位置を計算
    const activeOrigIdx = texts.findIndex(item => item.id === activeId);
    const overOrigIdx = texts.findIndex(item => item.id === overId);
    const overIdx = rest.findIndex(item => item.id === overId);
    if (overIdx < 0) return;
    const insertIdx = activeOrigIdx < overOrigIdx ? overIdx + 1 : overIdx;

    rest.splice(insertIdx, 0, ...draggedItems);
    onReorderTexts(rest.map(item => item.id));
  }, [texts, selectedIds, onReorderTexts]);

  const handleItemClick = useCallback((textId: string, e: React.MouseEvent) => {
    if (e.shiftKey && selectedIds.length > 0) {
      // Shift: 範囲選択
      const lastSelected = selectedIds[selectedIds.length - 1];
      const anchorIdx = texts.findIndex(t => t.id === lastSelected);
      const targetIdx = texts.findIndex(t => t.id === textId);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        onSelectIds(texts.slice(start, end + 1).map(t => t.id));
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Ctrl/Cmd: トグル
      const newIds = selectedIds.includes(textId)
        ? selectedIds.filter(id => id !== textId)
        : [...selectedIds, textId];
      onSelectIds(newIds);
    } else {
      // 通常クリック
      onSelectIds([textId]);
    }
  }, [texts, selectedIds, onSelectIds]);

  // キーボードアクション登録
  useEffect(() => {
    if (!keyboardActionsRef || selectedIds.length === 0) return;
    keyboardActionsRef.current = {
      copy: () => onCopy?.(selectedIds),
      duplicate: () => onDuplicate?.(selectedIds),
      delete: () => {
        if (selectedIds.length > 0) {
          setPendingDeleteIds(selectedIds);
        }
      },
    };
    return () => {
      if (panelSelection?.panel === 'scenario_text') {
        keyboardActionsRef.current = {};
      }
    };
  }, [selectedIds, onCopy, onDuplicate, keyboardActionsRef, panelSelection]);

  const iconBtn: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <>
      <div
        data-selection-panel
        onContextMenu={(e) => {
          e.preventDefault();
          const el = (e.target as HTMLElement).closest('[data-text-id]');
          const textId = el?.getAttribute('data-text-id') ?? undefined;
          if (textId && !selectedIds.includes(textId)) {
            onSelectIds([textId]);
          }
          setContextMenu({ x: e.clientX, y: e.clientY, textId });
        }}
        style={{ height: '100%' }}
      >
        <SortableListPanel
          title="テキストメモ"
          onBackgroundClick={() => onSelectIds([])}
          headerActions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
              <Tooltip label="複製">
                <button
                  onClick={() => selectedIds.length > 0 && onDuplicate?.(selectedIds)}
                  disabled={selectedIds.length === 0 || !onDuplicate}
                  style={{ ...iconBtn, color: theme.textSecondary, padding: '2px 4px', opacity: selectedIds.length > 0 && onDuplicate ? 1 : 0.3 }}
                >
                  <Copy size={15} />
                </button>
              </Tooltip>
              <Tooltip label="削除">
                <button
                  onClick={() => selectedIds.length > 0 && setPendingDeleteIds(selectedIds)}
                  disabled={selectedIds.length === 0}
                  style={{ ...iconBtn, color: theme.danger, padding: '2px 4px', opacity: selectedIds.length > 0 ? 1 : 0.3 }}
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>
              <Tooltip label="テキストメモを追加">
                <button
                  onClick={onAdd}
                  aria-label="テキストメモを追加"
                  style={{ ...iconBtn, color: theme.accent, padding: '2px 4px' }}
                >
                  <Plus size={15} />
                </button>
              </Tooltip>
            </div>
          }
          items={texts}
          onDragEnd={handleDragEnd}
          emptyMessage="テキストメモがありません"
        >
          {texts.map((text) => (
            <div key={text.id} data-text-id={text.id}>
              <SortableListItem
                id={text.id}
                isSelected={selectedIds.includes(text.id)}
                onClick={(e: React.MouseEvent) => handleItemClick(text.id, e)}
              >
                <Tooltip label={text.speaker_name ? `送信名：${text.speaker_name.length > 20 ? text.speaker_name.slice(0, 20) + '…' : text.speaker_name}` : '送信名：未設定'}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '4px', fontSize: '12px' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, fontWeight: 600 }}>
                      {text.title || 'テキストメモ'}
                    </span>
                    <Tooltip label="チャットに送信">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSendToChat?.(text.id); }}
                        disabled={!text.content || !onSendToChat}
                        style={{ ...iconBtn, color: theme.accent, opacity: text.content && onSendToChat ? 1 : 0.3 }}
                      >
                        <Send size={13} />
                      </button>
                    </Tooltip>
                  </div>
                  <div style={{
                    color: theme.textSecondary,
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {(() => {
                      const ch = channels?.find(c => c.channel_id === text.channel_id);
                      const prefix = ch ? `[${ch.label}] ` : '';
                      return prefix + (text.content?.replace(/\n/g, ' ') || '(空)');
                    })()}
                  </div>
                </div>
                </Tooltip>
              </SortableListItem>
            </div>
          ))}
        </SortableListPanel>
      </div>

      <DropdownMenu
        mode="context"
        open={contextMenu !== null}
        onOpenChange={(open) => { if (!open) setContextMenu(null); }}
        position={contextMenu ?? { x: 0, y: 0 }}
        items={(() => {
          // 右クリック対象が選択済み → 選択全体、未選択 → その1件、なし → 選択全体
          const targetIds = contextMenu?.textId
            ? (selectedIds.includes(contextMenu.textId) ? selectedIds : [contextMenu.textId])
            : selectedIds;
          const hasTarget = targetIds.length > 0;
          return [
          {
            label: '新規作成',
            onClick: () => {
              onAdd();
              setContextMenu(null);
            },
          },
          'separator' as any,
          {
            label: targetIds.length > 1 ? `${targetIds.length}件をコピー` : 'コピー',
            shortcut: shortcutLabel('C'),
            disabled: !hasTarget,
            onClick: () => {
              if (hasTarget) onCopy?.(targetIds);
              setContextMenu(null);
            },
          },
          {
            label: targetIds.length > 1 ? `${targetIds.length}件を複製` : '複製',
            shortcut: shortcutLabel('D'),
            disabled: !hasTarget || !onDuplicate,
            onClick: () => {
              if (hasTarget) onDuplicate?.(targetIds);
              setContextMenu(null);
            },
          },
          {
            label: targetIds.length > 1 ? `${targetIds.length}件を削除` : '削除',
            shortcut: 'Del',
            disabled: !hasTarget,
            danger: true,
            onClick: () => {
              if (hasTarget) setPendingDeleteIds(targetIds);
              setContextMenu(null);
            },
          },
        ] as any;
        })()
        .concat([
          'separator' as any,
          {
            label: '貼り付け',
            shortcut: shortcutLabel('V'),
            disabled: !onPaste,
            onClick: () => {
              onPaste?.();
              setContextMenu(null);
            },
          },
        ] as any)}
      />

      {pendingDeleteIds && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setPendingDeleteIds(null)}
        >
          <div
            style={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '400px',
              boxShadow: theme.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ color: theme.textPrimary, marginBottom: '16px', fontSize: '14px' }}>
              {pendingDeleteIds.length > 1 ? `${pendingDeleteIds.length}件のテキストメモを削除しますか？` : `「${texts.find(t => t.id === pendingDeleteIds[0])?.title || 'テキストメモ'}」を削除しますか？`}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingDeleteIds(null)}
                style={{
                  padding: '6px 12px',
                  border: `1px solid ${theme.border}`,
                  background: theme.bgInput,
                  color: theme.textPrimary,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  onRemove(pendingDeleteIds);
                  setPendingDeleteIds(null);
                }}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  background: theme.danger,
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
