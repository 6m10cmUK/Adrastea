import { useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { theme } from '../styles/theme';
import type { Cutin } from '../types/adrastea.types';
import { resolveAssetId } from '../hooks/useAssets';
import { SortableListPanel, SortableListItem } from './ui';

interface CutinPanelProps {
  cutins: Cutin[];
  onTrigger: (cutinId: string) => void;
  onAdd: () => void;
  onEdit: (cutin: Cutin) => void;
  onRemove: (cutinId: string) => void;
  onReorderCutins?: (orderedIds: string[]) => void;
  onClose: () => void;
}

const animLabel = (anim: string) => {
  switch (anim) {
    case 'slide': return 'スライド';
    case 'fade': return 'フェード';
    case 'zoom': return 'ズーム';
    default: return anim;
  }
};

export function CutinPanel({ cutins, onTrigger, onAdd, onEdit, onRemove, onReorderCutins, onClose }: CutinPanelProps) {
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderCutins) return;
    const oldIndex = cutins.findIndex(c => c.id === active.id);
    const newIndex = cutins.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(cutins, oldIndex, newIndex);
    onReorderCutins(reordered.map(c => c.id));
  }, [cutins, onReorderCutins]);

  return (
    <SortableListPanel
      title="カットイン"
      headerActions={
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.textSecondary,
            fontSize: '1.2rem',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          x
        </button>
      }
      footerActions={
        <button
          onClick={onAdd}
          style={{
            width: '100%',
            padding: '8px',
            background: theme.accent,
            color: theme.textOnAccent,
            border: 'none',
            borderRadius: 0,
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          + カットイン追加
        </button>
      }
      items={cutins}
      onDragEnd={handleDragEnd}
      emptyMessage="カットインがありません"
    >
      {cutins.map((cutin) => (
        <SortableListItem key={cutin.id} id={cutin.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {cutin.image_asset_id && resolveAssetId(cutin.image_asset_id) ? (
                <img
                  src={resolveAssetId(cutin.image_asset_id) || undefined}
                  alt=""
                  style={{ width: '36px', height: '36px', borderRadius: 0, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: '36px', height: '36px', borderRadius: 0,
                  background: cutin.background_color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cutin.text_color, fontSize: '0.7rem', fontWeight: 700,
                }}>
                  CI
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: theme.textPrimary, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cutin.name}
                </div>
                <div style={{ color: theme.textMuted, fontSize: '0.7rem' }}>
                  {animLabel(cutin.animation)} / {cutin.duration / 1000}秒
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onTrigger(cutin.id); }}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: theme.danger,
                  color: theme.textOnAccent,
                  border: 'none',
                  borderRadius: 0,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                再生
              </button>
              <button
                className="adra-btn adra-btn--ghost"
                onClick={(e) => { e.stopPropagation(); onEdit(cutin); }}
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  color: theme.textSecondary,
                  border: 'none',
                  borderRadius: 0,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                編集
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(cutin.id); }}
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  color: theme.danger,
                  border: `1px solid ${theme.danger}`,
                  borderRadius: 0,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                削除
              </button>
            </div>
          </div>
        </SortableListItem>
      ))}
    </SortableListPanel>
  );
}
