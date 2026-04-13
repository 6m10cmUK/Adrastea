import React, { useRef, useCallback, useState, useEffect, useImperativeHandle, forwardRef, useMemo, memo } from 'react';
import { Stage } from 'react-konva';
import { DomObjectOverlay, useAnimatedBlobSrc, __blockBoardWheelCount, colorToDataUrl } from './DomObjectOverlay';
import { DropdownMenu, shortcutLabel } from './ui/DropdownMenu';
import { objectToClipboardJson } from '../utils/clipboardImport';
import { resolveAssetId, useAssets } from '../hooks/useAssets';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as StageType } from 'konva/lib/Stage';
import type { BoardObject, Scene, Character } from '../types/adrastea.types';
import type { ReactNode } from 'react';

export interface BoardHandle {
  getStage: () => StageType | null;
  getScale: () => number;
  setScale: (scale: number) => void;
  fitToScreen: () => void;
}

interface BoardProps {
  objects?: BoardObject[];
  activeScene?: Scene | null;
  gridVisible?: boolean;
  onToggleGrid?: () => void;
  characters?: Character[];
  onMoveObject?: (id: string, x: number, y: number) => void;
  onSelectObject?: (id: string) => void;
  onEditObject?: (id: string) => void;
  onResizeObject?: (id: string, width: number, height: number) => void;
  onRotateObject?: (id: string, rotation: number) => void;
  onSyncObjectSize?: (id: string, width: number, height: number) => void;
  onUpdateCharacterBoardPosition?: (charId: string, x: number, y: number) => void;
  onSelectCharacter?: (charId: string) => void;
  onDoubleClickCharacter?: (charId: string) => void;
  onPaste?: () => void;
  onSelectBgObject?: (id: string) => void;
  /** false のとき背景右クリックでプロパティを開かず、メニューのコピー/貼付/Undo も不可（object_edit 未満） */
  canEditObjects?: boolean;
  /** false のとき背景メニューからグリッド表示を切り替え不可（scene_edit = sub_owner 以上） */
  canToggleGrid?: boolean;
  onShowToast?: (msg: string, type: 'success' | 'error') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  currentUserId?: string;
  selectedObjectId?: string | null;
  selectedObjectIds?: string[];
  selectedCharacterId?: string | null;
  children?: ReactNode;
}

export const GRID_SIZE = 50;
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 4;

// --- 背景レイヤー ---
interface BgLayerData {
  key: number;
  url: string | null;
  color: string;
  blur: boolean;
  opacity: number;
  fadeOut?: boolean;
}

const BgLayer = memo(function BgLayer({ layer, duration }: { layer: BgLayerData; duration: number }) {
  const { src: blobSrc, onError: handleBlobError } = useAnimatedBlobSrc(layer.url);
  const [visible, setVisible] = useState(layer.fadeOut || duration <= 0);

  // フェードアウト層: ref で opacity → 0
  const fadeOutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!layer.fadeOut || !fadeOutRef.current || duration <= 0) return;
    const el = fadeOutRef.current;
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${duration}ms ease`;
      el.style.opacity = '0';
    });
  }, [layer.fadeOut, duration]);

  // フェードイン層: blobSrc が来たら visible に
  useEffect(() => {
    if (layer.fadeOut || visible || duration <= 0) return;
    if (blobSrc || layer.color !== 'transparent') {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [blobSrc, visible, layer.color, duration, layer.fadeOut]);

  return (
    <div
      ref={layer.fadeOut ? fadeOutRef : undefined}
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundColor: layer.color,
        // フェードアウト層: opacity は ref で操作するので initial 値のみ設定
        // フェードイン層: visible state で制御
        ...(layer.fadeOut
          ? { opacity: layer.opacity }
          : { opacity: visible ? layer.opacity : 0, transition: duration > 0 ? `opacity ${duration}ms ease` : undefined }
        ),
      }}
    >
      {blobSrc && (
        <img src={blobSrc} onError={handleBlobError} alt="" style={{
          width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block',
          filter: layer.blur ? 'blur(8px)' : 'none',
          transform: layer.blur ? 'scale(1.05)' : 'none',
        }} />
      )}
    </div>
  );
});

// --- DOM グリッドオーバーレイ ---
const DomGridOverlay = memo(function DomGridOverlay({ stageRef, width, height }: { stageRef: React.RefObject<StageType | null>; width: number; height: number }) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const stage = stageRef.current;
      const el = elRef.current;
      if (!stage || !el) return;
      const scale = stage.scaleX();
      const sx = stage.x();
      const sy = stage.y();

      const minor = GRID_SIZE * 5 * scale;
      const major = GRID_SIZE * 10 * scale;
      const ox = sx % major;
      const oy = sy % major;

      // SVG パターン（細線 + 太線）
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${major}' height='${major}'>`
        + `<defs>`
        + `<pattern id='minor' width='${minor}' height='${minor}' patternUnits='userSpaceOnUse'>`
        + `<path d='M ${minor} 0 L 0 0 0 ${minor}' fill='none' stroke='rgba(255,255,255,0.15)' stroke-width='1'/>`
        + `</pattern>`
        + `<pattern id='major' width='${major}' height='${major}' patternUnits='userSpaceOnUse'>`
        + `<rect width='${major}' height='${major}' fill='url(#minor)'/>`
        + `<path d='M ${major} 0 L 0 0 0 ${major}' fill='none' stroke='rgba(255,255,255,0.25)' stroke-width='1'/>`
        + `</pattern>`
        + `</defs>`
        + `<rect width='100%' height='100%' fill='url(#major)'/>`
        + `</svg>`;

      el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      el.style.backgroundSize = `${major}px ${major}px`;
      el.style.backgroundPosition = `${ox}px ${oy}px`;
    };

    const tick = () => { update(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stageRef, width, height]);

  return (
    <div
      ref={elRef}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
});

/** ビューポート中央のグリッド座標を返す */
export function getViewportCenter(stage: StageType | null): { x: number; y: number } {
  if (!stage) return { x: 0, y: 0 };
  const scale = stage.scaleX();
  const stagePos = stage.position();
  const width = stage.width();
  const height = stage.height();
  // ビューポート中心 → 論理座標 → グリッド座標
  const cx = (width / 2 - stagePos.x) / scale;
  const cy = (height / 2 - stagePos.y) / scale;
  return {
    x: Math.round(cx / GRID_SIZE),
    y: Math.round(cy / GRID_SIZE),
  };
}

export const Board = forwardRef<BoardHandle, BoardProps>(function Board({ objects = [], activeScene, gridVisible = true, onToggleGrid, characters, onMoveObject, onSelectObject, onEditObject, onResizeObject, onRotateObject, onSyncObjectSize, onUpdateCharacterBoardPosition, onSelectCharacter, onDoubleClickCharacter, onPaste, onSelectBgObject, canEditObjects = true, canToggleGrid = true, onShowToast, onUndo, onRedo, canUndo, canRedo, currentUserId, selectedObjectId, selectedObjectIds, selectedCharacterId, children }, ref) {
  const stageRef = useRef<StageType>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [bgContextMenuState, setBgContextMenuState] = useState<{ x: number; y: number } | null>(null);

  // 背景クロスフェード: シーン切替時に旧背景をフェードアウト層に、新背景を新DOM でフェードイン
  const bgTransitionDuration = activeScene?.bg_transition === 'fade' ? (activeScene.bg_transition_duration ?? 500) : 0;
  // 背景オブジェクト
  const bgObject = useMemo(() => objects.find(o => o.type === 'background' && o.visible), [objects]);

  // アセットキャッシュからの URL 解決（状態更新依存を確保）
  const { assets } = useAssets();
  const bgImageUrl = useMemo(() => {
    const color = activeScene?.bg_color;
    if (activeScene?.bg_color_enabled && color) return colorToDataUrl(color);
    // 背景画像は activeScene から取得（objects ではなく scenes テーブルで管理）
    const assetId = activeScene?.background_asset_id ?? null;
    if (!assetId) return null;
    return assets.find(a => a.id === assetId)?.url ?? resolveAssetId(assetId) ?? null;
  }, [activeScene?.background_asset_id, activeScene?.bg_color, activeScene?.bg_color_enabled, assets]);

  const prevBgRef = useRef<{ url: string | null; color: string | null; opacity: number; blur: boolean }>({ url: null, color: null, opacity: 1, blur: false });
  if (bgObject) {
    prevBgRef.current = { url: bgImageUrl, color: bgObject.background_color, opacity: bgObject.opacity, blur: !!activeScene?.bg_blur };
  }

  // 背景レイヤー管理: bgObject の image_asset_id 変化でクロスフェード
  const [bgLayers, setBgLayers] = useState<BgLayerData[]>([]);
  const bgKeyRef = useRef(0);
  const prevBgUrlRef = useRef<string | null | undefined>(undefined); // undefined = 未初期化

  useEffect(() => {
    const url = bgImageUrl;
    const color = (activeScene?.bg_color_enabled && activeScene?.bg_color) ? activeScene.bg_color : 'transparent';
    const opacity = bgObject?.opacity ?? 1;
    const blur = !!activeScene?.bg_blur;

    if (url === prevBgUrlRef.current) {
      // 同じ画像: 既存のアクティブレイヤーを更新するだけ
      setBgLayers(prev => prev.map(l => l.fadeOut ? l : { ...l, color, blur, opacity }));
      return;
    }

    const prevUrl = prevBgUrlRef.current;
    prevBgUrlRef.current = url;
    const duration = bgTransitionDuration;

    if (duration > 0 && prevUrl) {
      // クロスフェード: 既存のフェードアウト中レイヤーを即削除、現行をフェードアウトに、新レイヤーを追加
      bgKeyRef.current += 1;
      setBgLayers(prev => [
        ...prev.filter(l => !l.fadeOut).map(l => ({ ...l, fadeOut: true })),
        { key: bgKeyRef.current, url, color, blur, opacity },
      ]);
      setTimeout(() => setBgLayers(prev => prev.filter(l => !l.fadeOut)), duration + 100);
    } else {
      // 即切替
      bgKeyRef.current += 1;
      setBgLayers([{ key: bgKeyRef.current, url, color, blur, opacity }]);
    }
  }, [bgImageUrl, bgObject?.background_color, bgObject?.opacity, activeScene?.bg_blur, bgTransitionDuration]);

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || stageSize.width === 0 || stageSize.height === 0) return;
    // 盤面の表示領域: 16:9 の 100×56 マスを中央に配置
    const targetX = -50 * GRID_SIZE;
    const targetY = -28 * GRID_SIZE;
    const targetW = 100 * GRID_SIZE;
    const targetH = 56 * GRID_SIZE;
    const padding = 0.9;
    const scaleX = (stageSize.width * padding) / targetW;
    const scaleY = (stageSize.height * padding) / targetH;
    const scale = Math.min(Math.min(scaleX, scaleY), MAX_SCALE);
    const centerX = targetX + targetW / 2;
    const centerY = targetY + targetH / 2;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: stageSize.width / 2 - centerX * scale,
      y: stageSize.height / 2 - centerY * scale,
    });
    stage.batchDraw();
  }, [stageSize, objects]);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getScale: () => stageRef.current?.scaleX() ?? 1,
    setScale: (newScale: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      const oldScale = stage.scaleX();
      const centerX = stage.width() / 2;
      const centerY = stage.height() / 2;
      const pointTo = {
        x: (centerX - stage.x()) / oldScale,
        y: (centerY - stage.y()) / oldScale,
      };
      stage.scale({ x: clamped, y: clamped });
      stage.position({
        x: centerX - pointTo.x * clamped,
        y: centerY - pointTo.y * clamped,
      });
      stage.batchDraw();
    },
    fitToScreen,
  }));

  // 初期表示のみ: 背景オブジェクトにフィットするようカメラ配置
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || stageSize.width === 0 || stageSize.height === 0) return;
    if (!stageRef.current) return;
    if (objects.length === 0) return;
    fitToScreen();
    initializedRef.current = true;
  }, [stageSize, fitToScreen, objects]);

  // ResizeObserverでビューポート追従
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      setStageSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    if (__blockBoardWheelCount > 0) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0
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
  }, []);

  // Stageクリック: メニュー閉じ + 背景オブジェクト選択
  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // 右クリック時はスキップ（onContextMenu で処理する）
    if (e.evt.button === 2) return;
    if (bgContextMenuState) setBgContextMenuState(null);
    // Stage 直接クリック（空白領域）→ 背景オブジェクトを選択
    if (e.target === e.target.getStage() && onSelectObject) {
      const bg = objects.find(o => o.type === 'background');
      if (bg) onSelectObject(bg.id);
    }
  }, [bgContextMenuState, objects, onSelectObject]);

  const handleStageDblClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage() && onEditObject) {
      const bg = objects.find(o => o.type === 'background');
      if (bg) onEditObject(bg.id);
    }
  }, [objects, onEditObject]);


  // DOM オーバーレイの ref（rAF で Stage の transform に同期）
  const domLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const sync = () => {
      const stage = stageRef.current;
      const el = domLayerRef.current;
      if (stage && el) {
        const s = stage.scaleX();
        const pos = stage.position();
        el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${s})`;
        el.style.setProperty('--inv-zoom', String(1 / s));
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {/* 背景レイヤー（クロスフェード対応） */}
      {bgLayers.map((layer) => (
        <BgLayer
          key={layer.key}
          layer={layer}
          duration={bgTransitionDuration}
        />
      ))}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        draggable
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onContextMenu={(e: KonvaEventObject<PointerEvent>) => {
          if (e.target === e.target.getStage()) {
            e.evt.preventDefault();
            setBgContextMenuState({ x: e.evt.clientX, y: e.evt.clientY });
            const bgObj = objects.find(o => o.type === 'background');
            if (bgObj && canEditObjects) {
              onSelectBgObject?.(bgObj.id);
            }
          }
        }}
        onDragStart={() => { stageRef.current?.container()?.style.setProperty('cursor', 'grabbing'); }}
        onDragEnd={() => { stageRef.current?.container()?.style.setProperty('cursor', 'grab'); }}
        style={{ backgroundColor: 'transparent', position: 'relative', zIndex: 1, cursor: 'grab' }}
      >
        {/* 背景レイヤー（グリッドは DomGridOverlay に移行） */}
      </Stage>
      {/* オブジェクトオーバーレイ（DOM描画、rAF で Stage に同期） */}
      <DomObjectOverlay
        ref={domLayerRef}
        objects={objects}
        selectedObjectId={selectedObjectId}
        selectedObjectIds={selectedObjectIds}
        activeScene={activeScene}
        stageRef={stageRef}
        onMoveObject={onMoveObject ?? (() => {})}
        onSelectObject={onSelectObject ?? (() => {})}
        onEditObject={onEditObject ?? (() => {})}
        onResizeObject={onResizeObject}
        onRotateObject={onRotateObject}
        onSyncObjectSize={onSyncObjectSize}
        characters={characters}
        currentUserId={currentUserId}
        onUpdateCharacterBoardPosition={onUpdateCharacterBoardPosition}
        onSelectCharacter={onSelectCharacter}
        onDoubleClickCharacter={onDoubleClickCharacter}
        selectedCharacterId={selectedCharacterId}
      />
      {/* グリッドオーバーレイ（DomObjectOverlay の上、pointer-events: none） */}
      {gridVisible && (
        <DomGridOverlay stageRef={stageRef} width={stageSize.width} height={stageSize.height} />
      )}
      {/* 背景右クリックメニュー */}
      <DropdownMenu
        mode="context"
        open={bgContextMenuState !== null}
        onOpenChange={(open) => { if (!open) setBgContextMenuState(null); }}
        position={bgContextMenuState ?? { x: 0, y: 0 }}
        items={(() => {
          const bgObj = objects.find(o => o.type === 'background');
          return [
            {
              label: gridVisible ? 'グリッドを非表示' : 'グリッドを表示',
              disabled: !canToggleGrid,
              onClick: () => {
                if (canToggleGrid) onToggleGrid?.();
                setBgContextMenuState(null);
              },
            },
            'separator' as const,
            {
              label: 'コピー',
              shortcut: shortcutLabel('C'),
              disabled: !bgObj || !canEditObjects,
              onClick: () => {
                if (bgObj && canEditObjects) {
                  navigator.clipboard.writeText(objectToClipboardJson(bgObj, activeScene));
                  onShowToast?.('背景をコピーしました', 'success');
                }
                setBgContextMenuState(null);
              },
            },
            {
              label: '貼り付け',
              shortcut: shortcutLabel('V'),
              disabled: !onPaste || !canEditObjects,
              onClick: () => {
                if (canEditObjects) onPaste?.();
                setBgContextMenuState(null);
              },
            },
            'separator' as const,
            {
              label: '元に戻す',
              shortcut: shortcutLabel('Z'),
              disabled: !canUndo || !canEditObjects,
              onClick: () => { if (canEditObjects) onUndo?.(); setBgContextMenuState(null); },
            },
            {
              label: 'やり直し',
              shortcut: shortcutLabel('⇧Z'),
              disabled: !canRedo || !canEditObjects,
              onClick: () => { if (canEditObjects) onRedo?.(); setBgContextMenuState(null); },
            },
          ];
        })()}
      />
      {children}
    </div>
  );
});
