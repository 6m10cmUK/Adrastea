import { useState, useRef, useEffect } from 'react';
import { theme } from '../styles/theme';
import type { UserProfile } from '../types/adrastea.types';
import { useAuth } from '../contexts/AuthContext';
import { Cropper, type CropperRef, CircleStencil } from 'react-advanced-cropper';
import 'react-advanced-cropper/dist/style.css';
import { AdInput, AdButton, AdModal } from './ui';
import { LogOut } from 'lucide-react';
import { uploadAvatarToR2 } from '../services/assetService';

function AvatarButton({ avatarUrl, fallback, onClick }: {
  avatarUrl: string;
  fallback: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
        border: hovered ? `2px dashed ${theme.textSecondary}` : `2px solid ${theme.border}`,
        background: theme.bgDeep,
        cursor: 'pointer', flexShrink: 0,
        position: 'relative',
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{
          width: '100%', height: '100%', objectFit: 'cover',
          filter: hovered ? 'brightness(0.4)' : 'none',
          transition: 'filter 0.15s',
        }} />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', color: theme.textMuted,
          filter: hovered ? 'brightness(0.6)' : 'none',
        }}>
          {fallback}
        </div>
      )}
      {hovered && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.textPrimary, fontSize: '10px', fontWeight: 600,
          pointerEvents: 'none',
        }}>
          画像変更
        </div>
      )}
    </div>
  );
}

interface ProfileEditModalProps {
  profile: UserProfile;
  onSave: (data: { display_name: string; avatar_url: string | null }) => Promise<void>;
  onSignOut: () => void;
  onClose: () => void;
}

export function ProfileEditModal({ profile, onSave, onSignOut, onClose }: ProfileEditModalProps) {
  const { user, token } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);

  // Google アバターを自動で R2 にコピー（初回のみ）
  useEffect(() => {
    if (!user || !token) return;
    if (!profile.avatar_url) return;
    if (!profile.avatar_url.includes('googleusercontent.com')) return;
    if (profile.avatar_url.includes('workers.dev')) return;

    (async () => {
      try {
        const res = await fetch(profile.avatar_url!);
        if (!res.ok) return;
        const blob = await res.blob();
        const url = await uploadAvatarToR2(new File([blob], 'avatar.webp'), user.uid, token);
        setAvatarUrl(url);
      } catch (err) {
        console.error('Google アバターの R2 コピー失敗:', err);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    // input をリセット（同じファイルを再選択可能にする）
    e.target.value = '';
  };

  const handleCropConfirm = async () => {
    if (!cropperRef.current || !token) return;
    const canvas = cropperRef.current.getCanvas({ width: 128, height: 128 });
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/webp',
          0.7,
        );
      });
      const r2Key = `users/${user.uid}/avatar.webp`;
      const form = new FormData();
      form.append('file', blob, 'avatar.webp');
      form.append('path', r2Key);
      const API_BASE_URL = import.meta.env.VITE_R2_WORKER_URL || '';
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const { url } = await res.json();
      setAvatarUrl(`${url}?t=${Date.now()}`);
    } catch {
      setError('アバターアップロード失敗');
    } finally {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      onClose();
    } catch {
      setError('プロフィールの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleAvatarChange}
      />
      <AdModal
        title="ユーザー設定"
        width="400px"
        onClose={onClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              onClick={() => { onSignOut(); onClose(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                fontSize: '12px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                cursor: 'pointer',
              }}
            >
              <LogOut size={14} />
              ログアウト
            </button>
            <AdButton
              variant="primary"
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
            >
              {saving ? '保存中...' : '保存'}
            </AdButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '6px 10px', background: theme.danger, color: theme.textOnAccent, fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          {/* アバター + 名前 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AvatarButton
              avatarUrl={avatarUrl}
              fallback={(displayName || '?')[0]}
              onClick={() => avatarInputRef.current?.click()}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <AdInput
                label="名前"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="表示名を入力"
              />
            </div>
          </div>

        </div>
      </AdModal>

      {cropSrc && (
        <AdModal
          title="画像をクリップ"
          width="400px"
          onClose={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
              <AdButton onClick={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}>
                キャンセル
              </AdButton>
              <AdButton variant="primary" onClick={handleCropConfirm}>
                決定
              </AdButton>
            </div>
          }
        >
          <div style={{ height: 300 }}>
            <Cropper
              ref={cropperRef}
              src={cropSrc}
              stencilComponent={CircleStencil}
              stencilProps={{ aspectRatio: 1 }}
              style={{ height: '100%', width: '100%' }}
            />
          </div>
        </AdModal>
      )}
    </>
  );
}
