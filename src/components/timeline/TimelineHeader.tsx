import React, { useCallback } from 'react';
import type { Scene } from '../../types/adrastea.types';
import { theme } from '../../styles/theme';

export interface TimelineHeaderProps {
  scenes: Scene[];
  columnWidth: number;
  activeSceneId: string | null;
  onSceneClick: (sceneId: string) => void;
}

/**
 * TimelineHeader
 * シーン名のヘッダー行。
 * flex で横並びに各シーンセルを表示。
 */
export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  scenes,
  columnWidth,
  activeSceneId,
  onSceneClick,
}) => {
  const handleSceneClick = useCallback(
    (sceneId: string) => () => {
      onSceneClick(sceneId);
    },
    [onSceneClick]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: theme.bgToolbar,
        borderBottom: `1px solid ${theme.borderSubtle}`,
        overflow: 'hidden',
      }}
    >
      {scenes.map((scene) => (
        <div
          key={scene.id}
          style={{
            flex: `0 0 ${columnWidth}px`,
            width: `${columnWidth}px`,
            height: '32px',
            padding: '4px 8px',
            backgroundColor:
              activeSceneId === scene.id
                ? theme.accentHighlight
                : theme.bgSurface,
            borderRight: `1px solid ${theme.borderSubtle}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: activeSceneId === scene.id ? theme.textOnAccent : theme.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease-out',
            fontWeight: activeSceneId === scene.id ? 600 : 400,
          }}
          onClick={handleSceneClick(scene.id)}
          title={scene.name}
        >
          {scene.name}
        </div>
      ))}
    </div>
  );
};
