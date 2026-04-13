import React, { useMemo, useCallback } from 'react';
import type { Scene, BoardObject, BoardObjectType, BgmTrack } from '../../types/adrastea.types';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { resolveAssetId } from '../../hooks/useAssets';
import { theme } from '../../styles/theme';
import { TimelineHeader } from './TimelineHeader';
import { TimelineBlock } from './TimelineBlock';
import { useTimelineBlockDrag } from './useTimelineBlockDrag';
import type { DragMode } from './useTimelineBlockDrag';

// 定数
const COLUMN_WIDTH = 136;   // px per scene
const ROW_HEIGHT = 28;      // px per row
const HEADER_HEIGHT = 32;   // px
const LABEL_WIDTH = 40;     // px (トラック番号のみ)

interface TimelineTrack {
  sortOrder: number;
  type: 'object' | 'bgm';
  rowIdx: number;
}

interface TimelineBlockInfo {
  id: string;
  name: string;
  imageUrl: string | null;
  objectType?: BoardObjectType;
  startIdx: number;
  endIdx: number;
  rowIdx: number;
  isGlobal: boolean;
  rowType: 'object' | 'bgm';
}

/**
 * TimelinePanel
 * タイムラインパネルの統合コンポーネント。
 * シーン・オブジェクト・BGM を時系列で表示。
 */
export const TimelinePanel: React.FC = () => {
  const {
    scenes,
    allObjects,
    bgms,
    selectedObjectIds,
    setSelectedObjectIds,
    updateObject,
    updateBgm,
    activateScene,
    activeScene,
  } = useAdrasteaContext();

  /**
   * データ構築
   */
  const { tracks, blocks, gridWidth, gridHeight } = useMemo(() => {
    const sortedScenes = [...scenes].sort((a, b) => a.position - b.position);

    // sort_order でトラックをグループ化（OBJ）
    // 同じ sort_order の OBJ は同じトラック（行）
    const sortOrderToTrackIdx = new Map<number, number>();
    const trackList: TimelineTrack[] = [];
    const blockList: TimelineBlockInfo[] = [];

    // OBJ を sort_order 降順でソート（前面が上）
    const sortedObjects = [...allObjects].sort((a, b) => b.sort_order - a.sort_order);

    // ユニークな sort_order を降順で取得してトラック割当
    const uniqueSortOrders = [...new Set(sortedObjects.map(o => o.sort_order))].sort((a, b) => b - a);
    uniqueSortOrders.forEach((so, idx) => {
      sortOrderToTrackIdx.set(so, idx);
      trackList.push({ sortOrder: so, type: 'object', rowIdx: idx });
    });

    // 各 OBJ をトラックに配置
    for (const obj of sortedObjects) {
      const rowIdx = sortOrderToTrackIdx.get(obj.sort_order)!;
      const { startIdx, endIdx } = getSceneRange(obj, sortedScenes);
      const imageUrl = obj.image_asset_id ? resolveAssetId(obj.image_asset_id) : null;
      blockList.push({
        id: obj.id,
        name: obj.name,
        imageUrl,
        objectType: obj.type,
        startIdx,
        endIdx,
        rowIdx,
        isGlobal: obj.is_global,
        rowType: 'object',
      });
    }

    // BGM トラック（OBJ トラックの下に追加）
    const bgmStartRowIdx = trackList.length;
    const sortedBgms = [...bgms].sort((a, b) => a.sort_order - b.sort_order);

    sortedBgms.forEach((bgm, idx) => {
      const rowIdx = bgmStartRowIdx + idx;
      trackList.push({ sortOrder: bgm.sort_order, type: 'bgm', rowIdx });
      const { startIdx, endIdx } = getSceneRange(bgm, sortedScenes);
      blockList.push({
        id: bgm.id,
        name: bgm.name,
        imageUrl: null,
        startIdx,
        endIdx,
        rowIdx,
        isGlobal: bgm.is_global,
        rowType: 'bgm',
      });
    });

    const gridW = sortedScenes.length * COLUMN_WIDTH;
    const gridH = trackList.length * ROW_HEIGHT;

    return {
      tracks: trackList,
      blocks: blockList,
      gridWidth: gridW,
      gridHeight: gridH,
    };
  }, [scenes, allObjects, bgms]);

  /**
   * シーン範囲を計算
   */
  function getSceneRange(
    obj: BoardObject | BgmTrack,
    sortedScenes: Scene[]
  ): { startIdx: number; endIdx: number } {
    if (obj.is_global) {
      return {
        startIdx: 0,
        endIdx: sortedScenes.length - 1,
      };
    }
    const startIdx = sortedScenes.findIndex((s) => s.id === obj.scene_start_id);
    const endIdx = sortedScenes.findIndex((s) => s.id === obj.scene_end_id);
    return {
      startIdx: startIdx >= 0 ? startIdx : 0,
      endIdx: endIdx >= 0 ? endIdx : Math.max(0, sortedScenes.length - 1),
    };
  }

  /**
   * ブロック選択
   */
  const handleBlockSelect = useCallback(
    (id: string, multiselect: boolean) => {
      if (multiselect) {
        setSelectedObjectIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
      } else {
        setSelectedObjectIds([id]);
      }
    },
    [setSelectedObjectIds]
  );

  /**
   * ドラッグ: 移動完了時のコールバック
   */
  const handleDragMove = useCallback(
    async (blockId: string, newStartId: string | null, newEndId: string | null, newRowIdx: number | null) => {
      // ブロックがOBJかBGMか判定
      const obj = allObjects.find(o => o.id === blockId);
      const bgm = bgms.find(b => b.id === blockId);

      if (obj) {
        const rangeUpdate: Partial<BoardObject> = {};
        if (!obj.is_global) {
          rangeUpdate.scene_start_id = newStartId;
          rangeUpdate.scene_end_id = newEndId;
        }
        // 縦移動: sort_order をトラックの sort_order に変更
        if (newRowIdx !== null) {
          // トラックの sort_order を取得
          const targetTrack = tracks[newRowIdx];
          if (targetTrack) {
            rangeUpdate.sort_order = targetTrack.sortOrder;
          }
        }
        if (Object.keys(rangeUpdate).length > 0) {
          await updateObject(blockId, rangeUpdate);
        }
      } else if (bgm) {
        const rangeUpdate: Partial<BgmTrack> = {};
        if (!bgm.is_global) {
          rangeUpdate.scene_start_id = newStartId;
          rangeUpdate.scene_end_id = newEndId;
        }
        if (Object.keys(rangeUpdate).length > 0) {
          await updateBgm(blockId, rangeUpdate);
        }
      }
    },
    [allObjects, bgms, tracks, updateObject, updateBgm]
  );

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => a.position - b.position),
    [scenes]
  );

  const { dragState, getDragPreview, handleDragStart: startDrag, handleMouseMove, handleMouseUp } = useTimelineBlockDrag(
    COLUMN_WIDTH,
    ROW_HEIGHT,
    sortedScenes,
    tracks.length,
    handleDragMove,
  );

  /**
   * ブロックからのドラッグ開始
   */
  const handleBlockDragStart = useCallback(
    (blockId: string, mode: DragMode, startX: number, startY: number) => {
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;
      startDrag(blockId, mode, startX, startY, block.startIdx, block.endIdx, block.rowIdx);
    },
    [blocks, startDrag]
  );

  /**
   * シーンアクティベート
   */
  const handleSceneClick = useCallback(
    (sceneId: string) => {
      activateScene(sceneId);
    },
    [activateScene]
  );

  /**
   * GridRenderer - グリッド線描画＆ブロック配置
   */
  const renderGrid = () => {
    const gridLines: React.ReactNode[] = [];

    // 縦線（シーン境界）
    for (let i = 0; i <= scenes.length; i++) {
      gridLines.push(
        <div
          key={`v-${i}`}
          style={{
            position: 'absolute',
            left: `${i * COLUMN_WIDTH}px`,
            top: 0,
            width: 0,
            height: `${gridHeight}px`,
            borderLeft: `1px solid ${theme.borderSubtle}`,
          }}
        />
      );
    }

    // 横線（行境界）
    for (let i = 0; i <= tracks.length; i++) {
      gridLines.push(
        <div
          key={`h-${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: `${i * ROW_HEIGHT}px`,
            width: `${gridWidth}px`,
            height: 0,
            borderTop: `1px solid ${theme.borderSubtle}`,
          }}
        />
      );
    }

    return gridLines;
  };

  const activeSceneId = activeScene?.id || null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: theme.bgBase,
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー行（シーン名）*/}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: `${HEADER_HEIGHT}px`,
          borderBottom: `1px solid ${theme.borderSubtle}`,
        }}
      >
        {/* 左上コーナー */}
        <div
          style={{
            width: `${LABEL_WIDTH}px`,
            flexShrink: 0,
            backgroundColor: theme.bgToolbar,
            borderRight: `1px solid ${theme.borderSubtle}`,
          }}
        />
        {/* タイムラインヘッダー */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            overflowX: 'auto',
          }}
        >
          <TimelineHeader
            scenes={scenes}
            columnWidth={COLUMN_WIDTH}
            activeSceneId={activeSceneId}
            onSceneClick={handleSceneClick}
          />
        </div>
      </div>

      {/* 本体（ラベル + グリッド）*/}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* 左列（RowLabels）*/}
        <div
          style={{
            width: `${LABEL_WIDTH}px`,
            flexShrink: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            backgroundColor: theme.bgToolbar,
            borderRight: `1px solid ${theme.borderSubtle}`,
          }}
        >
          {tracks.map((track, idx) => (
            <div
              key={`track-${track.sortOrder}-${track.type}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: `${ROW_HEIGHT}px`,
                borderBottom: `1px solid ${theme.borderSubtle}`,
                color: theme.textMuted,
                fontSize: '10px',
                userSelect: 'none',
              }}
            >
              {idx + 1}
            </div>
          ))}
        </div>

        {/* 右列（グリッド）*/}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'auto',
            }}
          >
            {/* グリッドコンテナ */}
            <div
              style={{
                position: 'relative',
                width: `${gridWidth}px`,
                height: `${gridHeight}px`,
                backgroundColor: theme.bgBase,
              }}
              onMouseMove={(e) => handleMouseMove(e.clientX, e.clientY)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* グリッド線 */}
              {renderGrid()}

              {/* ブロック */}
              {blocks.map((block) => {
                // ドラッグ中のブロックは元の位置に半透明で表示
                const isDragging = dragState?.blockId === block.id;
                return (
                  <TimelineBlock
                    key={block.id}
                    rowId={block.id}
                    name={block.name}
                    imageUrl={block.imageUrl}
                    objectType={block.objectType}
                    startIdx={block.startIdx}
                    endIdx={block.endIdx}
                    rowIdx={block.rowIdx}
                    columnWidth={COLUMN_WIDTH}
                    rowHeight={ROW_HEIGHT}
                    isSelected={selectedObjectIds.includes(block.id)}
                    isGlobal={block.isGlobal}
                    rowType={block.rowType}
                    isDragPreview={isDragging}
                    onSelect={handleBlockSelect}
                    onDragStart={handleBlockDragStart}
                  />
                );
              })}
              {/* ドラッグプレビュー */}
              {(() => {
                const preview = getDragPreview();
                if (!preview || !dragState) return null;
                const block = blocks.find(b => b.id === dragState.blockId);
                if (!block) return null;
                return (
                  <TimelineBlock
                    key="drag-preview"
                    rowId={dragState.blockId}
                    name={block.name}
                    imageUrl={block.imageUrl}
                    objectType={block.objectType}
                    startIdx={preview.startIdx}
                    endIdx={preview.endIdx}
                    rowIdx={preview.rowIdx}
                    columnWidth={COLUMN_WIDTH}
                    rowHeight={ROW_HEIGHT}
                    isSelected={true}
                    isGlobal={block.isGlobal}
                    rowType={block.rowType}
                    onSelect={() => {}}
                    onDragStart={() => {}}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
