import { useState, useEffect, useCallback } from 'react';
import type { Asset } from '../types/adrastea.types';
import { useAuth } from '../contexts/AuthContext';
import { uploadAssetToR2, uploadAudioAssetToR2, deleteR2File } from '../services/assetService';
import { apiFetch } from '../config/api';
import { supabase } from '../services/supabase';
import { registerPreloadedBlob } from '../components/DomObjectOverlay';
import { isAdrasteaQueryDebug } from '../utils/debugFlags';

// モジュールレベルキャッシュ（モーダル再マウント時の再取得を防止）
let assetCache: { uid: string; assets: Asset[] } | null = null;
let demoCache: Asset[] | null = null;

/** assetCache にアセットを即座に追加（setState を経由しないため、アンマウント後も確実に反映） */
function addToCache(asset: Asset, uid: string | undefined, disabled: boolean) {
  if (disabled) {
    demoCache = demoCache ? [asset, ...demoCache] : [asset];
  } else if (uid && assetCache) {
    assetCache = { uid, assets: [asset, ...assetCache.assets] };
  }
}

// バックグラウンドフェッチ用：進行中のリクエスト + fetchSingleAsset 関数への参照
const pendingFetches = new Set<string>();
const failedFetches = new Set<string>();
let fetchSingleAssetFn: ((id: string) => void) | null = null;

// primeAssetCache 完了後に useAssets の state を同期するためのリスナー
const cacheListeners = new Set<() => void>();

/** asset_id から URL を解決する。モジュールレベルキャッシュを直接参照。キャッシュミス時はバックグラウンドフェッチをトリガー。 */
export function resolveAssetId(assetId: string | null | undefined): string | null {
  if (!assetId) return null;
  // demoCache と assetCache の両方を検索（デモモードでも本番キャッシュが残っているケース対応）
  const demoHit = demoCache?.find(a => a.id === assetId);
  if (demoHit) return demoHit.url ?? null;
  const asset = assetCache?.assets?.find(a => a.id === assetId);
  if (asset) return asset.url ?? null;
  // キャッシュミス → バックグラウンドフェッチをトリガー
  if (fetchSingleAssetFn && !pendingFetches.has(assetId) && !failedFetches.has(assetId)) {
    fetchSingleAssetFn(assetId);
  }
  return null;
}

/** 複数アセットをキャッシュに一括注入する。RPC初期データのプリフェッチ用 */
export function primeAssetCache(assets: Asset[], uid: string | undefined): void {
  if (!uid || !assets || assets.length === 0) return;
  if (assetCache?.uid !== uid) return; // UID不一致時は注入しない（別ユーザー対策）
  // 既存アセットとマージ（IDで重複排除）
  const existingIds = new Set(assetCache.assets.map(a => a.id));
  const newAssets = assets.filter(a => !existingIds.has(a.id));
  if (newAssets.length > 0) {
    assetCache = { uid, assets: [...newAssets, ...assetCache.assets] };
    // useAssets の state を同期
    cacheListeners.forEach(fn => fn());
  }
}

export function useAssets(options?: { disabled?: boolean; defaultTags?: string[] }) {
  const disabled = options?.disabled ?? false;
  const defaultTags = options?.defaultTags ?? [];
  const defaultTagsKey = JSON.stringify(defaultTags);
  const { user, token } = useAuth();
  const uid = user?.uid;

  // disabled モード（デモ）ではデモキャッシュを使う
  const cached = disabled
    ? demoCache
    : (uid && assetCache?.uid === uid ? assetCache.assets : null);
  const [assets, setAssetsRaw] = useState<Asset[]>(cached ?? []);
  const [loading, setLoading] = useState(!disabled && !cached);

  // setAssets のラッパー: state とキャッシュを同時に更新
  const setAssets: typeof setAssetsRaw = useCallback((action) => {
    setAssetsRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (disabled) {
        demoCache = next;
      } else if (uid) {
        assetCache = { uid, assets: next };
      }
      return next;
    });
  }, [uid, disabled]);

  const fetchAssets = useCallback(async () => {
    if (disabled) {
      setLoading(false);
      return;
    }
    if (!uid || !token) {
      setAssets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('assets')
        .select('*')
        .eq('owner_id', uid)
        .order('created_at', { ascending: false })
        .limit(500);
      if (fetchError) throw fetchError;
      const next = (data ?? []).map((a: any) => ({ ...a, tags: a.tags ?? [] })) as Asset[];
      setAssets(next);
    } catch (error) {
      console.error('アセットの取得に失敗:', error);
    } finally {
      setLoading(false);
    }
  }, [disabled, uid, token]);

  // 単体アセットをバックグラウンドで取得する
  const fetchSingleAsset = useCallback(
    async (assetId: string) => {
      if (isAdrasteaQueryDebug()) {
        console.log('[Adrastea:Query] fetchSingleAsset', { assetId });
      }
      // デモモード時はフェッチしない
      if (disabled) return;
      if (!uid || !token) return;

      pendingFetches.add(assetId);
      try {
        const { data: assetData, error: assetError } = await supabase
          .from('assets')
          .select('*')
          .eq('id', assetId)
          .maybeSingle();
        if (assetError || !assetData) {
          failedFetches.add(assetId);
          return;
        }
        const asset: Asset = { ...assetData, tags: assetData.tags ?? [] };
        setAssets((prev) => {
          // 既に存在する場合はスキップ
          if (prev.some((a) => a.id === asset.id)) return prev;
          return [asset, ...prev];
        });
      } catch (error) {
        console.error(`[useAssets] fetchSingleAsset failed for ${assetId}:`, error);
      } finally {
        pendingFetches.delete(assetId);
      }
    },
    [disabled, uid, token]
  );

  // uid 変更時にキャッシュをクリア（別ユーザーのアセット混在防止）
  useEffect(() => {
    if (!disabled && uid && assetCache && assetCache.uid !== uid) {
      assetCache = null;
    }
  }, [disabled, uid]);

  // キャッシュがあればフェッチをスキップ
  useEffect(() => {
    if (disabled) return;
    if (uid && assetCache && assetCache.uid === uid) return;
    fetchAssets();
  }, [disabled, fetchAssets, uid]);

  // fetchSingleAsset を module-level 関数にバインド
  useEffect(() => {
    fetchSingleAssetFn = fetchSingleAsset;
    return () => {
      fetchSingleAssetFn = null;
    };
  }, [fetchSingleAsset]);

  // primeAssetCache からの通知で state を同期
  useEffect(() => {
    const sync = () => {
      if (disabled) return;
      if (assetCache && uid && assetCache.uid === uid) {
        setAssetsRaw(assetCache.assets);
      }
    };
    cacheListeners.add(sync);
    return () => { cacheListeners.delete(sync); };
  }, [disabled, uid]);

  const uploadAsset = useCallback(
    async (file: File): Promise<Asset | null> => {
      // デモモード: 通信なし、blob URLのみ
      if (disabled) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = url;
        });
        const asset: Asset = {
          id: crypto.randomUUID(),
          uid: 'demo-user',
          url,
          r2_key: '',
          filename: file.name,
          title: file.name,
          size_bytes: file.size,
          width: dims.width,
          height: dims.height,
          tags: defaultTags,
          asset_type: 'image',
          created_at: Date.now(),
        };
        addToCache(asset, uid, disabled);
        setAssets((prev) => [asset, ...prev]);
        return asset;
      }

      // 本番: R2へのアップロード処理
      if (!uid || !token) return null;

      const result = await uploadAssetToR2(file, uid, token);
      const title = file.name;
      try {
        const { data: insertedAsset, error: insertError } = await supabase.from('assets').insert({
          id: crypto.randomUUID(),
          owner_id: uid,
          url: result.url,
          r2_key: result.r2_key,
          filename: file.name,
          title,
          size_bytes: result.size_bytes,
          width: result.width,
          height: result.height,
          tags: defaultTags,
          asset_type: 'image',
          created_at: Date.now(),
        }).select().single();
        if (insertError) throw insertError;
        const created: Asset = { ...insertedAsset, tags: insertedAsset.tags ?? [] };
        addToCache(created, uid, disabled);
        registerPreloadedBlob(created.url, file);
        setAssets((prev) => [created, ...prev]);
        return created;
      } catch (e) {
        // Supabase登録失敗 → R2ファイルを削除してロールバック
        await deleteR2File(result.r2_key, token).catch((err) => {
          console.error('R2削除失敗（アセット登録ロールバック中）:', err);
        });
        throw e;
      }
    },
    [uid, token, disabled, defaultTags, defaultTagsKey]
  );

  const uploadAudioAsset = useCallback(
    async (file: File): Promise<Asset | null> => {
      // デモモード: 通信なし、blob URLのみ
      if (disabled) {
        const url = URL.createObjectURL(file);
        const asset: Asset = {
          id: crypto.randomUUID(),
          uid: 'demo-user',
          url,
          r2_key: '',
          filename: file.name,
          title: file.name,
          size_bytes: file.size,
          width: 0,
          height: 0,
          tags: defaultTags,
          asset_type: 'audio',
          created_at: Date.now(),
        };
        addToCache(asset, uid, disabled);
        setAssets((prev) => [asset, ...prev]);
        return asset;
      }

      // 本番: R2へのアップロード処理
      if (!uid || !token) return null;

      const result = await uploadAudioAssetToR2(file, uid, token);
      const title = file.name;
      try {
        const { data: insertedAsset, error: insertError } = await supabase.from('assets').insert({
          id: crypto.randomUUID(),
          owner_id: uid,
          url: result.url,
          r2_key: result.r2_key,
          filename: file.name,
          title,
          size_bytes: result.size_bytes,
          width: 0,
          height: 0,
          tags: defaultTags,
          asset_type: 'audio',
          created_at: Date.now(),
        }).select().single();
        if (insertError) throw insertError;
        const created: Asset = { ...insertedAsset, tags: insertedAsset.tags ?? [] };
        addToCache(created, uid, disabled);
        setAssets((prev) => [created, ...prev]);
        return created;
      } catch (e) {
        await deleteR2File(result.r2_key, token).catch((err) => {
          console.error('R2削除失敗（オーディオアセット登録ロールバック中）:', err);
        });
        throw e;
      }
    },
    [uid, token, disabled, defaultTags, defaultTagsKey]
  );

  const addAssetByUrl = useCallback(
    async (url: string, assetType: 'image' | 'audio'): Promise<Asset | null> => {
      // Dropbox共有URL（dl=0）を直接ダウンロードURL（dl=1）に変換
      // 新形式(scl): dl=0 → dl=1 のみでOK
      // 旧形式(/s/): www.dropbox.com → dl.dropboxusercontent.com でも可
      const normalizedUrl = url.includes('dropbox.com')
        ? url.replace(/([?&])dl=0(&|$)/, '$1dl=1$2').replace(/www\.dropbox\.com\/s\//, 'dl.dropboxusercontent.com/s/')
        : url;
      let filename = decodeURIComponent(normalizedUrl.split('/').pop() || normalizedUrl).replace(/[?#].*$/, '');
      let title = filename;

      // YouTube URL の場合はタイトルを取得
      const ytMatch = normalizedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/);
      if (ytMatch) {
        filename = ytMatch[1];
        title = ytMatch[1];
        try {
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytMatch[1]}`);
          const data = await res.json();
          if (data.title) title = data.title;
        } catch { /* タイトル取得失敗時は videoId のまま */ }
      }

      // デモモード: URL をそのまま登録（通信なし）
      if (disabled) {
        const asset: Asset = {
          id: crypto.randomUUID(),
          uid: 'demo-user',
          url: normalizedUrl,
          r2_key: '',
          filename,
          title,
          size_bytes: 0,
          width: 0,
          height: 0,
          tags: defaultTags,
          asset_type: assetType,
          created_at: Date.now(),
        };
        addToCache(asset, uid, disabled);
        setAssets((prev) => [asset, ...prev]);
        return asset;
      }

      // 本番: Supabaseに登録
      if (!uid || !token) return null;

      const { data: insertedAsset, error: insertError } = await supabase.from('assets').insert({
        id: crypto.randomUUID(),
        owner_id: uid,
        url: normalizedUrl,
        r2_key: '',
        filename,
        title,
        size_bytes: 0,
        width: 0,
        height: 0,
        tags: defaultTags,
        asset_type: assetType,
        created_at: Date.now(),
      }).select().single();
      if (insertError) throw insertError;
      const created: Asset = { ...insertedAsset, tags: insertedAsset.tags ?? [] };
      addToCache(created, uid, disabled);
      setAssets((prev) => [created, ...prev]);
      return created;
    },
    [uid, token, disabled, defaultTags, defaultTagsKey]
  );

  const deleteAsset = useCallback(
    async (assetId: string, _r2Key?: string) => {
      // デモモード: ローカル削除のみ
      if (disabled) {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        return;
      }

      // 本番: API経由で削除
      if (!uid || !token) return;

      // R2 ファイル削除は Worker API 経由（フロントから R2 直接操作不可）
      const asset = assets.find(a => a.id === assetId);
      if (asset?.r2_key) {
        await apiFetch(`/delete?path=${encodeURIComponent(asset.r2_key)}`, { method: 'DELETE' }, token).catch(() => {});
      }
      // メタデータ削除は Supabase 直接
      await supabase.from('assets').delete().eq('id', assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    },
    [uid, token, disabled, assets]
  );

  const updateAssetTags = useCallback(
    async (assetId: string, tags: string[]) => {
      // デモモード: ローカル更新のみ
      if (disabled) {
        setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, tags } : a)));
        return;
      }

      // 本番: API経由で更新
      if (!uid || !token) return;

      await supabase.from('assets').update({ tags }).eq('id', assetId);
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, tags } : a)));
    },
    [uid, token, disabled]
  );

  const updateAssetTitle = useCallback(
    async (assetId: string, title: string) => {
      // デモモード: ローカル更新のみ
      if (disabled) {
        setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, title } : a)));
        return;
      }

      // 本番: API経由で更新
      if (!uid || !token) return;

      await supabase.from('assets').update({ title }).eq('id', assetId);
      setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, title } : a)));
    },
    [uid, token, disabled]
  );

  return { assets, loading, fetchAssets, uploadAsset, uploadAudioAsset, addAssetByUrl, deleteAsset, updateAssetTags, updateAssetTitle };
}
