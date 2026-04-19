import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import type { Scene, BoardObject, BoardObjectType, BgmTrack } from '../../types/adrastea.types';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { resolveAssetId } from '../../hooks/useAssets';
import { theme } from '../../styles/theme';
import { TimelineHeader } from './TimelineHeader';
import { TimelineBlock } from './TimelineBlock';
import { useTimelineResize } from './useTimelineResize';
import type { DragMode } from './useTimelineResize';

// 定数
const COLUMN_WIDTH = 136;   // px per scene
const ROW_HEIGHT = 28;      // px per row
const GAP_HEIGHT = 14;      // px（トラック間ギャップ表示）
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

function isSpecialTimelineObjectType(t: BoardObjectType | undefined): boolean {
  return t === 'background' || t === 'foreground' || t === 'characters_layer';
}

function isTrackReservedForMove(blocks: TimelineBlockInfo[], rowIdx: number): boolean {
  return blocks.some(
    (b) =>
      b.rowIdx === rowIdx &&
      b.rowType === 'object' &&
      isSpecialTimelineObjectType(b.objectType),
  );
}

function isGlobalMixInvalid(
  blocks: TimelineBlockInfo[],
  dragged: TimelineBlockInfo,
  targetRowIdx: number,
): boolean {
  const onRow = blocks.filter(
    (b) =>
      b.rowIdx === targetRowIdx &&
      b.rowType === 'object' &&
      b.id !== dragged.id,
  );
  if (onRow.length === 0) return false;
  return onRow.some((b) => b.isGlobal !== dragged.isGlobal);
}

/** ギャップ g の上端〜下端（グリッド座標） */
function gapVerticalRange(g: number): { top: number; bottom: number } {
  const top = g * ROW_HEIGHT;
  return { top, bottom: top + GAP_HEIGHT };
}

function yInsideGap(y: number, g: number): boolean {
  const { top, bottom } = gapVerticalRange(g);
  return y >= top && y < bottom;
}

/** オブジェクトトラック用ギャップ index 0..objectTrackCount のうち y が属するもの（なければ null） */
function hitTestObjectGap(y: number, objectTrackCount: number): number | null {
  for (let g = 0; g <= objectTrackCount; g++) {
    if (yInsideGap(y, g)) return g;
  }
  return null;
}

function nearestObjectGapIndex(y: number, objectTrackCount: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let g = 0; g <= objectTrackCount; g++) {
    const { top, bottom } = gapVerticalRange(g);
    const mid = (top + bottom) / 2;
    const d = Math.abs(y - mid);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  }
  return best;
}

function buildSortUpdatesForGapInsert(
  allObjects: BoardObject[],
  draggedId: string,
  gapIdx: number,
): { id: string; sort: number }[] {
  const uniqueDesc = [...new Set(allObjects.map((o) => o.sort_order))].sort((a, b) => b - a);
  const slots: string[][] = uniqueDesc.map((so) =>
    allObjects.filter((o) => o.sort_order === so).map((o) => o.id),
  );
  for (const row of slots) {
    const ix = row.indexOf(draggedId);
    if (ix >= 0) row.splice(ix, 1);
  }
  const compacted = slots.filter((row) => row.length > 0);
  const insertIdx = Math.min(Math.max(0, gapIdx), compacted.length);
  const newRows = [...compacted.slice(0, insertIdx), [draggedId], ...compacted.slice(insertIdx)];
  const total = newRows.length;
  const updates: { id: string; sort: number }[] = [];
  newRows.forEach((ids, visualIdx) => {
    const newSort = total - 1 - visualIdx;
    for (const id of ids) {
      const o = allObjects.find((x) => x.id === id);
      if (o && o.sort_order !== newSort) {
        updates.push({ id, sort: newSort });
      }
    }
  });
  return updates;
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
    batchUpdateSort,
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

  const objectTrackCount = useMemo(
    () => tracks.filter((t) => t.type === 'object').length,
    [tracks],
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [nearestGapIdx, setNearestGapIdx] = useState<number | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const nearestGapIdxRef = useRef<number | null>(null);
  const lastGridYRef = useRef<number | null>(null);

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
  const handleBlockMoveEnd = useCallback(
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

  const handleResizeCommit = useCallback(
    async (blockId: string, newStartId: string | null, newEndId: string | null) => {
      const obj = allObjects.find(o => o.id === blockId);
      const bgm = bgms.find(b => b.id === blockId);
      if (obj && !obj.is_global && newStartId && newEndId) {
        await updateObject(blockId, { scene_start_id: newStartId, scene_end_id: newEndId });
      } else if (bgm && !bgm.is_global && newStartId && newEndId) {
        await updateBgm(blockId, { scene_start_id: newStartId, scene_end_id: newEndId });
      }
    },
    [allObjects, bgms, updateObject, updateBgm]
  );

  const {
    resizeState,
    getResizePreview,
    startResize,
    handleMouseMove: handleResizeMouseMove,
    handleMouseUp: handleResizeMouseUp,
  } = useTimelineResize(COLUMN_WIDTH, sortedScenes, handleResizeCommit);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const resetDragUi = useCallback(() => {
    setActiveDragId(null);
    setNearestGapIdx(null);
    setDragDelta(null);
    nearestGapIdxRef.current = null;
    lastGridYRef.current = null;
  }, []);

  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    if (!event.active?.id) return;
    setActiveDragId(String(event.active.id));
    nearestGapIdxRef.current = null;
    lastGridYRef.current = null;
    setNearestGapIdx(null);
  }, []);

  const handleDndDragMove = useCallback((event: DragMoveEvent) => {
    setDragDelta(event.delta);
  }, []);

  useEffect(() => {
    if (!activeDragId) return;

    const onPointerMove = (e: PointerEvent) => {
      const scrollEl = scrollAreaRef.current;
      if (!scrollEl) return;

      const block = blocks.find((b) => b.id === activeDragId);
      if (
        !block ||
        block.rowType !== 'object' ||
        isSpecialTimelineObjectType(block.objectType)
      ) {
        return;
      }

      const rect = scrollEl.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollEl.scrollTop;
      lastGridYRef.current = y;

      const inStripe = hitTestObjectGap(y, objectTrackCount) !== null;
      const nextNearest = nearestObjectGapIndex(y, objectTrackCount);
      const next = inStripe ? nextNearest : null;
      if (nearestGapIdxRef.current === next) return;
      nearestGapIdxRef.current = next;
      setNearestGapIdx(next);
    };

    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [activeDragId, blocks, objectTrackCount]);

  const handleDndDragCancel = useCallback(() => {
    resetDragUi();
  }, [resetDragUi]);

  const handleDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const savedNearest = nearestGapIdxRef.current;
      resetDragUi();

      if (!active?.id) return;
      const blockId = String(active.id);
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      const lockedVertical =
        block.rowType === 'object' && isSpecialTimelineObjectType(block.objectType);
      const isBgm = block.rowType === 'bgm';
      const dy = lockedVertical ? 0 : delta.y;
      const dx = delta.x;

      const deltaCol = Math.round(dx / COLUMN_WIDTH);
      const deltaRow =
        lockedVertical || isBgm ? 0 : Math.round(dy / ROW_HEIGHT);

      const blockLen = block.endIdx - block.startIdx;
      const newStartIdx = Math.max(
        0,
        Math.min(block.startIdx + deltaCol, sortedScenes.length - 1 - blockLen),
      );
      const newEndIdx = newStartIdx + blockLen;

      const newStartId = block.isGlobal ? null : (sortedScenes[newStartIdx]?.id ?? null);
      const newEndId = block.isGlobal ? null : (sortedScenes[newEndIdx]?.id ?? null);

      if (lockedVertical) {
        void handleBlockMoveEnd(blockId, newStartId, newEndId, null);
        return;
      }

      if (isBgm) {
        void handleBlockMoveEnd(blockId, newStartId, newEndId, null);
        return;
      }

      if (savedNearest !== null) {
        const updates = buildSortUpdatesForGapInsert(allObjects, blockId, savedNearest);
        void (async () => {
          if (updates.length > 0) {
            await batchUpdateSort(updates);
          }
          await handleBlockMoveEnd(blockId, newStartId, newEndId, null);
        })();
        return;
      }

      let newRowIdx = Math.max(0, Math.min(block.rowIdx + deltaRow, tracks.length - 1));
      let rowIdxChanged = newRowIdx !== block.rowIdx;

      if (rowIdxChanged) {
        const targetTrack = tracks[newRowIdx];
        if (targetTrack?.type !== 'object') {
          newRowIdx = block.rowIdx;
          rowIdxChanged = false;
        } else if (isTrackReservedForMove(blocks, newRowIdx)) {
          newRowIdx = block.rowIdx;
          rowIdxChanged = false;
        } else if (isGlobalMixInvalid(blocks, block, newRowIdx)) {
          newRowIdx = block.rowIdx;
          rowIdxChanged = false;
        }
      }

      void handleBlockMoveEnd(
        blockId,
        newStartId,
        newEndId,
        rowIdxChanged ? newRowIdx : null,
      );
    },
    [
      allObjects,
      batchUpdateSort,
      blocks,
      handleBlockMoveEnd,
      objectTrackCount,
      resetDragUi,
      sortedScenes,
      tracks,
    ],
  );

  /**
   * ブロックからのリサイズ開始
   */
  const handleBlockResizeStart = useCallback(
    (blockId: string, mode: DragMode, startX: number) => {
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;
      startResize(blockId, mode, startX, block.startIdx, block.endIdx);
    },
    [blocks, startResize]
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
  const activeDragBlock = activeDragId
    ? blocks.find((b) => b.id === activeDragId) ?? null
    : null;

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
            ref={scrollAreaRef}
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'auto',
            }}
          >
            {/* グリッドコンテナ */}
            <DndContext
              sensors={sensors}
              onDragStart={handleDndDragStart}
              onDragMove={handleDndDragMove}
              onDragEnd={handleDndDragEnd}
              onDragCancel={handleDndDragCancel}
            >
              <div
                style={{
                  position: 'relative',
                  width: `${gridWidth}px`,
                  height: `${gridHeight}px`,
                  backgroundColor: theme.bgBase,
                }}
                onMouseMove={(e) => handleResizeMouseMove(e.clientX)}
                onMouseUp={handleResizeMouseUp}
                onMouseLeave={handleResizeMouseUp}
              >
                {/* グリッド線 */}
                {renderGrid()}

                {activeDragId &&
                  (() => {
                    const dragBlock = blocks.find((b) => b.id === activeDragId);
                    if (
                      !dragBlock ||
                      dragBlock.rowType !== 'object' ||
                      isSpecialTimelineObjectType(dragBlock.objectType)
                    ) {
                      return null;
                    }
                    const count = objectTrackCount;
                    return Array.from({ length: count + 1 }, (_, gapIdx) => (
                      <div
                        key={`gap-${gapIdx}`}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: `${gapIdx * ROW_HEIGHT}px`,
                          width: `${gridWidth}px`,
                          height: `${GAP_HEIGHT}px`,
                          backgroundColor:
                            gapIdx === nearestGapIdx ? theme.accentHighlight : theme.accentBgSubtle,
                          opacity: gapIdx === nearestGapIdx ? 0.6 : 0.2,
                          pointerEvents: 'none',
                          zIndex: 5,
                          borderRadius: '2px',
                          transition: 'opacity 0.1s, background-color 0.1s',
                          boxSizing: 'border-box',
                        }}
                      />
                    ));
                  })()}

                {/* ブロック */}
                {blocks.map((block) => {
                  const isResizeGhost = resizeState?.blockId === block.id;
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
                      isDragPreview={isResizeGhost}
                      onSelect={handleBlockSelect}
                      onResizeStart={handleBlockResizeStart}
                    />
                  );
                })}
                {/* リサイズプレビュー */}
                {(() => {
                  const preview = getResizePreview();
                  if (!preview || !resizeState) return null;
                  const block = blocks.find(b => b.id === resizeState.blockId);
                  if (!block) return null;
                  return (
                    <TimelineBlock
                      key="resize-preview"
                      rowId={resizeState.blockId}
                      name={block.name}
                      imageUrl={block.imageUrl}
                      objectType={block.objectType}
                      startIdx={preview.startIdx}
                      endIdx={preview.endIdx}
                      rowIdx={block.rowIdx}
                      columnWidth={COLUMN_WIDTH}
                      rowHeight={ROW_HEIGHT}
                      isSelected={true}
                      isGlobal={block.isGlobal}
                      rowType={block.rowType}
                      isDragPreview
                      onSelect={() => {}}
                      onResizeStart={() => {}}
                    />
                  );
                })()}

                {/* ドラッグオーバーレイ（グリッド内 absolute 配置） */}
                {activeDragBlock && dragDelta && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${activeDragBlock.startIdx * COLUMN_WIDTH + dragDelta.x}px`,
                      top: `${activeDragBlock.rowIdx * ROW_HEIGHT + dragDelta.y}px`,
                      width: `${(activeDragBlock.endIdx - activeDragBlock.startIdx + 1) * COLUMN_WIDTH}px`,
                      height: `${ROW_HEIGHT}px`,
                      boxSizing: 'border-box',
                      backgroundColor: 'rgba(100, 150, 255, 0.7)',
                      border: `2px solid ${theme.accentHighlight}`,
                      borderRadius: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '0 8px',
                      overflow: 'hidden',
                      pointerEvents: 'none',
                      zIndex: 100,
                    }}
                  >
                    {activeDragBlock.imageUrl ? (
                      <img
                        src={activeDragBlock.imageUrl}
                        alt=""
                        style={{
                          flexShrink: 0,
                          width: '18px',
                          height: '18px',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          borderRadius: '2px',
                          border: `1px solid ${theme.border}`,
                        }}
                      />
                    ) : null}
                    <span
                      style={{
                        flex: 1,
                        fontSize: '10px',
                        color: theme.textPrimary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        userSelect: 'none',
                      }}
                    >
                      {activeDragBlock.name}
                    </span>
                  </div>
                )}
              </div>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
};
