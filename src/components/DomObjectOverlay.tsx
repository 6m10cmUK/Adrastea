import { forwardRef, memo, useCallback, useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { BoardObject, Scene, Character, Asset } from '../types/adrastea.types';
import { GRID_SIZE, MIN_SCALE, MAX_SCALE } from './Board';
import { DropdownMenu, AdModal } from './ui';
import { shortcutLabel } from './ui/DropdownMenu';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { useObjectContextMenu } from './useObjectContextMenu';
import { useCharacterContextMenu } from './useCharacterContextMenu';
import { handleClipboardImport } from '../hooks/usePasteHandler';
import { generateDuplicateName } from '../utils/nameUtils';
import { resolveAssetId, useAssets } from '../hooks/useAssets';
import { theme } from '../styles/theme';
import { hasRole } from '../config/permissions';
import { EditableStatusBar } from './status/EditableStatusBar';
import { isLightColor, formatInitiative } from './status/statusDisplayUtils';

// --- フラグ・定数 ---
/** キャラ駒ホバー中のメモスクロール時にBoardのズームを抑止するカウンタ（参照カウント方式） */
export let __blockBoardWheelCount = 0;

/** 盤面ステータス枠の「まだスクロールできる」ヒント用フェード帯の高さ */
const BOARD_STATUS_SCROLL_FADE_PX = 36;

const MIN_SIZE_PX = 0.5; // 0.01グリッド単位 = 0.5px
const EDGE_RATIO = 0.15;        // 要素サイズの 15% をエッジ判定に使う
const EDGE_MIN_PX = 6;          // スクリーン上の最小エッジ幅
const EDGE_MAX_PX = 28;         // スクリーン上の最大エッジ幅

// --- Props ---
interface DomObjectOverlayProps {
  objects: BoardObject[];
  selectedObjectId?: string | null;
  selectedObjectIds?: string[];
  activeScene?: Scene | null;
  stageRef: React.RefObject<any>;
  onMoveObject: (id: string, x: number, y: number) => void;
  onSelectObject: (id: string) => void;
  onEditObject: (id: string) => void;
  onResizeObject?: (id: string, width: number, height: number) => void;
  onRotateObject?: (id: string, rotation: number) => void;
  onSyncObjectSize?: (id: string, width: number, height: number) => void;
  characters?: Character[];
  onUpdateCharacterBoardPosition?: (charId: string, x: number, y: number) => void;
  currentUserId?: string;
  onSelectCharacter?: (charId: string) => void;
  onDoubleClickCharacter?: (charId: string) => void;
  selectedCharacterId?: string | null;
}

// --- ユーティリティ ---
export function colorToDataUrl(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/></svg>`)}`;
}

function snapToGrid(val: number, fine = false): number {
  const snap = fine ? GRID_SIZE * 0.01 : GRID_SIZE;
  return Math.round(val / snap) * snap;
}

interface Edge { top: boolean; bottom: boolean; left: boolean; right: boolean }

function getEdge(localX: number, localY: number, w: number, h: number): Edge | null {
  const tx = Math.min(EDGE_MAX_PX, Math.max(EDGE_MIN_PX, w * EDGE_RATIO));
  const ty = Math.min(EDGE_MAX_PX, Math.max(EDGE_MIN_PX, h * EDGE_RATIO));
  const top = localY < ty;
  const bottom = localY > h - ty;
  const left = localX < tx;
  const right = localX > w - tx;
  if (!top && !bottom && !left && !right) return null;
  return { top, bottom, left, right };
}

// リサイズカーソルを8方向で定義。インデックスは45度刻みの方向（0=N, 1=NE, 2=E, ...）
const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];

function edgeToCursor(edge: Edge | null, rotationDeg = 0): string {
  if (!edge) return 'move';
  const { top, bottom, left, right } = edge;
  // エッジの基本方向をインデックスに変換（0=N, 1=NE, 2=E, ...）
  let baseIdx: number;
  if (top && left) baseIdx = 7;       // NW → nwse
  else if (top && right) baseIdx = 1; // NE → nesw
  else if (bottom && left) baseIdx = 5; // SW → nesw
  else if (bottom && right) baseIdx = 3; // SE → nwse
  else if (top) baseIdx = 0;          // N → ns
  else if (right) baseIdx = 2;        // E → ew
  else if (bottom) baseIdx = 4;       // S → ns
  else if (left) baseIdx = 6;         // W → ew
  else return 'move';
  // 回転を45度刻みのステップに変換して加算
  const rotSteps = Math.round(rotationDeg / 45) % 8;
  const idx = ((baseIdx + rotSteps) % 8 + 8) % 8;
  return RESIZE_CURSORS[idx];
}

// --- リサイズ状態 ---
interface ResizeState {
  edge: Edge;
  startPointerX: number;
  startPointerY: number;
  origPxX: number;
  origPxY: number;
  origPxW: number;
  origPxH: number;
}

// --- 回転状態 ---
interface RotateState {
  centerX: number;  // オブジェクト中心のスクリーン座標
  centerY: number;
  startAngle: number; // ドラッグ開始時の角度
  origRotation: number; // ドラッグ開始時の rotation 値
}

// 回転カーソル（SVG data URL）
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9'/%3E%3Cpath d='M12 3l4 0 0 4'/%3E%3C/svg%3E") 12 12, pointer`;

/** 角度を45度刻みにスナップ（Shift で自由回転） */
function snapRotation(deg: number, free: boolean): number {
  if (free) return ((Math.round(deg) % 360) + 360) % 360;
  const snapped = Math.round(deg / 45) * 45;
  return ((snapped % 360) + 360) % 360;
}

// --- ドラッグ状態 ---
interface DragState {
  startPointerX: number;
  startPointerY: number;
  origPxX: number;
  origPxY: number;
}

// --- MemoPopupコンポーネント ---
interface MemoPopupProps {
  anchorRef: React.RefObject<Element | null>;
  memo: string;
  secretMemo?: string;
  showSecret?: boolean;
  popupRef: React.RefObject<HTMLDivElement | null>;
  onScrollableChange?: (canScroll: boolean) => void;
}

const MemoPopup: React.FC<MemoPopupProps> = ({ anchorRef, memo, secretMemo, showSecret, popupRef, onScrollableChange }) => {
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [posStyle, setPosStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;

    const rect = anchor.getBoundingClientRect();
    const popupH = popup.offsetHeight;

    // 水平: 右側に十分スペースがあれば右、なければ CSS right プロパティで左に出す
    // 閾値を POPUP_WIDTH に揃える（ズレると幅が狭くなるバグが出る）
    const POPUP_WIDTH = 380;
    const rightAvail = window.innerWidth - rect.right - 16;
    const leftAvail = rect.left - 16;
    const goRight = rightAvail >= POPUP_WIDTH || (rightAvail >= leftAvail && rightAvail >= 100);
    const maxW = Math.min(POPUP_WIDTH, goRight ? rightAvail : leftAvail);

    // 垂直: 要素上端に合わせる。はみ出るなら上に詰める
    let top = rect.top;
    if (top + popupH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - popupH - 8);
    }

    const hStyle: React.CSSProperties = goRight
      ? { left: rect.right + 8 }
      : { right: window.innerWidth - rect.left + 8 };

    setPosStyle({ top, maxWidth: maxW, ...hStyle });
  }, []); // マウント時1回のみ実行

  // posStyle 確定後（maxWidth 適用済み）にスクロール可否を通知
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup || !posStyle) return;
    const canScroll = popup.scrollHeight > popup.clientHeight;
    onScrollableChange?.(canScroll);

    const checkScroll = () => {
      setCanScrollDown(popup.scrollTop + popup.clientHeight < popup.scrollHeight - 2);
      setCanScrollUp(popup.scrollTop > 2);
    };
    checkScroll();
    popup.addEventListener('scroll', checkScroll);
    return () => popup.removeEventListener('scroll', checkScroll);
  }, [posStyle, onScrollableChange]);

  return createPortal(
    <div style={{
      position: 'fixed',
      ...posStyle,
      zIndex: 10000,
      pointerEvents: 'none',
      borderRadius: 4,
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
      overflow: 'hidden',
      visibility: posStyle ? 'visible' : 'hidden',
    }}>
      <div ref={popupRef} style={{
        background: 'rgba(0, 0, 0, 0.72)',
        color: '#fff',
        padding: '8px 10px',
        fontSize: 10,
        lineHeight: 1.5,
        maxHeight: '50vh',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        borderRadius: 4,
      }}>
        {memo && <div>{memo}</div>}
        {showSecret && secretMemo && (
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.2)',
            marginTop: memo ? 8 : 0,
            paddingTop: memo ? 8 : 0,
            color: 'rgba(255,200,100,0.9)',
          }}>
            {secretMemo}
          </div>
        )}
      </div>
      {canScrollUp && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          background: 'linear-gradient(to top, transparent, rgba(0,0,0,0.72))',
          borderRadius: '4px 4px 0 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 4,
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>▲</span>
        </div>
      )}
      {canScrollDown && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 36,
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.72))',
          borderRadius: '0 0 4px 4px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 4,
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>▼</span>
        </div>
      )}
    </div>,
    document.body
  );
};

// --- 共通オブジェクトWrapper ---
const DomObjectWrapper = memo(function DomObjectWrapper({
  obj,
  isSelected,
  isDraggable,
  isResizable,
  stageRef,
  onMove,
  onSelect,
  onEdit,
  onResize,
  onRotate,
  children,
  style: extraStyle,
}: {
  obj: BoardObject;
  isSelected: boolean;
  isDraggable: boolean;
  isResizable: boolean;
  stageRef: React.RefObject<any>;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onResize?: (id: string, width: number, height: number, oldWidth?: number, oldHeight?: number) => void;
  onRotate?: (id: string, rotation: number) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const pxX = obj.x * GRID_SIZE;
  const pxY = obj.y * GRID_SIZE;
  const pxW = obj.width * GRID_SIZE;
  const pxH = obj.height * GRID_SIZE;

  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const rotateRef = useRef<RotateState | null>(null);
  const [localRotation, setLocalRotation] = useState<number | null>(null);
  const localRotationRef = useRef<number | null>(null);

  const rotDeg = localRotation ?? obj.rotation ?? 0;
  const [hovered, setHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const blockingRef = useRef(false);
  const hasMemo = !!(obj.memo && (obj.type === 'panel' || obj.type === 'text'));

  const ctx = useAdrasteaContext();
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      await handleClipboardImport(
        text,
        (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
        ctx.showToast,
        async (data) => {
          const { sort_order: _so, ...rest } = data;
          return ctx.addObject({ ...rest, scene_ids: rest.is_global ? [] : (ctx.activeScene ? [ctx.activeScene.id] : []) });
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
  const { items: ctxMenuItems, confirmModal } = useObjectContextMenu([obj], {
    onClose: () => setContextMenuPos(null),
    onPaste: handlePaste,
    showUndoRedo: true,
  });

  // ホバー終了・アンマウント時にカウンタをクリーンアップ
  useEffect(() => {
    if (!hovered || !hasMemo) {
      if (blockingRef.current) {
        __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
        blockingRef.current = false;
      }
    }
    return () => {
      if (blockingRef.current) {
        __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
        blockingRef.current = false;
      }
    };
  }, [hovered, hasMemo]);

  const handleScrollableChange = useCallback((canScroll: boolean) => {
    if (canScroll && !blockingRef.current) {
      __blockBoardWheelCount++;
      blockingRef.current = true;
    } else if (!canScroll && blockingRef.current) {
      __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
      blockingRef.current = false;
    }
  }, []);

  // ドラッグもリサイズもできないオブジェクトかどうか
  const canDrag = isDraggable && !obj.position_locked;
  const canResize = isResizable && !!onResize && !obj.size_locked;
  const canRotate = isResizable && !!onRotate && !obj.size_locked;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = elRef.current;
    if (!el) return;

    const stage = stageRef.current;
    const scale = stage?.scaleX?.() ?? 1;

    // マウス位置を回転済みオブジェクトのローカル座標系に変換
    const rect = el.getBoundingClientRect();
    const rotR = (obj.rotation ?? 0) * Math.PI / 180;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mdx = e.clientX - cx;
    const mdy = e.clientY - cy;
    const cosNR = Math.cos(-rotR);
    const sinNR = Math.sin(-rotR);
    const stageScale = scale;
    const elW = pxW * stageScale;
    const elH = pxH * stageScale;
    const localX = mdx * cosNR - mdy * sinNR + elW / 2;
    const localY = mdx * sinNR + mdy * cosNR + elH / 2;
    const edge = canResize ? getEdge(localX, localY, elW, elH) : null;

    if (!edge && !canDrag) {
      // ドラッグもリサイズも不可 → Stage を直接ドラッグしてカメラ移動
      e.stopPropagation();
      onSelect(obj.id);
      if (!stage) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const origPos = stage.position();
      document.body.style.cursor = 'grabbing';

      const onPointerMove = (me: PointerEvent) => {
        stage.position({
          x: origPos.x + (me.clientX - startX),
          y: origPos.y + (me.clientY - startY),
        });
        stage.batchDraw();
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.cursor = '';
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      return;
    }

    e.stopPropagation();
    onSelect(obj.id);

    // Alt 押下中は移動・リサイズをブロックし、回転のみ受け付ける
    if (e.altKey) {
      if (!canRotate || !onRotate) return;
      const rect2 = el.getBoundingClientRect();
      const centerX = rect2.left + rect2.width / 2;
      const centerY = rect2.top + rect2.height / 2;
      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
      rotateRef.current = { centerX, centerY, startAngle, origRotation: obj.rotation ?? 0 };
      setIsInteracting(true);
      document.body.style.cursor = ROTATE_CURSOR;
      if (stage?.draggable) stage.draggable(false);

      const onPointerMove = (me: PointerEvent) => {
        const state = rotateRef.current;
        if (!state) return;
        const angle = Math.atan2(me.clientY - state.centerY, me.clientX - state.centerX) * 180 / Math.PI;
        const delta = angle - state.startAngle;
        const raw = state.origRotation + delta;
        const snapped = snapRotation(raw, me.shiftKey);
        setLocalRotation(snapped);
        localRotationRef.current = snapped;
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.cursor = '';
        setIsInteracting(false);
        if (stage) stage.draggable(true);
        const final = localRotationRef.current;
        if (final !== null) onRotate(obj.id, final);
        setLocalRotation(null);
        localRotationRef.current = null;
        rotateRef.current = null;
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      return;
    }

    if (edge && onResize) {
      // リサイズ開始（回転枠: 逆行列でローカル座標に変換、アンカー固定で位置補正）
      if (stage?.draggable) stage.draggable(false);
      resizeRef.current = {
        edge,
        startPointerX: e.clientX / scale,
        startPointerY: e.clientY / scale,
        origPxX: pxX,
        origPxY: pxY,
        origPxW: pxW,
        origPxH: pxH,
      };

      const rot = (obj.rotation ?? 0) * Math.PI / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const cosNeg = Math.cos(-rot);
      const sinNeg = Math.sin(-rot);

      const onPointerMove = (me: PointerEvent) => {
        const rs = resizeRef.current;
        if (!rs || !el) return;
        const currentScale = stage?.scaleX?.() ?? 1;
        const rawDx = me.clientX / currentScale - rs.startPointerX;
        const rawDy = me.clientY / currentScale - rs.startPointerY;

        // マウスデルタをオブジェクトのローカル座標系に変換
        const ldx = rawDx * cosNeg - rawDy * sinNeg;
        const ldy = rawDx * sinNeg + rawDy * cosNeg;

        // ローカル座標系でサイズ変更
        let newW = rs.origPxW;
        let newH = rs.origPxH;
        if (rs.edge.right) newW = Math.max(MIN_SIZE_PX, rs.origPxW + ldx);
        if (rs.edge.left) newW = Math.max(MIN_SIZE_PX, rs.origPxW - ldx);
        if (rs.edge.bottom) newH = Math.max(MIN_SIZE_PX, rs.origPxH + ldy);
        if (rs.edge.top) newH = Math.max(MIN_SIZE_PX, rs.origPxH - ldy);

        // アンカー固定: サイズ変更による中心のローカルオフセットを算出し、
        // 回転行列でワールド座標に変換して position を補正
        let offsetLx = 0, offsetLy = 0;
        if (rs.edge.right) offsetLx = (newW - rs.origPxW) / 2;
        if (rs.edge.left) offsetLx = -(newW - rs.origPxW) / 2;
        if (rs.edge.bottom) offsetLy = (newH - rs.origPxH) / 2;
        if (rs.edge.top) offsetLy = -(newH - rs.origPxH) / 2;

        // ローカルオフセットをワールド座標に回転
        const worldOffX = offsetLx * cosR - offsetLy * sinR;
        const worldOffY = offsetLx * sinR + offsetLy * cosR;

        const newX = rs.origPxX + worldOffX - (newW - rs.origPxW) / 2;
        const newY = rs.origPxY + worldOffY - (newH - rs.origPxH) / 2;

        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        el.style.width = `${newW}px`;
        el.style.height = `${newH}px`;
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (stage?.draggable) stage.draggable(true);

        const rs = resizeRef.current;
        resizeRef.current = null;
        if (!rs || !el) return;

        const fine = upEvent.shiftKey;
        const round = (v: number) => fine ? Math.round(v * 100) / 100 : Math.round(v);
        const finalX = snapToGrid(parseFloat(el.style.left), fine);
        const finalY = snapToGrid(parseFloat(el.style.top), fine);
        const finalW = snapToGrid(parseFloat(el.style.width), fine);
        const finalH = snapToGrid(parseFloat(el.style.height), fine);

        el.style.left = `${finalX}px`;
        el.style.top = `${finalY}px`;

        if (extraStyle?.width || extraStyle?.height) {
          el.style.width = '';
          el.style.height = '';
        } else {
          el.style.width = `${finalW}px`;
          el.style.height = `${finalH}px`;
        }

        onMove(obj.id, round(finalX / GRID_SIZE), round(finalY / GRID_SIZE));
        onResize(obj.id, Math.max(0.01, round(finalW / GRID_SIZE)), Math.max(0.01, round(finalH / GRID_SIZE)));
        setIsInteracting(false);
      };

      setIsInteracting(true);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    } else if (isDraggable && !obj.position_locked) {
      // ドラッグ開始 — 選択済みの全オブジェクトを一緒に動かす
      const selectedIds = ctx.selectedObjectIds ?? [];
      const isMulti = selectedIds.includes(obj.id) && selectedIds.length > 1;
      const dragTargets: { id: string; el: HTMLElement; origX: number; origY: number }[] = [];

      if (isMulti) {
        for (const sid of selectedIds) {
          const targetEl = document.querySelector(`[data-dom-obj-id="${sid}"]`) as HTMLElement | null;
          if (targetEl) {
            dragTargets.push({ id: sid, el: targetEl, origX: parseFloat(targetEl.style.left) || 0, origY: parseFloat(targetEl.style.top) || 0 });
          }
        }
      } else {
        dragTargets.push({ id: obj.id, el, origX: pxX, origY: pxY });
      }

      dragRef.current = {
        startPointerX: e.clientX / scale,
        startPointerY: e.clientY / scale,
        origPxX: pxX,
        origPxY: pxY,
      };

      const onPointerMove = (me: PointerEvent) => {
        const ds = dragRef.current;
        if (!ds) return;
        const currentScale = stage?.scaleX?.() ?? 1;
        const dx = me.clientX / currentScale - ds.startPointerX;
        const dy = me.clientY / currentScale - ds.startPointerY;

        for (const t of dragTargets) {
          t.el.style.left = `${t.origX + dx}px`;
          t.el.style.top = `${t.origY + dy}px`;
        }
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        const ds = dragRef.current;
        dragRef.current = null;
        if (!ds) return;

        const fine = upEvent.shiftKey;
        const round = (v: number) => fine ? Math.round(v * 100) / 100 : Math.round(v);

        for (const t of dragTargets) {
          const finalX = snapToGrid(parseFloat(t.el.style.left), fine);
          const finalY = snapToGrid(parseFloat(t.el.style.top), fine);
          t.el.style.left = `${finalX}px`;
          t.el.style.top = `${finalY}px`;
          onMove(t.id, round(finalX / GRID_SIZE), round(finalY / GRID_SIZE));
        }
        setIsInteracting(false);
      };

      setIsInteracting(true);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
  }, [obj.id, obj.position_locked, obj.size_locked, obj.rotation, pxX, pxY, pxW, pxH, isDraggable, isResizable, canRotate, stageRef, onMove, onSelect, onResize, onRotate]);

  // エッジホバーでカーソル変更（Alt 中は回転カーソル）
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = elRef.current;
    if (!el) return;
    if (e.altKey && canRotate) {
      el.style.cursor = ROTATE_CURSOR;
      return;
    }
    if (canResize) {
      const rect = el.getBoundingClientRect();
      const rotR = (obj.rotation ?? 0) * Math.PI / 180;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const mdx = e.clientX - cx;
      const mdy = e.clientY - cy;
      const cosNR = Math.cos(-rotR);
      const sinNR = Math.sin(-rotR);
      const stage = stageRef.current;
      const s = stage?.scaleX?.() ?? 1;
      const elW = pxW * s;
      const elH = pxH * s;
      const localX = mdx * cosNR - mdy * sinNR + elW / 2;
      const localY = mdx * sinNR + mdy * cosNR + elH / 2;
      const edge = getEdge(localX, localY, elW, elH);
      el.style.cursor = edge ? edgeToCursor(edge, obj.rotation ?? 0) : (canDrag ? 'move' : 'grab');
    }
  }, [canResize, canDrag, canRotate, obj.rotation, pxW, pxH, stageRef]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(obj.id);
  }, [obj.id, onEdit]);

  const fullyLocked = obj.position_locked && obj.size_locked;
  const selectionBoxShadow = isSelected && !fullyLocked
    ? '0 0 0 calc(3px * var(--inv-zoom, 1)) rgba(255,255,255,0.5), 0 0 0 calc(4.5px * var(--inv-zoom, 1)) rgba(60,140,255,0.6)'
    : undefined;

  return (
    <div
      ref={elRef}
      data-dom-obj-id={obj.id}
      style={{
        position: 'absolute',
        left: pxX,
        top: pxY,
        width: pxW,
        height: pxH,
        opacity: obj.opacity,
        pointerEvents: 'auto',
        boxShadow: selectionBoxShadow,
        cursor: canDrag ? 'move' : 'grab',
        transition: isInteracting ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out, width 0.2s ease-out, height 0.2s ease-out',
        transform: rotDeg ? `rotate(${rotDeg}deg)` : undefined,
        transformOrigin: 'center center',
        ...extraStyle,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onDoubleClick={handleDoubleClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
      onWheel={(e) => {
        if (hovered && obj.memo && popupRef.current) {
          const canScroll = popupRef.current.scrollHeight > popupRef.current.clientHeight;
          if (canScroll) {
            e.stopPropagation();
            popupRef.current.scrollTop += e.deltaY;
            return;
          }
        }
        // メモスクロール以外: Stage を直接操作してズーム
        if (__blockBoardWheelCount > 0) return;
        const stage = stageRef.current;
        if (!stage) return;
        e.stopPropagation();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const scaleBy = 1.08;
        const newScale = e.deltaY < 0
          ? Math.min(oldScale * scaleBy, MAX_SCALE)
          : Math.max(oldScale / scaleBy, MIN_SCALE);
        const mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };
        stage.scale({ x: newScale, y: newScale });
        stage.position({
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        });
      }}
    >
      {children}

      {/* ホバー時の白オーバーレイ（移動可能オブジェクトのみ） */}
      {hovered && canDrag && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }} />
      )}

      {/* オブジェクトメモホバーポップアップ */}
      {hovered && obj.memo && (obj.type === 'panel' || obj.type === 'text') && (
        <MemoPopup anchorRef={elRef as React.RefObject<Element | null>} memo={obj.memo} popupRef={popupRef} onScrollableChange={handleScrollableChange} />
      )}

      <DropdownMenu
        mode="context"
        open={contextMenuPos !== null}
        onOpenChange={(open) => { if (!open) setContextMenuPos(null); }}
        position={contextMenuPos ?? { x: 0, y: 0 }}
        items={ctxMenuItems}
        footer={obj.type !== 'foreground' && obj.type !== 'background' ? 'Shift+ドラッグで微調整' : undefined}
      />
      {confirmModal}
    </div>
  );
});

// --- アニメーション画像の Blob URL 共有キャッシュ ---
// 同じ image_asset_id に対して同一の Blob URL を返すことで、シーン切り替え時に
// GIF/APNG アニメーションを途中から再生し続ける。
// refCount で参照管理し、どのコンポーネントも使わなくなったら遅延 revoke する。
// 遅延があるので、シーンA→B で同じ画像が両方にある場合は Blob URL が維持され再生継続。
// シーンBにしかない画像は新規 Blob URL となり最初から再生される。
interface BlobCacheEntry {
  blob: Blob;
  blobUrl: string;
  refCount: number;
  revokeTimer: ReturnType<typeof setTimeout> | null;
}
const blobCache = new Map<string, BlobCacheEntry>();
const pendingFetches = new Map<string, Promise<Blob>>();
const REVOKE_DELAY = 200;

function acquireBlobUrl(imageUrl: string, blob: Blob): string {
  const existing = blobCache.get(imageUrl);
  if (existing) {
    existing.refCount++;
    if (existing.revokeTimer) { clearTimeout(existing.revokeTimer); existing.revokeTimer = null; }
    return existing.blobUrl;
  }
  const blobUrl = URL.createObjectURL(blob);
  blobCache.set(imageUrl, { blob, blobUrl, refCount: 1, revokeTimer: null });
  return blobUrl;
}

function releaseBlobUrl(imageUrl: string): void {
  const entry = blobCache.get(imageUrl);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    entry.revokeTimer = setTimeout(() => {
      // 遅延後もまだ誰も acquire してなければ解放
      if (entry.refCount <= 0) {
        URL.revokeObjectURL(entry.blobUrl);
        blobCache.delete(imageUrl);
      }
    }, REVOKE_DELAY);
  }
}

export function useAnimatedBlobSrc(imageUrl: string | null | undefined): { src: string | null; onError: () => void } {
  // blobCache/preloadedBlobs から blob を取得し、表示用に毎回新しい blob URL を生成する。
  // 同じ blob URL を再利用するとブラウザのアニメーションデコードキャッシュにより
  // GIF/WebP/APNG が再生されない場合があるため、コンポーネントごとに固有の blob URL を持つ。
  const activeImageUrlRef = useRef<string | null>(null);
  const displayBlobUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [blobSrc, setBlobSrc] = useState<string | null>(() => {
    const url = imageUrl ?? null;
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    const existing = blobCache.get(url);
    const blob = existing?.blob ?? preloadedBlobs.get(url) ?? null;
    if (!blob) return null;
    // refCount を上げて blob 保管を維持
    acquireBlobUrl(url, blob);
    // 表示用にフレッシュな blob URL を生成
    const freshUrl = URL.createObjectURL(blob);
    activeImageUrlRef.current = url;
    displayBlobUrlRef.current = freshUrl;
    return freshUrl;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (imageUrl?.startsWith('data:')) {
      if (activeImageUrlRef.current && !activeImageUrlRef.current.startsWith('data:')) {
        releaseBlobUrl(activeImageUrlRef.current);
      }
      if (displayBlobUrlRef.current) {
        URL.revokeObjectURL(displayBlobUrlRef.current);
        displayBlobUrlRef.current = null;
      }
      activeImageUrlRef.current = imageUrl;
      setBlobSrc(imageUrl);
      return;
    }
    if (!imageUrl) {
      if (activeImageUrlRef.current) {
        releaseBlobUrl(activeImageUrlRef.current);
        activeImageUrlRef.current = null;
      }
      if (displayBlobUrlRef.current) {
        URL.revokeObjectURL(displayBlobUrlRef.current);
        displayBlobUrlRef.current = null;
      }
      setBlobSrc(null);
      return;
    }

    // 既に同じ URL で処理済みならスキップ
    if (activeImageUrlRef.current === imageUrl) return;

    const apply = (blob: Blob) => {
      if (!mountedRef.current) return;
      if (activeImageUrlRef.current === imageUrl) return;
      // 前の URL をクリーンアップ
      if (activeImageUrlRef.current) releaseBlobUrl(activeImageUrlRef.current);
      if (displayBlobUrlRef.current) URL.revokeObjectURL(displayBlobUrlRef.current);
      // blob 保管の refCount 管理
      acquireBlobUrl(imageUrl, blob);
      // 表示用にフレッシュな blob URL
      const freshUrl = URL.createObjectURL(blob);
      activeImageUrlRef.current = imageUrl;
      displayBlobUrlRef.current = freshUrl;
      setBlobSrc(freshUrl);
    };

    const existing = blobCache.get(imageUrl);
    if (existing) {
      apply(existing.blob);
    } else {
      const preloaded = preloadedBlobs.get(imageUrl);
      if (preloaded) {
        preloadedBlobs.delete(imageUrl);
        apply(preloaded);
      } else {
        let fetchPromise = pendingFetches.get(imageUrl);
        if (!fetchPromise) {
          fetchPromise = fetch(imageUrl).then(r => r.blob());
          pendingFetches.set(imageUrl, fetchPromise);
          fetchPromise.finally(() => pendingFetches.delete(imageUrl));
        }
        fetchPromise
          .then(blob => apply(blob))
          .catch(() => {
            if (mountedRef.current) setBlobSrc(imageUrl);
          });
      }
    }
  }, [imageUrl]);

  // unmount 時: refCount release + 表示用 blob URL revoke
  useEffect(() => {
    return () => {
      if (activeImageUrlRef.current) { releaseBlobUrl(activeImageUrlRef.current); activeImageUrlRef.current = null; }
      if (displayBlobUrlRef.current) { URL.revokeObjectURL(displayBlobUrlRef.current); displayBlobUrlRef.current = null; }
    };
  }, []);

  const onError = () => {
    // blob URL が revoke された場合、フォールバックして Worker URL を表示
    if (displayBlobUrlRef.current) {
      URL.revokeObjectURL(displayBlobUrlRef.current);
      displayBlobUrlRef.current = null;
    }
    // imageUrl（Worker URL）にフォールバック。Cache-Control: immutable なので追加通信はほぼない
    setBlobSrc(imageUrl || null);

    // バックグラウンドで blob を再 fetch
    if (imageUrl && !imageUrl.startsWith('data:')) {
      const apply = (blob: Blob) => {
        if (!mountedRef.current) return;
        // 表示用にフレッシュな blob URL を生成
        const freshUrl = URL.createObjectURL(blob);
        displayBlobUrlRef.current = freshUrl;
        setBlobSrc(freshUrl);
      };

      const existing = blobCache.get(imageUrl);
      if (existing) {
        apply(existing.blob);
      } else {
        const preloaded = preloadedBlobs.get(imageUrl);
        if (preloaded) {
          preloadedBlobs.delete(imageUrl);
          apply(preloaded);
        } else {
          let fetchPromise = pendingFetches.get(imageUrl);
          if (!fetchPromise) {
            fetchPromise = fetch(imageUrl).then(r => r.blob());
            pendingFetches.set(imageUrl, fetchPromise);
            fetchPromise.finally(() => pendingFetches.delete(imageUrl));
          }
          fetchPromise
            .then(blob => apply(blob))
            .catch(() => {
              // 再 fetch 失敗時は Worker URL のままフォールバック
              if (mountedRef.current) setBlobSrc(imageUrl);
            });
        }
      }
    }
  };

  return {
    src: blobSrc ?? (imageUrl || null),
    onError,
  };
}

/**
 * プリロード用 Blob ストア（blob URL は作らず Blob だけ保持）。
 * useAnimatedBlobSrc が acquire する際に新しい blob URL を生成するため、
 * GIF/APNG/WebP アニメーションがシーン切替時に最初から再生される仕様を維持。
 */
const preloadedBlobs = new Map<string, Blob>();

/**
 * 画像URLリストをバックグラウンドで fetch し preloadedBlobs に保持する。
 * blobCache（表示中の blob URL 管理）とは分離。fetch を省略するためだけに使う。
 */
/** アップロード済みファイルの Blob を preloadedBlobs に直接登録する。fetch を経由しないため CORS の影響を受けない。 */
export function registerPreloadedBlob(url: string, blob: Blob): void {
  if (!url || blobCache.has(url) || preloadedBlobs.has(url)) return;
  preloadedBlobs.set(url, blob);
}

export function preloadImageBlobs(urls: string[]): void {
  for (const url of urls) {
    if (!url || blobCache.has(url) || preloadedBlobs.has(url) || pendingFetches.has(url)) continue;
    const p = fetch(url).then(r => r.blob()).then(blob => {
      if (!blobCache.has(url) && !preloadedBlobs.has(url)) {
        preloadedBlobs.set(url, blob);
      }
      return blob;
    }).catch(() => new Blob());
    pendingFetches.set(url, p);
    p.finally(() => pendingFetches.delete(url));
  }
}

// --- PanelObject (DOM版) ---
const DomPanelObject = memo(function DomPanelObject({
  obj, isSelected, stageRef, onMove, onSelect, onEdit, onResize, onRotate, baseZIndex, assets: _assets,
}: {
  obj: BoardObject; isSelected: boolean;
  stageRef: React.RefObject<any>;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onResize?: (id: string, w: number, h: number) => void;
  onRotate?: (id: string, rotation: number) => void;
  baseZIndex?: number;
  assets?: Asset[];
}) {
  const { src: blobSrc, onError: handleBlobError } = useAnimatedBlobSrc(resolveAssetId(obj.image_asset_id));

  return (
    <DomObjectWrapper
      obj={obj} isSelected={isSelected} isDraggable={!obj.position_locked}
      isResizable={!obj.size_locked} stageRef={stageRef}
      onMove={onMove} onSelect={onSelect} onEdit={onEdit} onResize={onResize} onRotate={onRotate}
      style={{ zIndex: baseZIndex }}
    >
      <div style={{
        width: '100%', height: '100%',
        backgroundColor: obj.color_enabled ? obj.background_color : 'transparent',
        overflow: 'hidden',
      }}>
        {blobSrc ? (
          <img
            src={blobSrc}
            onError={handleBlobError}
            style={{
              width: '100%', height: '100%',
              objectFit: obj.image_fit === 'stretch' ? 'fill' : obj.image_fit,
              display: 'block',
            }}
            draggable={false}
          />
        ) : null}
      </div>
    </DomObjectWrapper>
  );
});

// --- TextObject (DOM版) ---
const DomTextObject = memo(function DomTextObject({
  obj, isSelected, stageRef, onMove, onSelect, onEdit, onResize, onRotate, onSyncSize, baseZIndex,
}: {
  obj: BoardObject; isSelected: boolean;
  stageRef: React.RefObject<any>;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onResize?: (id: string, w: number, h: number) => void;
  onRotate?: (id: string, rotation: number) => void;
  onSyncSize?: (id: string, w: number, h: number) => void;
  baseZIndex?: number;
}) {
  const fontFamily = obj.font_family || 'sans-serif';
  const textStr = obj.text_content || '';
  const letterSpacing = obj.letter_spacing ?? 0;
  const lineHeight = obj.line_height ?? 1.2;
  const contentRef = useRef<HTMLDivElement>(null);

  const verticalAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
  const alignItems = verticalAlignMap[obj.text_vertical_align || 'top'];

  // auto_size のときはサイズをコンテンツに合わせる
  const autoSizeStyle: React.CSSProperties = obj.auto_size ? {
    width: 'max-content',
    height: 'auto',
    whiteSpace: 'pre-wrap',
  } : {};

  // auto_size: 描画サイズを obj.width/height に同期
  useEffect(() => {
    if (!obj.auto_size || !onSyncSize || !contentRef.current) return;
    const el = contentRef.current;
    const observer = new ResizeObserver(() => {
      const w = Math.max(1, Math.round(el.offsetWidth / GRID_SIZE));
      const h = Math.max(1, Math.round(el.offsetHeight / GRID_SIZE));
      if (w !== obj.width || h !== obj.height) {
        onSyncSize(obj.id, w, h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [obj.auto_size, obj.id, obj.width, obj.height, onSyncSize]);

  return (
    <DomObjectWrapper
      obj={obj} isSelected={isSelected} isDraggable={!obj.position_locked}
      isResizable={!obj.size_locked} stageRef={stageRef}
      onMove={onMove} onSelect={onSelect} onEdit={onEdit} onResize={onResize} onRotate={onRotate}
      style={{ ...autoSizeStyle, zIndex: baseZIndex }}
    >
      <div ref={contentRef} style={{
        width: '100%', height: '100%',
        backgroundColor: obj.background_color,
        display: 'flex',
        alignItems,
        fontSize: (typeof obj.font_size === 'number' && !Number.isNaN(obj.font_size) && obj.font_size > 0) ? obj.font_size : 16,
        fontFamily,
        letterSpacing,
        lineHeight,
        color: obj.text_color,
        textAlign: obj.text_align || 'left',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        userSelect: 'none',
        overflow: 'hidden',
        transform: `scale(${obj.scale_x ?? 1}, ${obj.scale_y ?? 1})`,
        transformOrigin: 'top left',
        ...autoSizeStyle,
      }}>
        <div style={{ width: '100%' }}>{textStr}</div>
      </div>
    </DomObjectWrapper>
  );
});

// --- 前景クロスフェード用レイヤー ---
interface FgLayerData {
  key: number;
  src: string;
  fadeOut: boolean;
  onError?: () => void;
}

/** 個別のフェードレイヤー。fadeOut 変化を useEffect で検知して CSS transition を発動 */
const FgLayerItem = memo(function FgLayerItem({
  layer, fgDuration, fgOpacity, objectFit, onFadeOutDone,
}: {
  layer: FgLayerData;
  fgDuration: number;
  fgOpacity: number;
  objectFit: string;
  onFadeOutDone?: (key: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  // マウント時: フェードインアニメーション
  useEffect(() => {
    const el = elRef.current;
    if (!el || fgDuration <= 0) {
      el && (el.style.opacity = String(fgOpacity));
      return;
    }
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${fgDuration}ms ease`;
      requestAnimationFrame(() => {
        el.style.opacity = String(fgOpacity);
      });
    });
  }, []); // マウント時1回のみ

  // fadeOut が true に変わったらフェードアウト → 完了後に通知
  useEffect(() => {
    if (!layer.fadeOut) return;
    const el = elRef.current;
    if (!el) { onFadeOutDone?.(layer.key); return; }
    if (fgDuration <= 0) { onFadeOutDone?.(layer.key); return; }
    el.style.transition = `opacity ${fgDuration}ms ease`;
    el.style.opacity = '0';
    const timer = setTimeout(() => onFadeOutDone?.(layer.key), fgDuration + 100);
    return () => clearTimeout(timer);
  }, [layer.fadeOut, fgDuration, layer.key, onFadeOutDone]);

  return (
    <div
      ref={elRef}
      style={{
        position: 'absolute', inset: 0,
        zIndex: layer.fadeOut ? 0 : 1,
      }}
    >
      <img
        src={layer.src}
        alt=""
        onError={layer.onError}
        style={{ width: '100%', height: '100%', objectFit: objectFit as any, display: 'block' }}
        draggable={false}
      />
    </div>
  );
});

const DomForegroundObject = memo(function DomForegroundObject({
  obj, isSelected, stageRef, onMove, onSelect, onEdit, fadeInDuration, baseZIndex, assets: _assets, activeScene,
}: {
  obj: BoardObject; isSelected: boolean;
  stageRef: React.RefObject<any>;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  fadeInDuration?: number;
  baseZIndex?: number;
  assets?: Asset[];
  activeScene?: Scene | null;
}) {
  const isSolid = !!activeScene?.fg_color_enabled;
  const fgAssetUrl = resolveAssetId(activeScene?.foreground_asset_id ?? null);
  const { src: blobSrc, onError: handleBlobError } = useAnimatedBlobSrc(
    isSolid ? colorToDataUrl(activeScene?.fg_color ?? '#666666') : fgAssetUrl
  );
  const fgDuration = fadeInDuration ?? 0;
  const fgOpacity = activeScene?.foreground_opacity ?? 1;
  const objectFit = obj.image_fit === 'stretch' ? 'fill' as const : obj.image_fit;

  // bgLayers パターン: blobSrc の変化でレイヤーを積み重ねてクロスフェード
  const [fgLayers, setFgLayers] = useState<FgLayerData[]>([]);
  const fgKeyRef = useRef(0);
  const prevSrcRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const src = blobSrc;
    if (src === prevSrcRef.current) {
      return;
    }

    const prevSrc = prevSrcRef.current;
    prevSrcRef.current = src;

    if (fgDuration > 0 && prevSrc) {
      // クロスフェード: 現行をフェードアウトに、新レイヤーを追加（既にフェードアウト中のレイヤーは保持）
      fgKeyRef.current += 1;
      const newKey = fgKeyRef.current;
      setFgLayers(prev => [
        ...prev.map(l => l.fadeOut ? l : { ...l, fadeOut: true }),  // 全既存レイヤーをフェードアウトに
        ...(src ? [{ key: newKey, src, fadeOut: false, onError: handleBlobError }] : []),  // 新レイヤー
      ]);
    } else {
      // 即切替
      fgKeyRef.current += 1;
      setFgLayers(src ? [{ key: fgKeyRef.current, src, fadeOut: false, onError: handleBlobError }] : []);
    }
  }, [blobSrc, fgDuration, handleBlobError]);

  // activeScene から前景の位置・サイズを取得してオブジェクトを上書き
  const fgObj = activeScene ? {
    ...obj,
    x: activeScene.foreground_x ?? obj.x,
    y: activeScene.foreground_y ?? obj.y,
    width: activeScene.foreground_width ?? obj.width,
    height: activeScene.foreground_height ?? obj.height,
  } : obj;

  return (
    <div>
      <DomObjectWrapper
        obj={fgObj} isSelected={isSelected} isDraggable={false}
        isResizable={false} stageRef={stageRef}
        onMove={onMove} onSelect={onSelect} onEdit={onEdit}
        style={{ zIndex: baseZIndex }}
      >
        {fgLayers.map((layer) => (
          <FgLayerItem
            key={layer.key}
            layer={layer}
            fgDuration={fgDuration}
            fgOpacity={fgOpacity}
            objectFit={objectFit}
            onFadeOutDone={(key) => setFgLayers(prev => prev.filter(l => l.key !== key))}
          />
        ))}
      </DomObjectWrapper>
    </div>
  );
});

// --- BackgroundObject (DOM版) ---
// 背景は Board.tsx の BgLayer でクロスフェード付きで描画される。
// DomBackgroundObject は sort_order のレイヤー枠としてのみ存在（描画なし）。
const DomBackgroundObject = memo(function DomBackgroundObject({
  obj: _obj,
}: {
  obj: BoardObject;
  activeScene?: Scene | null;
}) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
});

// --- CharacterLayer (DOM版) ---
const DomCharacterLayer = memo(function DomCharacterLayer({
  characters,
  onUpdatePosition,
  stageRef,
  currentUserId,
  onSelectCharacter,
  onDoubleClickCharacter,
  selectedCharacterId,
  baseZIndex,
  assets: _assets,
}: {
  characters: Character[];
  onUpdatePosition?: (charId: string, x: number, y: number) => void;
  stageRef: React.RefObject<any>;
  currentUserId?: string;
  onSelectCharacter?: (charId: string) => void;
  onDoubleClickCharacter?: (charId: string) => void;
  selectedCharacterId?: string | null;
  baseZIndex?: number;
  assets?: Asset[];
}) {
  // ボード上に表示するキャラをフィルタ: board_visible!=false
  // 配列の順序をそのまま維持（レイヤーパネルの並び順 = z順）
  const visibleChars = characters.filter(c => c.board_visible !== false);

  return (
    <>
      {visibleChars.map((char, idx) => (
        <DomCharacterItem
          key={char.id}
          char={char}
          characters={characters}
          zIndex={baseZIndex != null ? baseZIndex + (visibleChars.length - 1 - idx) : (visibleChars.length - idx)}
          onUpdatePosition={onUpdatePosition}
          stageRef={stageRef}
          currentUserId={currentUserId}
          onSelectCharacter={onSelectCharacter}
          onDoubleClickCharacter={onDoubleClickCharacter}
          isSelected={selectedCharacterId === char.id}
          assets={_assets}
        />
      ))}
    </>
  );
});

// --- CharacterItem (個別キャラクター表示) ---
const DomCharacterItem = memo(function DomCharacterItem({
  char,
  characters,
  onUpdatePosition,
  stageRef,
  currentUserId,
  onSelectCharacter,
  onDoubleClickCharacter,
  isSelected,
  zIndex,
  assets: _assets,
}: {
  char: Character;
  characters: Character[];
  onUpdatePosition?: (charId: string, x: number, y: number) => void;
  stageRef: React.RefObject<any>;
  currentUserId?: string;
  onSelectCharacter?: (charId: string) => void;
  onDoubleClickCharacter?: (charId: string) => void;
  isSelected?: boolean;
  zIndex?: number;
  assets?: Asset[];
}) {
  const imageAssetId = resolveAssetId(char.images[char.active_image_index]?.asset_id ?? null);
  const { src: blobSrc, onError: handleBlobError } = useAnimatedBlobSrc(imageAssetId);
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startPointerX: number; startPointerY: number; origPxX: number; origPxY: number } | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [transferTarget, setTransferTarget] = useState<Character | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const ctx = useAdrasteaContext();
  const { addCharacter, removeCharacter } = ctx;
  const popupRef = useRef<HTMLDivElement>(null);
  const blockingRef = useRef(false);
  const hasMemo = !!(char.memo || (currentUserId === char.owner_id && char.secret_memo));
  const charHandlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      await handleClipboardImport(
        text,
        (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
        ctx.showToast,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ctx.characters?.map(c => c.name),
        ctx.scenarioTexts?.map(t => t.title),
        ctx.updateScene,
      );
    } catch {
      ctx.showToast('クリップボードの読み取りに失敗しました', 'error');
    }
  }, [ctx]);
  const { items: charCtxMenuItems, confirmModal: charConfirmModal } = useCharacterContextMenu(char, {
    currentUserId: currentUserId ?? '',
    onClose: () => setContextMenuPos(null),
    onDuplicate: (c) => {
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = c as any;
      addCharacter({ ...rest, name: generateDuplicateName(c.name, characters?.map((ch: Character) => ch.name) ?? []) });
    },
    onRemove: (charId) => {
      removeCharacter(charId);
    },
    onPaste: charHandlePaste,
    onTransfer: (c) => setTransferTarget(c),
    showUndoRedo: true,
  });

  // ホバー終了・アンマウント時にカウンタをクリーンアップ
  useEffect(() => {
    if (!hovered || !hasMemo) {
      if (blockingRef.current) {
        __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
        blockingRef.current = false;
      }
    }
    return () => {
      if (blockingRef.current) {
        __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
        blockingRef.current = false;
      }
    };
  }, [hovered, hasMemo]);

  const pxX = (char.board_x ?? 0) * GRID_SIZE;
  const pxH = (char.size ?? 5) * GRID_SIZE;

  // board_y は足元座標。上端 = 足元 - サイズ
  const pxY = ((char.board_y ?? 0) - (char.size ?? 5)) * GRID_SIZE;

  const handleScrollableChange = useCallback((canScroll: boolean) => {
    if (canScroll && !blockingRef.current) {
      __blockBoardWheelCount++;
      blockingRef.current = true;
    } else if (!canScroll && blockingRef.current) {
      __blockBoardWheelCount = Math.max(0, __blockBoardWheelCount - 1);
      blockingRef.current = false;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = elRef.current;
    if (!el) return;
    e.stopPropagation();

    // 開始座標を保存
    startPosRef.current = { x: e.clientX, y: e.clientY };

    const stage = stageRef.current;
    const scale = stage?.scaleX?.() ?? 1;

    dragRef.current = {
      startPointerX: e.clientX / scale,
      startPointerY: e.clientY / scale,
      origPxX: pxX,
      origPxY: pxY,
    };
    setIsDragging(true);

    const onPointerMove = (me: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds || !el) return;
      const currentScale = stage?.scaleX?.() ?? 1;
      const dx = me.clientX / currentScale - ds.startPointerX;
      const dy = me.clientY / currentScale - ds.startPointerY;
      el.style.left = `${ds.origPxX + dx}px`;
      el.style.top = `${ds.origPxY + dy}px`;
    };

    const onPointerUp = (me: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const ds = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);
      if (!ds || !el) return;
      const fine = me.shiftKey;
      const finalX = snapToGrid(parseFloat(el.style.left), fine);
      const finalY = snapToGrid(parseFloat(el.style.top), fine);
      el.style.left = `${finalX}px`;
      el.style.top = `${finalY}px`;
      // finalY は上端。足元 = 上端 + 高さ
      onUpdatePosition?.(char.id, finalX / GRID_SIZE, (finalY + pxH) / GRID_SIZE);

      // クリック検出: 移動量が5px未満なら選択
      const sp = startPosRef.current;
      if (sp) {
        const dist = Math.hypot(me.clientX - sp.x, me.clientY - sp.y);
        if (dist < 5) onSelectCharacter?.(char.id);
        startPosRef.current = null;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [char.id, pxX, pxY, pxH, stageRef, onUpdatePosition, onSelectCharacter]);

  return (
    <div
      ref={elRef}
      data-dom-char-id={char.id}
      style={{
        position: 'absolute',
        left: pxX,
        top: pxY,
        height: pxH,
        width: 'max-content',
        cursor: 'move',
        pointerEvents: char.board_visible !== false ? 'auto' : 'none',
        userSelect: 'none',
        filter: hovered ? 'drop-shadow(0 0 6px rgba(255,255,255,0.7))' : undefined,
        transition: isDragging ? 'none' : 'filter 0.1s, left 0.2s ease-out, top 0.2s ease-out, height 0.2s ease-out',
        boxShadow: isSelected ? '0 0 0 calc(3px * var(--inv-zoom, 1)) rgba(255,255,255,0.5), 0 0 0 calc(4.5px * var(--inv-zoom, 1)) rgba(60,140,255,0.6)' : undefined,
        zIndex: zIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onWheel={(e) => {
        if (hovered && hasMemo && popupRef.current) {
          const canScroll = popupRef.current.scrollHeight > popupRef.current.clientHeight;
          if (canScroll) {
            e.stopPropagation();
            popupRef.current.scrollTop += e.deltaY;
            return;
          }
        }
        if (__blockBoardWheelCount > 0) return;
        const stage = stageRef.current;
        if (!stage) return;
        e.stopPropagation();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const scaleBy = 1.08;
        const newScale = e.deltaY < 0
          ? Math.min(oldScale * scaleBy, MAX_SCALE)
          : Math.max(oldScale / scaleBy, MIN_SCALE);
        const mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };
        stage.scale({ x: newScale, y: newScale });
        stage.position({
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        });
      }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickCharacter?.(char.id); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenuPos({ x: e.clientX, y: e.clientY }); }}
    >
      {blobSrc ? (
        <img
          src={blobSrc}
          onError={handleBlobError}
          style={{
            height: '100%',
            width: 'auto',
            display: 'block',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      ) : (
        <div style={{
          height: pxH,
          width: pxH * 0.6,
          background: char.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 24,
          fontWeight: 700,
        }}>
          {char.name.charAt(0)}
        </div>
      )}

      {/* 名前ラベル */}
      <div style={{
        position: 'absolute',
        bottom: -26,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#000',
        fontSize: 22,
        whiteSpace: 'nowrap',
        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
        userSelect: 'none',
        pointerEvents: 'none',
        fontWeight: 600,
      }}>
        {char.name}
      </div>

      {/* ホバーポップアップ（Portal: Board の transform 外に出して要素アンカー表示） */}
      {hovered && (char.memo || (currentUserId === char.owner_id && char.secret_memo)) && (
        <MemoPopup
          anchorRef={elRef as React.RefObject<Element | null>}
          memo={char.memo}
          secretMemo={char.secret_memo}
          showSecret={currentUserId === char.owner_id}
          popupRef={popupRef}
          onScrollableChange={handleScrollableChange}
        />
      )}

      {/* コンテキストメニュー */}
      <DropdownMenu
        mode="context"
        open={contextMenuPos !== null}
        onOpenChange={(open) => { if (!open) setContextMenuPos(null); }}
        position={contextMenuPos ?? { x: 0, y: 0 }}
        items={charCtxMenuItems}
      />
      {charConfirmModal}
      {transferTarget && ctx.members && ctx.members.length > 1 && (
        <AdModal
          title={`「${transferTarget.name}」を譲渡`}
          width="320px"
          onClose={() => setTransferTarget(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {ctx.members
              .filter(m => m.user_id !== currentUserId)
              .map(m => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => {
                    ctx.updateCharacter(transferTarget.id, { owner_id: m.user_id });
                    setTransferTarget(null);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                    background: 'none', border: `1px solid ${theme.borderSubtle}`, borderRadius: '6px',
                    cursor: 'pointer', color: theme.textPrimary, fontSize: '13px', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgHover ?? theme.bgInput; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: theme.bgInput,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', color: theme.textMuted,
                    }}>
                      {(m.display_name ?? '?')[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.display_name ?? 'ユーザー'}</div>
                    <div style={{ fontSize: '10px', color: theme.textMuted }}>{m.role}</div>
                  </div>
                </button>
              ))}
          </div>
        </AdModal>
      )}
    </div>
  );
});

// --- 安定 key 生成 ---
// シーン間で DOM を使い回すため、obj.id ではなく type + image_asset_id + 座標近接性で key を割り当てる。
// 同じ type & 同じ image_asset_id のオブジェクト同士を優先マッチし、GIF アニメーションを継続させる。
// 同じ image_asset_id が複数ある場合は座標が近い順でインデックスを付与。
interface PrevSlotInfo { x: number; y: number }

function generateStableKeys(
  objects: BoardObject[],
  prevSlots: React.MutableRefObject<Map<string, PrevSlotInfo>>,
): { obj: BoardObject; stableKey: string }[] {
  // type + image_asset_id でグループ化
  const groups = new Map<string, BoardObject[]>();
  for (const obj of objects) {
    const groupKey = `${obj.type}:${obj.image_asset_id ?? ''}`;
    const arr = groups.get(groupKey);
    if (arr) arr.push(obj);
    else groups.set(groupKey, [obj]);
  }

  const result: { obj: BoardObject; stableKey: string }[] = [];
  const slotCounters = new Map<string, number>();

  for (const [groupKey, objs] of groups) {
    // 同グループ内で座標が近いものを前回のスロットに優先マッチ
    // 前回のスロット情報を集める
    const prevSlotsForGroup: { slotKey: string; x: number; y: number }[] = [];
    for (const [slotKey, info] of prevSlots.current) {
      if (slotKey.startsWith(groupKey + ':')) {
        prevSlotsForGroup.push({ slotKey, ...info });
      }
    }

    if (prevSlotsForGroup.length > 0 && objs.length > 0) {
      // 距離ベースのグリーディマッチング
      const remaining = [...objs];
      const usedSlots = new Set<string>();

      for (const slot of prevSlotsForGroup) {
        if (remaining.length === 0) break;
        // 最も近いオブジェクトを見つける
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dx = remaining[i].x - slot.x;
          const dy = remaining[i].y - slot.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        result.push({ obj: remaining[bestIdx], stableKey: slot.slotKey });
        usedSlots.add(slot.slotKey);
        remaining.splice(bestIdx, 1);
      }

      // マッチしなかった残りには新しいスロットキーを付与
      for (const obj of remaining) {
        let idx = slotCounters.get(groupKey) ?? 0;
        let key = `${groupKey}:${idx}`;
        while (usedSlots.has(key)) { idx++; key = `${groupKey}:${idx}`; }
        slotCounters.set(groupKey, idx + 1);
        usedSlots.add(key);
        result.push({ obj, stableKey: key });
      }
    } else {
      // 前回情報なし → 単純にインデックス
      objs.forEach((obj, i) => {
        result.push({ obj, stableKey: `${groupKey}:${i}` });
      });
    }
  }

  // 次回用にスロット情報を更新
  const newSlots = new Map<string, PrevSlotInfo>();
  for (const { obj, stableKey } of result) {
    newSlots.set(stableKey, { x: obj.x, y: obj.y });
  }
  prevSlots.current = newSlots;

  // sort_order 順を維持
  result.sort((a, b) => a.obj.sort_order - b.obj.sort_order);
  return result;
}

// --- DomObjectOverlay 本体 ---
export const DomObjectOverlay = memo(forwardRef<HTMLDivElement, DomObjectOverlayProps>(
  function DomObjectOverlay({
    objects, selectedObjectId, selectedObjectIds = [], activeScene,
    stageRef, onMoveObject, onSelectObject, onEditObject, onResizeObject, onRotateObject, onSyncObjectSize,
    characters = [], onUpdateCharacterBoardPosition, currentUserId, onSelectCharacter, onDoubleClickCharacter,
    selectedCharacterId,
  }, ref) {
    const { assets } = useAssets();
    const ctx = useAdrasteaContext();
    const visibleObjects = objects.filter((o) => o.visible || o.type === 'characters_layer');
    const prevSlotsRef = useRef<Map<string, PrevSlotInfo>>(new Map());
    const boardStatusScrollRef = useRef<HTMLDivElement | null>(null);
    const keyedObjects = generateStableKeys(visibleObjects, prevSlotsRef);

    // wheel イベントを Konva Stage の canvas に転送（DOM オーバーレイがイベントを奪うため）
    // 盤面ステータス枠の上では転送しない（中身をスクロールさせる）
    const handleWheel = useCallback((e: React.WheelEvent) => {
      const t = e.target as Node | null;
      if (boardStatusScrollRef.current && t && boardStatusScrollRef.current.contains(t)) {
        return;
      }
      if (__blockBoardWheelCount > 0) return;
      const stage = stageRef.current;
      if (!stage) return;
      const canvas = stage.container()?.querySelector('canvas');
      if (!canvas) return;
      canvas.dispatchEvent(new WheelEvent('wheel', e.nativeEvent));
    }, [stageRef]);

    const canSeeStatusOverlay = hasRole(ctx.roomRole, 'user');
    const isSubOwnerPlus = hasRole(ctx.roomRole, 'sub_owner');
    const visibleCharacters = useMemo(
      () => characters
        .filter(c => c.board_visible !== false)
        .sort((a, b) => {
          const byInitiative = (b.initiative ?? 0) - (a.initiative ?? 0);
          if (byInitiative !== 0) return byInitiative;
          const byCreated = (a.created_at ?? 0) - (b.created_at ?? 0);
          if (byCreated !== 0) return byCreated;
          return a.id.localeCompare(b.id);
        }),
      [characters],
    );

    const [boardStatusMenuPos, setBoardStatusMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [boardStatusScrollFade, setBoardStatusScrollFade] = useState<{ top: boolean; bottom: boolean }>({
      top: false,
      bottom: false,
    });

    const syncBoardStatusScrollFade = useCallback(() => {
      const el = boardStatusScrollRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const eps = 2;
      setBoardStatusScrollFade({
        top: scrollTop > eps,
        bottom: scrollTop + clientHeight < scrollHeight - eps,
      });
    }, []);

    /** 端を透明に抜いて「まだ中身がある」示す（黒オーバーレイは使わない） */
    const boardStatusScrollMask = useMemo(() => {
      const h = BOARD_STATUS_SCROLL_FADE_PX;
      const { top, bottom } = boardStatusScrollFade;
      if (!top && !bottom) return undefined;
      if (top && bottom) {
        return `linear-gradient(to bottom, transparent 0px, #000 ${h}px, #000 calc(100% - ${h}px), transparent 100%)`;
      }
      if (top) {
        return `linear-gradient(to bottom, transparent 0px, #000 ${h}px, #000 100%)`;
      }
      return `linear-gradient(to bottom, #000 0px, #000 calc(100% - ${h}px), transparent 100%)`;
    }, [boardStatusScrollFade.top, boardStatusScrollFade.bottom]);

    useLayoutEffect(() => {
      if (!canSeeStatusOverlay || !ctx.statusPanelBoardOverlay || visibleCharacters.length === 0) return;
      syncBoardStatusScrollFade();
      const el = boardStatusScrollRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        syncBoardStatusScrollFade();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [
      canSeeStatusOverlay,
      ctx.statusPanelBoardOverlay,
      visibleCharacters.length,
      visibleCharacters,
      syncBoardStatusScrollFade,
    ]);

    const handleBoardStatusPaste = useCallback(async () => {
      try {
        const text = await navigator.clipboard.readText();
        await handleClipboardImport(
          text,
          (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
          ctx.showToast,
          async (data) => {
            const { sort_order: _so, ...rest } = data;
            return ctx.addObject({
              ...rest,
              scene_start_id: ctx.activeScene?.id ?? null,
              scene_end_id: ctx.activeScene?.id ?? null,
            });
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
      <div
        onWheelCapture={handleWheel}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {/* Board.tsx が rAF でこの div の style.transform を直接更新する */}
        <div ref={ref} style={{ transformOrigin: '0 0' }}>
          {keyedObjects.map(({ obj, stableKey }, listIdx) => {
            const isSelected = selectedObjectIds.length > 0
              ? selectedObjectIds.includes(obj.id)
              : obj.id === selectedObjectId;

            const baseZIndex = (listIdx + 1) * 100;

            switch (obj.type) {
              case 'background':
                return (
                  <DomBackgroundObject
                    key={stableKey} obj={obj}
                    activeScene={activeScene}
                  />
                );
              case 'panel':
                return (
                  <DomPanelObject
                    key={stableKey} obj={obj} isSelected={isSelected}
                    stageRef={stageRef}
                    onMove={onMoveObject} onSelect={onSelectObject}
                    onEdit={onEditObject}
                    onResize={obj.size_locked ? undefined : onResizeObject}
                    onRotate={obj.size_locked ? undefined : onRotateObject}
                    baseZIndex={baseZIndex}
                    assets={assets}
                  />
                );
              case 'text':
                return (
                  <DomTextObject
                    key={stableKey} obj={obj} isSelected={isSelected}
                    stageRef={stageRef}
                    onMove={onMoveObject} onSelect={onSelectObject}
                    onEdit={onEditObject}
                    onResize={obj.size_locked ? undefined : onResizeObject}
                    onRotate={obj.size_locked ? undefined : onRotateObject}
                    onSyncSize={onSyncObjectSize}
                    baseZIndex={baseZIndex}
                  />
                );
              case 'foreground':
                return (
                  <DomForegroundObject
                    key={stableKey} obj={obj} isSelected={isSelected}
                    stageRef={stageRef}
                    onMove={onMoveObject} onSelect={onSelectObject}
                    onEdit={onEditObject}
                    fadeInDuration={activeScene?.fg_transition === 'fade'
                      ? activeScene.fg_transition_duration
                      : undefined}
                    baseZIndex={baseZIndex}
                    assets={assets}
                    activeScene={activeScene}
                  />
                );
              case 'characters_layer':
                return (
                  <DomCharacterLayer
                    key={stableKey}
                    characters={characters}
                    onUpdatePosition={onUpdateCharacterBoardPosition}
                    stageRef={stageRef}
                    currentUserId={currentUserId}
                    onSelectCharacter={onSelectCharacter}
                    onDoubleClickCharacter={onDoubleClickCharacter}
                    selectedCharacterId={selectedCharacterId}
                    baseZIndex={baseZIndex}
                    assets={assets}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
        {canSeeStatusOverlay && ctx.statusPanelBoardOverlay && visibleCharacters.length > 0 && (
          <>
          <div
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              bottom: 8,
              width: 260,
              minHeight: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div
              ref={boardStatusScrollRef}
              className="scrollbar-hide"
              onScroll={syncBoardStatusScrollFade}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBoardStatusMenuPos({ x: e.clientX, y: e.clientY });
              }}
              style={{
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingBottom: 8,
                boxSizing: 'border-box',
                ...(boardStatusScrollMask
                  ? {
                      WebkitMaskImage: boardStatusScrollMask,
                      maskImage: boardStatusScrollMask,
                      WebkitMaskSize: '100% 100%',
                      maskSize: '100% 100%',
                    }
                  : {}),
              }}
            >
            {visibleCharacters.map(char => {
              const isOwner = char.owner_id === currentUserId;
              const canEdit = isOwner || isSubOwnerPlus;
              const isPrivate = char.is_status_private && !isOwner && !isSubOwnerPlus;
              const imgUrl = resolveAssetId(char.images[char.active_image_index]?.asset_id) ?? null;
              const initiative = char.initiative ?? 0;
              const textColor = isLightColor(char.color) ? '#000' : '#fff';
              const displayStatuses = !isPrivate ? char.statuses.slice(0, 8) : [];

              return (
                <div
                  key={char.id}
                  style={{
                    display: 'flex',
                    gap: 6,
                    padding: 4,
                    flexShrink: 0,
                    borderLeft: `3px solid ${char.color}`,
                    background: 'rgba(0,0,0,0.55)',
                    pointerEvents: 'auto',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        style={{ width: 48, height: 48, objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          background: char.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 18,
                          fontWeight: 700,
                        }}
                      >
                        {char.name.charAt(0)}
                      </div>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        top: -2,
                        left: -2,
                        background: char.color,
                        color: textColor,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '0 3px',
                        lineHeight: '16px',
                        minWidth: 16,
                        textAlign: 'center',
                      }}
                    >
                      {isPrivate ? '?' : formatInitiative(initiative)}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#fff',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}
                    >
                      {char.name}
                    </span>
                    {displayStatuses.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                        {displayStatuses.map((s, i) => (
                          <EditableStatusBar
                            key={i}
                            charId={char.id}
                            statusIndex={i}
                            status={s}
                            canEdit={canEdit}
                            patchCharacterStatus={ctx.patchCharacterStatus}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          <DropdownMenu
            mode="context"
            open={boardStatusMenuPos !== null}
            onOpenChange={(open) => { if (!open) setBoardStatusMenuPos(null); }}
            position={boardStatusMenuPos ?? { x: 0, y: 0 }}
            items={[
              {
                label: ctx.statusPanelBoardOverlay ? '盤面から非表示' : '盤面に表示',
                onClick: () => {
                  ctx.setStatusPanelBoardOverlay(prev => !prev);
                  setBoardStatusMenuPos(null);
                },
              },
              {
                label: '貼り付け',
                shortcut: shortcutLabel('V'),
                onClick: () => {
                  void handleBoardStatusPaste();
                  setBoardStatusMenuPos(null);
                },
              },
            ]}
          />
          </>
        )}
      </div>
    );
  }
));
