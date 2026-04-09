import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../styles/theme';
import { useAssets } from '../hooks/useAssets';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { X, Upload, Link, ImageOff, Trash2, Pencil } from 'lucide-react';
import type { Asset } from '../types/adrastea.types';
import { useAnimatedBlobSrc } from './DomObjectOverlay';
import { AdTagInput, AdModal, AdButton, AdInput, ConfirmModal, Tooltip } from './ui';
import YouTube from 'react-youtube';

/** blobCache 経由のサムネイル — キャッシュ済みなら即表示 */
function CachedThumbnail({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const blobSrc = useAnimatedBlobSrc(src);
  return <img src={blobSrc ?? src} alt={alt} style={style} draggable={false} />;
}

/** IntersectionObserver で可視領域に入ったときだけ中身を描画 */
function LazyVisible({ children, height }: { children: React.ReactNode; height?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {visible ? children : null}
    </div>
  );
}

// --- DnD オーバーレイフック ---
function useDragDropOverlay(onDrop: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  }, [onDrop]);

  return { dragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop };
}

const ASSET_TAB_STORAGE_KEY = 'adrastea-asset-tab';

interface AssetLibraryModalProps {
  onClose: () => void;
  onSelect?: (url: string, assetId?: string, title?: string, width?: number, height?: number) => void;
  /** 省略時は localStorage に保存された image/audio を復元。画像・BGM など用途固定なら必ず指定する */
  initialTab?: 'image' | 'audio';
  autoTags?: string[];
}

type AddMode = null | 'pick' | 'url';

export function AssetLibraryModal({ onClose, onSelect, initialTab, autoTags }: AssetLibraryModalProps) {
  const ctx = useAdrasteaContext();
  const roomName = ctx.room?.name;
  const [searchTags, setSearchTags] = useState<string[]>(() => {
    const tags: string[] = [];
    if (roomName) tags.push(roomName);
    if (autoTags?.[0]) tags.push(autoTags[0]);
    return [...new Set(tags)];
  });
  const [searchText, setSearchText] = useState('');
  const defaultTags = useMemo(() => [...new Set([...(roomName ? [roomName] : []), ...(autoTags ?? [])])], [roomName, autoTags]);
  const { assets, loading, uploadAsset, uploadAudioAsset, addAssetByUrl, deleteAsset, updateAssetTags, updateAssetTitle } = useAssets({ disabled: ctx.isDemo, defaultTags });

  // 種別タグは登録済みアセットになくても常にタグとして認識
  const BUILTIN_TAGS = ['背景', '前景', 'キャラクター', 'オブジェクト', 'カットイン'];

  const allTags = useMemo(() => {
    const tagSet = new Set<string>(BUILTIN_TAGS);
    if (roomName) tagSet.add(roomName);
    assets.forEach(a => a.tags.forEach(t => tagSet.add(t)));
    return [...tagSet].sort();
  }, [assets]);

  const searchSuggestions = useMemo(() => {
    const excluded = new Set(searchTags);
    const q = searchText.trim().toLowerCase();
    // 未入力時はビルトインタグのみ表示
    if (!q) return BUILTIN_TAGS.filter(t => !excluded.has(t));
    // 入力時は全タグからフィルタ
    const available = allTags.filter(t => !excluded.has(t));
    return available.filter(t => t.toLowerCase().includes(q)).slice(0, 20);
  }, [allTags, searchTags, searchText]);

  const hasSearchTags = searchTags.length > 0;
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTabState] = useState<'image' | 'audio'>(() => {
    if (initialTab !== undefined) return initialTab;
    try {
      const saved = localStorage.getItem(ASSET_TAB_STORAGE_KEY);
      return saved === 'audio' ? 'audio' : 'image';
    } catch {
      return 'image';
    }
  });
  const setActiveTab = useCallback((tab: 'image' | 'audio') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(ASSET_TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, []);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [searchDropOpen, setSearchDropOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropRef = useRef<HTMLDivElement>(null);
  const searchComposingRef = useRef(false);

  /** YouTube URL → videoId を抽出。非YouTube なら null */
  const extractYouTubeVideoId = useCallback((url: string): string | null => {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/);
    return m ? m[1].split(/[?&#]/)[0] : null;
  }, []);

  const handlePreviewAudio = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    if (previewingId === asset.id) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewingId(null);
    } else {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      // YouTube URL は react-youtube で再生するため Audio は作らない
      if (!extractYouTubeVideoId(asset.url)) {
        const audio = new Audio(asset.url);
        audio.volume = 0.5;
        audio.onended = () => setPreviewingId(null);
        audio.play().catch((err) => { console.error('試聴失敗:', asset.url, err); setPreviewingId(null); });
        previewAudioRef.current = audio;
      }
      setPreviewingId(asset.id);
    }
  }, [previewingId, extractYouTubeVideoId]);

  const filtered = assets.filter((a) => {
    if (a.asset_type !== activeTab) return false;
    // タグフィルタ: 全 searchTags を含むもの
    if (searchTags.length > 0 && !searchTags.every(t => a.tags.includes(t))) return false;
    // テキストフィルタ: ファイル名・タイトル・タグで部分一致
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      return (
        a.filename.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        ctx.showToast(`ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB / 上限5MB）`, 'error');
        onClose();
        return;
      }
      setUploading(true);
      try {
        let result: Asset | null = null;
        if (activeTab === 'audio') {
          result = await uploadAudioAsset(file);
        } else {
          result = await uploadAsset(file);
        }
        // タグ検索中なら検索タグを追加付与
        if (result && hasSearchTags) {
          const missingTags = searchTags.filter(t => !result.tags.includes(t));
          if (missingTags.length > 0) {
            await updateAssetTags(result.id, [...result.tags, ...missingTags]);
          }
        }
        if (result && onSelect) {
          previewAudioRef.current?.pause();
          onSelect(result.url, result.id, result.title || result.filename, result.width, result.height);
        }
      } catch (err) {
        console.error('アップロード失敗:', err);
        const msg = err instanceof Error ? err.message : 'アップロードに失敗しました';
        ctx.showToast(msg, 'error');
      } finally {
        setUploading(false);
        setAddMode(null);
      }
    },
    [activeTab, uploadAsset, uploadAudioAsset, onSelect, hasSearchTags, searchTags, updateAssetTags]
  );

  const dnd = useDragDropOverlay(handleUpload);

  const handleAddByUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    const result = await addAssetByUrl(url, activeTab);
    // タグ検索中なら検索タグを追加付与
    if (result && hasSearchTags) {
      const missingTags = searchTags.filter(t => !result.tags.includes(t));
      if (missingTags.length > 0) {
        await updateAssetTags(result.id, [...result.tags, ...missingTags]);
      }
    }
    if (onSelect) {
      if (result) {
        onSelect(result.url, result.id, result.title || result.filename, result.width, result.height);
      } else {
        onSelect(url);
      }
    }
    setUrlInput('');
    setAddMode(null);
  }, [urlInput, onSelect, activeTab, addAssetByUrl, hasSearchTags, searchTags, updateAssetTags]);

  const handleDelete = useCallback(
    async (assetId: string, r2Key: string) => {
      try {
        await deleteAsset(assetId, r2Key);
      } catch (err) {
        console.error('アセット削除失敗:', err);
        setError('アセットの削除に失敗しました');
      } finally {
        setConfirmDeleteId(null);
      }
    },
    [deleteAsset]
  );

  const openEditModal = useCallback((asset: Asset) => {
    setEditingAsset(asset);
    setEditTitle(asset.title || asset.filename);
    setEditTags([...asset.tags]);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingAsset) return;
    try {
      if (editTitle.trim() && editTitle !== editingAsset.title) {
        await updateAssetTitle(editingAsset.id, editTitle.trim());
      }
      const tagsChanged = JSON.stringify(editTags) !== JSON.stringify(editingAsset.tags);
      if (tagsChanged) {
        await updateAssetTags(editingAsset.id, editTags);
      }
    } catch (err) {
      console.error('アセット編集失敗:', err);
      setError('アセットの編集に失敗しました');
    } finally {
      setEditingAsset(null);
    }
  }, [editingAsset, editTitle, editTags, updateAssetTitle, updateAssetTags]);

  // モーダル閉じ時にプレビュー停止
  React.useEffect(() => {
    return () => { previewAudioRef.current?.pause(); };
  }, []);

  // 候補ドロップダウン: 外側クリック時に閉じる
  useEffect(() => {
    if (!searchDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node) &&
        searchDropRef.current && !searchDropRef.current.contains(e.target as Node)
      ) {
        setSearchDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchDropOpen]);

  // searchHighlight をリセット
  useEffect(() => { setSearchHighlight(0); }, [searchText]);

  const handleAssetClick = useCallback(
    (url: string, assetId?: string, title?: string, width?: number, height?: number) => {
      previewAudioRef.current?.pause();
      if (onSelect) {
        onSelect(url, assetId, title, width, height);
        onClose();
      }
    },
    [onSelect, onClose]
  );

  const handleSearchSelect = useCallback((value: string) => {
    if (allTags.includes(value) && !searchTags.includes(value)) {
      setSearchTags(prev => [...prev, value]);
      setSearchText('');
    } else {
      setSearchText(value);
    }
    setSearchDropOpen(false);
  }, [allTags, searchTags]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (searchComposingRef.current) return;
    if (searchDropOpen && searchSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setSearchHighlight(i => Math.max(i - 1, 0));
          return;
        case 'ArrowRight':
          e.preventDefault();
          setSearchHighlight(i => Math.min(i + 1, searchSuggestions.length - 1));
          return;
        case 'Enter':
          e.preventDefault();
          handleSearchSelect(searchSuggestions[searchHighlight]);
          return;
        case 'Escape':
          setSearchDropOpen(false);
          return;
      }
    }
    // Backspace で入力欄が空なら最後のタグチップを削除
    if (e.key === 'Backspace' && !searchText && searchTags.length > 0) {
      setSearchTags(prev => prev.slice(0, -1));
    }
  }, [searchDropOpen, searchSuggestions, searchHighlight, handleSearchSelect, searchText, searchTags]);

  const modalStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: theme.bgOverlay,
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  };

  const panelStyle: React.CSSProperties = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: 0, padding: '12px', width: '90vw', maxWidth: '900px',
    height: '80vh', color: theme.textPrimary,
    display: 'flex', flexDirection: 'column',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
    borderRadius: 0, color: theme.textPrimary,
    fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  };

  const tabStyle = (tab: 'image' | 'audio'): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: '0.85rem',
    fontWeight: activeTab === tab ? 600 : 400,
    background: 'transparent',
    color: activeTab === tab ? theme.textPrimary : theme.textSecondary,
    border: 'none',
    borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent',
    borderRadius: 0,
    cursor: 'pointer',
  });

  const renderTagSection = (asset: Asset) => (
    <div
      data-testid="asset-tags"
      style={{
        fontSize: '0.65rem', color: theme.textMuted,
        marginBottom: '4px', minHeight: '16px',
      }}
    >
      {asset.tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
          {asset.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: theme.accentBgSubtle, padding: '1px 4px',
                borderRadius: 0, fontSize: '0.6rem',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <span style={{ fontStyle: 'italic', fontSize: '0.6rem' }}>タグなし</span>
      )}
    </div>
  );

  const addCardStyle: React.CSSProperties = {
    border: `2px dashed ${theme.borderInput}`,
    borderRadius: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: theme.textSecondary,
    transition: 'border-color 0.2s, color 0.2s',
  };

  const subModalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: theme.bgOverlay,
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
  };

  const subModalPanel: React.CSSProperties = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: 0, padding: '16px', width: '360px', maxWidth: '90vw',
    color: theme.textPrimary, display: 'flex', flexDirection: 'column', gap: '12px',
  };

  const menuBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 14px', fontSize: '0.85rem',
    background: 'transparent', color: theme.textPrimary,
    border: 'none', borderRadius: 0,
    cursor: 'pointer', width: '100%',
  };

  const renderAddSubModal = () => {
    if (!addMode) return null;

    if (addMode === 'url') {
      return (
        <div style={subModalOverlay} onClick={(e) => { e.stopPropagation(); setAddMode(null); setUrlInput(''); }}>
          <div style={subModalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>URLから追加</h4>
              <button
                onClick={() => { setAddMode(null); setUrlInput(''); }}
                style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddByUrl(); }}
              placeholder="https://..."
              autoFocus
              maxLength={256}
              style={inputStyle}
            />
            {activeTab === 'audio' && (
              <div style={{ fontSize: '0.7rem', color: theme.textMuted }}>
                YouTube / Dropbox / Google Drive の共有リンクに対応
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="adra-btn adra-btn--ghost"
                onClick={() => { setAddMode(null); setUrlInput(''); }}
                style={{
                  padding: '6px 14px', fontSize: '0.8rem',
                  background: 'transparent', color: theme.textSecondary,
                  border: 'none', borderRadius: 0, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleAddByUrl}
                disabled={!urlInput.trim()}
                style={{
                  padding: '6px 14px', fontSize: '0.8rem',
                  background: theme.accent, color: theme.textOnAccent,
                  border: 'none', borderRadius: 0,
                  cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      );
    }

    // addMode === 'pick'
    return (
      <div style={subModalOverlay} onClick={(e) => { e.stopPropagation(); setAddMode(null); }}>
        <div style={subModalPanel} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
              {activeTab === 'audio' ? '音声' : '画像'}を追加
            </h4>
            <button
              onClick={() => setAddMode(null)}
              style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', display: 'flex' }}
            >
              <X size={16} />
            </button>
          </div>
          {activeTab !== 'audio' && (
            <button
              className="adra-btn adra-btn--ghost"
              style={menuBtnStyle}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              {uploading ? 'アップロード中...' : 'ファイルを選択'}
            </button>
          )}
          <button className="adra-btn adra-btn--ghost" style={menuBtnStyle} onClick={() => setAddMode('url')}>
            <Link size={14} />
            URLから追加
          </button>
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      className="adrastea-root"
      style={modalStyle}
      onClick={onClose}
    >
      <div
        style={{ ...panelStyle, position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={dnd.handleDragEnter}
        onDragLeave={dnd.handleDragLeave}
        onDragOver={dnd.handleDragOver}
        onDrop={dnd.handleDrop}
      >
        {/* DnD オーバーレイ */}
        {dnd.dragging && activeTab !== 'audio' && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.7)',
            border: `3px dashed ${theme.accent}`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
            pointerEvents: 'none',
          }}>
            <Upload size={48} color={theme.accent} />
            <span style={{ fontSize: '1rem', fontWeight: 600, color: theme.accent }}>
              ドロップしてアップロード
            </span>
          </div>
        )}
        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>アセットライブラリ</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* タブ（選択モード時はタブ固定） */}
        {!onSelect && (
          <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, marginBottom: '8px' }}>
            <button
              style={tabStyle('image')}
              onClick={() => { setActiveTab('image'); setAddMode(null); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.textPrimary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = activeTab === 'image' ? theme.textPrimary : theme.textSecondary; }}
            >画像</button>
            <button
              style={tabStyle('audio')}
              onClick={() => { setActiveTab('audio'); setAddMode(null); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.textPrimary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = activeTab === 'audio' ? theme.textPrimary : theme.textSecondary; }}
            >音声</button>
          </div>
        )}

        {/* 検索バー + ファイルから追加 */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
          <div
            ref={searchWrapRef}
            onClick={() => searchInputRef.current?.focus()}
            style={{
              flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px',
              padding: '3px 6px', minHeight: '28px',
              background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
              cursor: 'text',
            }}
          >
            {searchTags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '0 6px', fontSize: '0.75rem', lineHeight: '20px',
                  background: theme.accentBgSubtle, color: theme.accent,
                  border: `1px solid ${theme.accentBorderSubtle}`, borderRadius: '2px',
                  flexShrink: 0,
                }}
              >
                {tag}
                <button
                  onClick={(e) => { e.stopPropagation(); setSearchTags(prev => prev.filter(t => t !== tag)); }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: theme.textMuted, cursor: 'pointer',
                    padding: 0, fontSize: '11px', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setSearchDropOpen(true); }}
              onFocus={() => setSearchDropOpen(true)}
              onCompositionStart={() => { searchComposingRef.current = true; }}
              onCompositionEnd={() => { searchComposingRef.current = false; }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchTags.length > 0 ? '' : 'ファイル名・タグで検索...'}
              style={{
                flex: 1, minWidth: '60px', border: 'none', outline: 'none',
                background: 'transparent', color: theme.textPrimary,
                fontSize: '0.85rem', padding: '2px 0',
              }}
            />
          </div>
          {activeTab === 'audio' ? (
            <button
              onClick={() => setAddMode('url')}
              style={{
                background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
                borderRadius: 0, color: theme.textSecondary, cursor: 'pointer',
                padding: '0 12px', fontSize: '0.8rem', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
              }}
            >
              <Link size={14} />
              URLから追加
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
                borderRadius: 0, color: theme.textSecondary, cursor: 'pointer',
                padding: '0 12px', fontSize: '0.8rem', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
              }}
            >
              <Upload size={14} />
              {uploading ? 'アップロード中...' : 'ファイルから追加'}
            </button>
          )}
        </div>
        {activeTab !== 'audio' && (
          <div style={{ fontSize: '0.85rem', color: theme.textMuted, marginBottom: '8px' }}>
            ドラッグ＆ドロップでもアップロードできます
          </div>
        )}

        {/* エラーバナー */}
        {error && (
          <div
            style={{
              padding: '6px 10px',
              marginBottom: '8px',
              background: theme.danger,
              color: theme.textOnAccent,
              fontSize: '0.8rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: theme.textOnAccent, cursor: 'pointer', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={activeTab === 'audio' ? 'audio/*' : 'image/*'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
        />

        {/* アセット一覧 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: theme.textMuted, padding: '24px 0' }}>
              読み込み中...
            </div>
          ) : activeTab === 'image' ? (
            /* 画像: グリッド表示 */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '2px' }}>
              {/* 選択モード時: no image カード */}
              {onSelect && (
                <div
                  style={{ ...addCardStyle, aspectRatio: '1', flexDirection: 'column', gap: '4px' }}
                  onClick={() => { onSelect(''); onClose(); }}
                >
                  <ImageOff size={28} />
                  <span style={{ fontSize: '0.75rem' }}>no image</span>
                </div>
              )}
              {filtered.map((asset) => (
                <LazyVisible key={asset.id} height="200px">
                  <div
                    style={{
                      border: `1px solid ${theme.border}`, borderRadius: 0,
                      overflow: 'hidden', background: 'rgba(0,0,0,0.2)',
                      cursor: onSelect ? 'pointer' : undefined,
                      position: 'relative',
                    }}
                    onClick={() => handleAssetClick(asset.url, asset.id, asset.title || asset.filename, asset.width, asset.height)}
                  >
                    <CachedThumbnail
                      src={asset.url}
                      alt={asset.filename}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', display: 'block' }}
                    />
                    {/* 右上アクションボタン */}
                    <div
                      style={{
                        position: 'absolute', top: '4px', right: '4px',
                        display: 'flex', gap: '4px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tooltip label="編集">
                        <button
                          onClick={() => openEditModal(asset)}
                          style={{
                            width: '24px', height: '24px', borderRadius: '4px',
                            background: 'rgba(0,0,0,0.6)', border: 'none',
                            color: theme.textPrimary, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                      </Tooltip>
                      <Tooltip label="削除">
                        <button
                          onClick={() => setConfirmDeleteId(asset.id)}
                          style={{
                            width: '24px', height: '24px', borderRadius: '4px',
                            background: 'rgba(0,0,0,0.6)', border: 'none',
                            color: theme.danger, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </Tooltip>
                    </div>
                    <div style={{ padding: '4px' }}>
                      <div style={{
                        fontSize: '0.75rem', color: theme.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginBottom: '4px',
                      }}>
                        {asset.title || asset.filename}
                      </div>
                      {renderTagSection(asset)}
                    </div>
                  </div>
                </LazyVisible>
              ))}
            </div>
          ) : (
            /* 音声: リスト表示 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filtered.map((asset) => {
                const isPreviewing = previewingId === asset.id;
                const ytVideoId = isPreviewing ? extractYouTubeVideoId(asset.url) : null;
                return (
                  <div key={asset.id}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 8px',
                      borderBottom: ytVideoId ? 'none' : `1px solid ${theme.borderSubtle}`,
                      cursor: onSelect ? 'pointer' : undefined,
                      transition: 'background 0.1s',
                    }}
                    onClick={() => handleAssetClick(asset.url, asset.id, asset.title || asset.filename, asset.width, asset.height)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* 試聴ボタン */}
                    <Tooltip label={isPreviewing ? '停止' : '試聴'}>
                      <button
                        onClick={(e) => handlePreviewAudio(e, asset)}
                        style={{
                          background: 'transparent', border: 'none',
                          color: isPreviewing ? theme.accent : theme.textSecondary,
                          cursor: 'pointer', padding: '2px',
                          display: 'flex', alignItems: 'center', flexShrink: 0,
                        }}
                      >
                        {isPreviewing
                          ? <div style={{ width: 11, height: 11, background: 'currentColor', borderRadius: 1 }} />
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3v18l15-9z" /></svg>}
                      </button>
                    </Tooltip>
                    {/* タイトル + タグ */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.8rem', color: theme.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {asset.title || asset.filename}
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        {renderTagSection(asset)}
                      </div>
                    </div>
                    {/* 編集・削除ボタン */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip label="編集">
                        <button
                          onClick={() => openEditModal(asset)}
                          style={{
                            background: 'transparent', border: 'none',
                            color: theme.textSecondary, cursor: 'pointer', padding: '2px',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip label="削除">
                        <button
                          onClick={() => setConfirmDeleteId(asset.id)}
                          style={{
                            background: 'transparent', border: 'none',
                            color: theme.danger, cursor: 'pointer', padding: '2px',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  {ytVideoId && (
                    <div style={{ padding: '0 8px 8px', borderBottom: `1px solid ${theme.borderSubtle}` }}>
                      <YouTube
                        videoId={ytVideoId}
                        opts={{
                          width: '100%',
                          height: '60',
                          playerVars: { autoplay: 1 },
                        }}
                        onEnd={() => setPreviewingId(null)}
                      />
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 追加サブモーダル */}
      {renderAddSubModal()}

      {/* 削除確認モーダル */}
      {confirmDeleteId && (() => {
        const asset = assets.find(a => a.id === confirmDeleteId);
        if (!asset) return null;
        return (
          <ConfirmModal
            message={`「${asset.title || asset.filename}」を削除しますか？この操作は取り消せません。`}
            confirmLabel="削除"
            danger
            onConfirm={() => handleDelete(asset.id, asset.r2_key)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        );
      })()}

      {/* 編集モーダル */}
      {editingAsset && (
        <AdModal
          title="アセットを編集"
          width="400px"
          onClose={() => setEditingAsset(null)}
          footer={
            <>
              <AdButton onClick={() => setEditingAsset(null)}>キャンセル</AdButton>
              <AdButton variant="primary" onClick={handleSaveEdit}>保存</AdButton>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AdInput
              label="タイトル"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              autoFocus
            />
            <div>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>タグ</div>
              <div data-testid="tag-editor">
                <AdTagInput
                  tags={editTags}
                  onChange={setEditTags}
                  existingTags={allTags}
                />
              </div>
            </div>
          </div>
        </AdModal>
      )}

      {/* 検索候補ドロップダウン */}
      {searchDropOpen && searchSuggestions.length > 0 && searchWrapRef.current && createPortal(
        <div
          ref={searchDropRef}
          className="adrastea-root"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: searchWrapRef.current.getBoundingClientRect().bottom,
            left: searchWrapRef.current.getBoundingClientRect().left,
            width: searchWrapRef.current.getBoundingClientRect().width,
            zIndex: 9999,
            background: theme.bgElevated,
            border: `1px solid ${theme.border}`,
            maxHeight: '150px',
            overflowY: 'auto',
            boxShadow: theme.shadowMd,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px' }}>
            {searchSuggestions.map((tag, i) => (
              <div
                key={tag}
                onClick={() => handleSearchSelect(tag)}
                onMouseEnter={() => setSearchHighlight(i)}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  background: i === searchHighlight ? theme.accentHighlight : theme.accentBgSubtle,
                  color: theme.textPrimary,
                  borderRadius: '2px',
                  border: `1px solid ${i === searchHighlight ? theme.accent : theme.accentBorderSubtle}`,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
}
