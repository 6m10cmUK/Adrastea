import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { usePermission } from '../hooks/usePermission';
import { theme } from '../styles/theme';
import { SortableListPanel, SortableListItem, ConfirmModal, Tooltip } from './ui';
import { DropdownMenu, shortcutLabel } from './ui/DropdownMenu';
import { FadeInIcon } from './ui/FadeInIcon';
import type { BgmTrack } from '../types/adrastea.types';
import {
  Trash2, Plus, Music,
  Volume2, VolumeX, Repeat, Zap,
} from 'lucide-react';
import { AssetLibraryModal } from './AssetLibraryModal';
import { bgmToClipboardJson, parseClipboardData, pasteBgmToScene } from '../utils/clipboardImport';
import { calcInsertSortOrder } from '../utils/sortOrder';

const extractVideoId = (url: string): string => {
  const match = url.match(/(?:youtu\.be\/|v=)([^&\s]+)/);
  return match ? match[1] : url;
};

/** Dropbox / Google Drive の共有URLを直接再生可能なURLに変換する */
const normalizeAudioUrl = (url: string): string => {
  // Dropbox: ?dl=0 → ?dl=1（なければ追加）
  if (url.includes('dropbox.com/')) {
    const u = new URL(url);
    u.searchParams.set('dl', '1');
    return u.toString();
  }
  // Google Drive: /file/d/FILE_ID/view → uc?export=download&id=FILE_ID
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  // Google Drive: open?id=FILE_ID
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?.*id=([^&]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
  }
  return url;
};

// --- Volume Fader (OBS-style) ---
function VolumeFader({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  // 外部から value が変わったら（ドラッグ中でなければ）ローカルに反映
  useEffect(() => {
    if (!dragging) setLocalValue(value);
  }, [value, dragging]);

  const displayValue = dragging ? localValue : value;
  const pct = Math.round(displayValue * 100);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '16px', touchAction: 'none' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: theme.bgInput,
        border: `1px solid ${theme.border}`,
      }} />
      <div style={{
        position: 'absolute', top: 1, bottom: 1, left: 1,
        width: `${pct}%`,
        background: theme.accent,
        opacity: 0.7,
        transition: 'width 0.05s',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '4px', fontSize: '10px', color: theme.textMuted,
        pointerEvents: 'none',
      }}>
        {pct}%
      </div>
      <input
        type="range"
        min="0" max="1" step="0.01"
        value={displayValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => { setDragging(false); onChange(localValue); }}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          opacity: 0, cursor: 'pointer', margin: 0,
        }}
      />
    </div>
  );
}

// --- BgmTrackRow ---
interface BgmTrackRowProps {
  track: BgmTrack;
  currentSceneId: string;
  isSelected: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onUpdate: (id: string, data: Partial<BgmTrack>) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  renamingId?: string | null;
  renameValue?: string;
  onRenameChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}

function BgmTrackRow({
  track, currentSceneId, isSelected, onClick, onUpdate, onContextMenu,
  renamingId, renameValue, onRenameChange, onRenameSubmit, onRenameCancel,
}: BgmTrackRowProps) {
  const [localMuted, setLocalMuted] = useState(false);

  const iconBtn: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '3px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };

  const effectiveVolume = localMuted ? 0 : track.bgm_volume;

  const isAutoPlay = currentSceneId ? track.auto_play_scene_ids.includes(currentSceneId) : false;
  const trackTooltip = [
    `シーン切替時自動再生: ${isAutoPlay ? 'オン' : 'オフ'}`,
    `ループ再生: ${track.bgm_loop ? 'オン' : 'オフ'}`,
    `フェードイン: ${track.fade_in ? `${track.fade_in_duration}ms` : 'オフ'}`,
  ].join('\n');

  return (
    <div onContextMenu={onContextMenu ? (e) => onContextMenu(e, track.id) : undefined} title={trackTooltip}>
      <SortableListItem
        id={track.id}
        onClick={(e) => onClick(track.id, e)}
        isSelected={isSelected}
        dataAttributes={{ 'data-track-id': track.id }}
        layout="grid"
      >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          marginBottom: '4px', fontSize: '12px',
        }}>
          {/* Play/Pause */}
          <Tooltip label={track.is_playing && !track.is_paused ? '一時停止' : '再生'}>
            <button
              style={{ ...iconBtn, color: track.is_playing && !track.is_paused ? theme.accent : theme.textSecondary }}
              onClick={(e) => {
                e.stopPropagation();
                if (!track.is_playing) {
                  onUpdate(track.id, { is_playing: true, is_paused: false });
                } else if (track.is_paused) {
                  onUpdate(track.id, { is_paused: false });
                } else {
                  onUpdate(track.id, { is_paused: true });
                }
              }}
            >
              {track.is_playing && !track.is_paused
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1" /><rect x="14" y="3" width="5" height="18" rx="1" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3v18l15-9z" /></svg>}
            </button>
          </Tooltip>

          {/* Stop */}
          <Tooltip label="停止">
            <button
              style={{ ...iconBtn, color: !track.is_playing ? theme.accent : theme.textSecondary }}
              onClick={(e) => { e.stopPropagation(); onUpdate(track.id, { is_playing: false, is_paused: false }); }}
              disabled={!track.is_playing}
            >
              <div style={{ width: 11, height: 11, background: 'currentColor', borderRadius: 1 }} />
            </button>
          </Tooltip>

          {/* Track name */}
          {renamingId === track.id ? (
            <input
              autoFocus
              value={renameValue ?? ''}
              onChange={(e) => onRenameChange?.(e.target.value)}
              onBlur={() => onRenameSubmit?.()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit?.();
                else if (e.key === 'Escape') onRenameCancel?.();
              }}
              onClick={(e) => e.stopPropagation()}
              maxLength={128}
              style={{
                flex: 1, minWidth: 0,
                background: theme.bgDeep, border: `1px solid ${theme.border}`,
                color: theme.textPrimary, fontSize: '12px', padding: '1px 4px',
                outline: 'none',
              }}
            />
          ) : (
            <span
              style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: theme.textPrimary, fontSize: '12px',
              }}
            >
              {track.name}
            </span>
          )}

          <Tooltip label="自動再生">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!currentSceneId) return;
                const isAuto = track.auto_play_scene_ids.includes(currentSceneId);
                onUpdate(track.id, {
                  auto_play_scene_ids: isAuto
                    ? track.auto_play_scene_ids.filter(id => id !== currentSceneId)
                    : [...track.auto_play_scene_ids, currentSceneId],
                });
              }}
              style={{ ...iconBtn, color: currentSceneId && track.auto_play_scene_ids.includes(currentSceneId) ? theme.accent : theme.textMuted, opacity: currentSceneId && track.auto_play_scene_ids.includes(currentSceneId) ? 1 : 0.3 }}
            >
              <Zap size={13} />
            </button>
          </Tooltip>
          <Tooltip label="ループ">
            <button
              aria-label="ループ"
              onClick={(e) => { e.stopPropagation(); onUpdate(track.id, { bgm_loop: !track.bgm_loop }); }}
              style={{ ...iconBtn, color: track.bgm_loop ? theme.accent : theme.textMuted, opacity: track.bgm_loop ? 1 : 0.3 }}
            >
              <Repeat size={13} />
            </button>
          </Tooltip>
          <Tooltip label={track.fade_in ? `フェードイン ${track.fade_in_duration}ms` : 'フェードインなし'}>
            <button
              aria-label="フェードイン"
              onClick={(e) => { e.stopPropagation(); onUpdate(track.id, { fade_in: !track.fade_in }); }}
              style={{ ...iconBtn, color: track.fade_in ? theme.accent : theme.textMuted, opacity: track.fade_in ? 1 : 0.3 }}
            >
              <FadeInIcon size={18} />
            </button>
          </Tooltip>
        </div>

        {/* Fader row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Tooltip label={localMuted ? 'ミュート解除' : 'ミュート'}>
            <button
              style={{
                ...iconBtn,
                color: localMuted ? theme.danger : theme.textSecondary,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setLocalMuted(!localMuted);
                onUpdate(track.id, { bgm_volume: localMuted ? track.bgm_volume : 0 });
              }}
            >
              {localMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </Tooltip>

          <div style={{ flex: 1 }}>
            <VolumeFader
              value={effectiveVolume}
              onChange={(v) => {
                if (localMuted && v > 0) setLocalMuted(false);
                onUpdate(track.id, { bgm_volume: v });
              }}
            />
          </div>
        </div>
      </div>
    </SortableListItem>
    </div>
  );
}

// --- BgmPanel ---
export function BgmPanel() {
  const { bgms, addBgm, updateBgm, removeBgm, reorderBgms, activeScene, setEditingBgmId, clearAllEditing, showToast, panelSelection, setPanelSelection, keyboardActionsRef } = useAdrasteaContext();
  const { can } = usePermission();
  const canManageBgm = can('bgm_manage');

  // 現在のシーンに属する or 再生中のBGMを表示
  const currentSceneId = activeScene?.id ?? '';
  // bgms は useLocalStorageOrder + DB sort_order で既にルーム全体の順序が付いている。ここでは絞り込みのみ（再ソートしない）
  const filteredBgms = useMemo(
    () => bgms.filter(b => b.scene_ids.includes(currentSceneId)),
    [bgms, currentSceneId]
  );

  // ローカルstate で楽観的UI更新
  const [localBgms, setLocalBgms] = useState<BgmTrack[]>([]);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[] | null>(null);
  const prevFilteredRef = useRef<BgmTrack[]>([]);

  useEffect(() => {
    if (prevFilteredRef.current !== filteredBgms) {
      prevFilteredRef.current = filteredBgms;
      setLocalBgms(filteredBgms);
    }
  }, [filteredBgms]);

  const selectedIds = panelSelection?.panel === 'bgm' ? panelSelection.ids : [];

  const handleItemClick = useCallback((id: string, e: React.MouseEvent) => {
    const currentIds = panelSelection?.panel === 'bgm' ? panelSelection.ids : [];
    if (e.shiftKey && currentIds.length > 0) {
      const lastSelected = currentIds[currentIds.length - 1];
      const anchorIdx = localBgms.findIndex(b => b.id === lastSelected);
      const targetIdx = localBgms.findIndex(b => b.id === id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const newIds = localBgms.slice(start, end + 1).map(b => b.id);
        setPanelSelection({ panel: 'bgm', ids: newIds });
        if (newIds.length === 1) setEditingBgmId(newIds[0]);
      }
    } else if (e.metaKey || e.ctrlKey) {
      const newIds = currentIds.includes(id)
        ? currentIds.filter(i => i !== id)
        : [...currentIds, id];
      setPanelSelection(newIds.length > 0 ? { panel: 'bgm', ids: newIds } : null);
      if (newIds.length === 1) setEditingBgmId(newIds[0]);
      else setEditingBgmId(null);
    } else {
      clearAllEditing();
      setEditingBgmId(id);
      setPanelSelection({ panel: 'bgm', ids: [id] });
    }
  }, [localBgms, panelSelection, clearAllEditing, setEditingBgmId, setPanelSelection]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // 複数選択中なら選択アイテム全部、そうでなければドラッグしたもの1つ
    const dragIds = selectedIds.includes(activeId) && selectedIds.length > 1
      ? selectedIds
      : [activeId];
    const dragSet = new Set(dragIds);
    if (dragSet.has(overId)) return;

    // ドラッグ対象を除外した残りリスト
    const rest = localBgms.filter(item => !dragSet.has(item.id));
    const draggedItems = localBgms.filter(item => dragSet.has(item.id));

    // 挿入位置を計算
    const activeOrigIdx = localBgms.findIndex(item => item.id === activeId);
    const overOrigIdx = localBgms.findIndex(item => item.id === overId);
    const overIdx = rest.findIndex(item => item.id === overId);
    if (overIdx < 0) return;
    const insertIdx = activeOrigIdx < overOrigIdx ? overIdx + 1 : overIdx;

    rest.splice(insertIdx, 0, ...draggedItems);
    setLocalBgms(rest);
    reorderBgms(rest.map(item => item.id));
  }, [localBgms, selectedIds, reorderBgms]);

  const hasPlaying = localBgms.some(b => b.is_playing && !b.is_paused);
  const hasAnyPlaying = localBgms.some(b => b.is_playing);

  const handleBulkPlay = useCallback(() => {
    localBgms.forEach(b => {
      if (!b.is_playing || b.is_paused) updateBgm(b.id, { is_playing: true, is_paused: false });
    });
  }, [localBgms, updateBgm]);

  const handleBulkPause = useCallback(() => {
    localBgms.forEach(b => {
      if (b.is_playing && !b.is_paused) updateBgm(b.id, { is_paused: true });
    });
  }, [localBgms, updateBgm]);

  const handleBulkStop = useCallback(() => {
    localBgms.forEach(b => {
      if (b.is_playing) updateBgm(b.id, { is_playing: false, is_paused: false });
    });
  }, [localBgms, updateBgm]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId?: string } | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleContextMenu = useCallback((e: React.MouseEvent, trackId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (trackId && !selectedIds.includes(trackId)) {
      setPanelSelection({ panel: 'bgm', ids: [trackId] });
      setEditingBgmId(trackId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  }, [selectedIds, setPanelSelection, setEditingBgmId]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      updateBgm(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  }, [renamingId, renameValue, updateBgm]);

  const handleCopy = useCallback(() => {
    const targetIds = contextMenu?.trackId
      ? (selectedIds.includes(contextMenu.trackId) ? selectedIds : [contextMenu.trackId])
      : selectedIds;
    if (targetIds.length === 0) return;
    const tracks = bgms.filter(b => targetIds.includes(b.id));
    if (tracks.length > 0) {
      navigator.clipboard.writeText(bgmToClipboardJson(tracks));
      showToast(tracks.length > 1 ? `${tracks.length}件のBGMをコピーしました` : `${tracks[0].name} をコピーしました`, 'success');
    }
    setContextMenu(null);
  }, [contextMenu, bgms, selectedIds, showToast]);

  const handlePaste = useCallback(async () => {
    if (!canManageBgm) return;
    try {
      const text = await navigator.clipboard.readText();
      const result = parseClipboardData(text);
      if (result?.type === 'bgm') {
        const lastSelId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
        let so = calcInsertSortOrder(bgms, lastSelId, b => b.sort_order ?? 0) ?? bgms.length;
        const wrappedAddBgm = async (data: Partial<BgmTrack>) => {
          const id = await addBgm({ ...data, sort_order: so });
          so += 0.001;
          return id;
        };
        await Promise.all(result.data.map(d => pasteBgmToScene(d, activeScene?.id ?? null, { bgms, updateBgm, addBgm: wrappedAddBgm })));
        const count = result.data.length;
        showToast(count > 1 ? `${count}件のBGMをインポートしました` : `BGM "${result.data[0]?.name ?? 'BGM'}" をインポートしました`, 'success');
      }
    } catch {
      showToast('クリップボードの読み取りに失敗しました', 'error');
    }
  }, [addBgm, showToast, activeScene, canManageBgm, bgms, selectedIds]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingRemoveIds) return;
    await Promise.all(pendingRemoveIds.map(id => removeBgm(id, activeScene?.id)));
    setPendingRemoveIds(null);
  }, [pendingRemoveIds, removeBgm, activeScene?.id]);

  // グローバルキーボードショートカットにハンドラ登録
  useEffect(() => {
    if (selectedIds.length > 0) {
      keyboardActionsRef.current = {
        copy: () => {
          const tracks = bgms.filter(b => selectedIds.includes(b.id));
          if (tracks.length > 0) {
            navigator.clipboard.writeText(bgmToClipboardJson(tracks));
            showToast(tracks.length > 1 ? `${tracks.length}件のBGMをコピーしました` : `${tracks[0].name} をコピーしました`, 'success');
          }
        },
        paste: canManageBgm ? handlePaste : undefined,
        delete: canManageBgm ? () => {
          if (selectedIds.length > 0) {
            setPendingRemoveIds(selectedIds);
          }
        } : undefined,
      };
    }
    return () => {
      if (panelSelection?.panel === 'bgm') {
        keyboardActionsRef.current = {};
      }
    };
  }, [selectedIds, bgms, showToast, addBgm, panelSelection, keyboardActionsRef, canManageBgm, handlePaste]);

  const handleAddFromPicker = useCallback(async (url: string, _assetId?: string, assetTitle?: string) => {
    if (!activeScene) return;
    const normalizedUrl = normalizeAudioUrl(url);
    const videoId = extractVideoId(normalizedUrl);
    const isYoutube = videoId !== normalizedUrl;
    const source = isYoutube ? videoId : normalizedUrl;

    // 同じソースの既存トラックがあれば scene_ids に追加するだけ
    const existing = bgms.find(b => b.bgm_source === source);
    if (existing) {
      if (!existing.scene_ids.includes(activeScene.id)) {
        updateBgm(existing.id, {
          scene_ids: [...existing.scene_ids, activeScene.id],
          auto_play_scene_ids: [...existing.auto_play_scene_ids, activeScene.id],
        });
      }
      setShowAddPicker(false);
      return;
    }

    const lastSelId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
    const insertSort = calcInsertSortOrder(bgms, lastSelId, b => b.sort_order ?? 0);

    if (isYoutube) {
      const validTitle = assetTitle && assetTitle !== 'watch' ? assetTitle : null;
      let title = validTitle || videoId;
      if (!validTitle) {
        try {
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
          const data = await res.json();
          if (data.title) title = data.title;
        } catch {
          // タイトル取得失敗時はvideoIdのまま
        }
      }
      await addBgm({ name: title, bgm_type: 'youtube', bgm_source: videoId, scene_ids: [activeScene.id], auto_play_scene_ids: [activeScene.id], sort_order: insertSort });
    } else {
      const name = assetTitle
        || decodeURIComponent(normalizedUrl.split('/').pop()?.split('?')[0] || '新規BGM').replace(/^\d+_/, '');
      await addBgm({ name, bgm_type: 'url', bgm_source: normalizedUrl, scene_ids: [activeScene.id], auto_play_scene_ids: [activeScene.id], sort_order: insertSort });
    }
    setShowAddPicker(false);
  }, [addBgm, updateBgm, bgms, activeScene, selectedIds]);

  return (
    <>
      <div
        data-selection-panel
        style={{ height: '100%' }}
        onContextMenu={(e) => handleContextMenu(e)}
      >
      <SortableListPanel
        title="BGM"
        subtitle={activeScene?.name}
        titleIcon={<Tooltip label="BGM"><Music size={14} /></Tooltip>}
        layout="grid"
        onBackgroundClick={() => {
          setEditingBgmId(null);
          setPanelSelection(null);
        }}
        headerActions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <Tooltip label={hasPlaying ? "全て一時停止" : "全て再生"}>
              <button
                onClick={hasPlaying ? handleBulkPause : handleBulkPlay}
                disabled={localBgms.length === 0}
                style={{
                  background: 'transparent', border: 'none', cursor: localBgms.length > 0 ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', padding: '2px 4px',
                  color: hasAnyPlaying ? theme.accent : theme.textSecondary,
                  opacity: localBgms.length === 0 ? 0.3 : 1,
                }}
              >
                {hasPlaying
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1" /><rect x="14" y="3" width="5" height="18" rx="1" /></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3v18l15-9z" /></svg>}
              </button>
            </Tooltip>
            <Tooltip label="全て停止">
              <button
                onClick={handleBulkStop}
                disabled={!hasAnyPlaying}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', padding: '2px 4px',
                  color: !hasAnyPlaying && localBgms.length > 0 ? theme.accent : theme.textSecondary,
                  opacity: localBgms.length === 0 ? 0.3 : 1,
                }}
              >
                <div style={{ width: 11, height: 11, background: 'currentColor', borderRadius: 1 }} />
              </button>
            </Tooltip>
            <div style={{ width: '1px', height: '14px', background: theme.border, margin: '0 2px', flexShrink: 0 }} />
            <Tooltip label="シーンから除去">
              <button
                onClick={() => selectedIds.length > 0 && setPendingRemoveIds(selectedIds)}
                disabled={selectedIds.length === 0}
                style={{
                  background: 'transparent', border: 'none', cursor: selectedIds.length > 0 ? 'pointer' : 'default',
                  display: canManageBgm ? 'flex' : 'none', alignItems: 'center', padding: '2px 4px',
                  color: theme.danger, opacity: selectedIds.length > 0 ? 1 : 0.3,
                }}
              >
                <Trash2 size={15} />
              </button>
            </Tooltip>
            <Tooltip label="トラック追加">
              <button
                onClick={() => setShowAddPicker(true)}
                aria-label="トラック追加"
                style={{
                  background: 'transparent', border: 'none',
                  color: theme.accent, cursor: 'pointer', display: canManageBgm ? 'flex' : 'none', alignItems: 'center',
                  padding: '2px 4px',
                }}
              >
                <Plus size={15} />
              </button>
            </Tooltip>
          </div>
        }
        items={localBgms}
        onDragEnd={handleDragEnd}
        emptyMessage="トラックがありません"
      >
        {localBgms.map(track => (
          <BgmTrackRow
            key={track.id}
            track={track}
            currentSceneId={currentSceneId}
            isSelected={selectedIds.includes(track.id)}
            onClick={handleItemClick}
            onUpdate={updateBgm}
            onContextMenu={handleContextMenu}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingId(null)}
          />
        ))}
      </SortableListPanel>
      </div>

      {contextMenu && (
        <DropdownMenu
          mode="context"
          open={true}
          onOpenChange={(open) => { if (!open) setContextMenu(null); }}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={(() => {
            const targetIds = contextMenu?.trackId
              ? (selectedIds.includes(contextMenu.trackId) ? selectedIds : [contextMenu.trackId])
              : selectedIds;
            const hasTarget = targetIds.length > 0;
            return [
            {
              label: '新規作成',
              disabled: !canManageBgm,
              onClick: canManageBgm ? () => {
                setShowAddPicker(true);
                setContextMenu(null);
              } : () => {},
            },
            'separator',
            {
              label: targetIds.length > 1 ? `${targetIds.length}件をコピー` : 'コピー',
              shortcut: shortcutLabel('C'),
              disabled: !hasTarget,
              onClick: handleCopy,
            },
            'separator',
            {
              label: targetIds.length > 1 ? `${targetIds.length}件を削除` : '削除',
              shortcut: 'Del',
              danger: true,
              disabled: !hasTarget || !canManageBgm,
              onClick: canManageBgm ? () => {
                setContextMenu(null);
                if (targetIds.length > 0) setPendingRemoveIds(targetIds);
              } : () => {},
            },
            'separator',
            {
              label: '貼り付け',
              shortcut: shortcutLabel('V'),
              onClick: handlePaste,
            },
          ]; })()}
        />
      )}

      {pendingRemoveIds && (() => {
        const removeTracks = bgms.filter(b => pendingRemoveIds.includes(b.id));
        const message = pendingRemoveIds.length === 1
          ? `「${removeTracks[0]?.name ?? 'BGM'}」をこのシーンから除去しますか？`
          : `${pendingRemoveIds.length}件のBGMをこのシーンから除去しますか？`;
        return (
          <ConfirmModal
            message={message}
            confirmLabel="除去"
            danger
            onConfirm={() => {
              if (currentSceneId) {
                pendingRemoveIds.forEach(id => {
                  const track = bgms.find(b => b.id === id);
                  if (track) {
                    updateBgm(id, {
                      scene_ids: track.scene_ids.filter(s => s !== currentSceneId),
                      auto_play_scene_ids: track.auto_play_scene_ids.filter(s => s !== currentSceneId),
                      is_playing: false,
                      is_paused: false,
                    });
                  }
                });
              }
              setPendingRemoveIds(null);
            }}
            onCancel={() => setPendingRemoveIds(null)}
          />
        );
      })()}

      {pendingRemoveIds && (() => {
        const delTracks = bgms.filter(b => pendingRemoveIds.includes(b.id));
        const message = pendingRemoveIds.length === 1
          ? `「${delTracks[0]?.name ?? 'BGM'}」を削除しますか？（全シーンから削除されます）`
          : `${pendingRemoveIds.length}件のBGMを削除しますか？（全シーンから削除されます）`;
        return (
          <ConfirmModal
            message={message}
            confirmLabel="削除"
            danger
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingRemoveIds(null)}
          />
        );
      })()}

      {showAddPicker && (
        <AssetLibraryModal
          initialTab="audio"
          onClose={() => setShowAddPicker(false)}
          onSelect={handleAddFromPicker}
        />
      )}
    </>
  );
}
