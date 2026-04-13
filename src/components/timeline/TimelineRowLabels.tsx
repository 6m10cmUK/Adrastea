import React, { useCallback } from 'react';
import type { BoardObjectType } from '../../types/adrastea.types';
import { theme } from '../../styles/theme';

export interface TimelineRowLabelItem {
  id: string;
  name: string;
  type: 'object' | 'bgm';
  objectType?: BoardObjectType;
  isGlobal: boolean;
}

export interface TimelineRowLabelsProps {
  rows: TimelineRowLabelItem[];
  rowHeight: number;
  selectedIds: Set<string>;
  onSelect: (id: string, multiselect: boolean) => void;
}

/**
 * TimelineRowLabels
 * OBJ/BGM の行名ラベル列。
 * 各行に名前を表示し、type に応じた色分けを行う。
 */
export const TimelineRowLabels: React.FC<TimelineRowLabelsProps> = ({
  rows,
  rowHeight,
  selectedIds,
  onSelect,
}) => {
  const handleRowClick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      onSelect(id, e.ctrlKey || e.metaKey);
    },
    [onSelect]
  );

  const getRowColor = (row: TimelineRowLabelItem): string => {
    // objectType が特殊な値（背景レイヤーなど）なら薄い色
    if (
      row.objectType === 'background' ||
      row.objectType === 'foreground' ||
      row.objectType === 'characters_layer'
    ) {
      return 'rgba(128, 128, 128, 0.2)';
    }
    // type に応じた色
    return row.type === 'object' ? theme.accent : theme.green;
  };

  const getTypeIndicator = (row: TimelineRowLabelItem): string => {
    if (row.objectType === 'background') return '[背景]';
    if (row.objectType === 'foreground') return '[前景]';
    if (row.objectType === 'characters_layer') return '[キャラ]';
    return row.type === 'object' ? '[OBJ]' : '[BGM]';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.bgBase,
        borderRight: `1px solid ${theme.borderSubtle}`,
        overflow: 'hidden',
        minWidth: '140px',
        maxWidth: '200px',
      }}
    >
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            height: `${rowHeight}px`,
            padding: '2px 8px',
            backgroundColor: selectedIds.has(row.id)
              ? theme.accentHighlight
              : getRowColor(row),
            borderBottom: `1px solid ${theme.borderSubtle}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            fontSize: '11px',
            color: selectedIds.has(row.id) ? theme.textOnAccent : theme.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease-out',
            fontWeight: selectedIds.has(row.id) ? 600 : 400,
          }}
          onClick={handleRowClick(row.id)}
          title={`${getTypeIndicator(row)} ${row.name}`}
        >
          <span style={{ marginRight: '4px', opacity: 0.7, minWidth: '32px' }}>
            {getTypeIndicator(row)}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.name}
          </span>
        </div>
      ))}
    </div>
  );
};
