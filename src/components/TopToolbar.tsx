import { useState } from 'react';
import { Eye, FolderOpen, Volume2, VolumeX, Settings } from 'lucide-react';
import { AssetLibraryModal } from './AssetLibraryModal';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { usePermission } from '../hooks/usePermission';
import { BgmMiniPlayer } from './BgmMiniPlayer';
import { Tooltip } from './ui';
import type { Scene } from '../types/adrastea.types';
import type { DockviewApi } from 'dockview';
import { theme } from '../styles/theme';
import { ADRASTEA_VERSION, ADRASTEA_STAGE } from '../config/adrastea';


interface TopToolbarProps {
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  onOpenLayout: () => void;
  activeScene?: Scene | null;
  profile: { display_name?: string; avatar_url?: string | null } | null;
  dockviewApi: DockviewApi | null;
  roomName?: string;
  canEditSettings?: boolean;
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner:     { label: 'owner',     color: theme.accent },
  sub_owner: { label: 'sub_owner', color: theme.warning ?? '#f5a623' },
  user:      { label: 'user',      color: theme.textSecondary },
  guest:     { label: 'guest',     color: theme.textMuted },
};

function ToolbarButton({ onClick, title, children, ...rest }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <Tooltip label={title}>
      <button
        onClick={onClick}
        {...rest}
        style={{
          display: 'flex', alignItems: 'center', gap: '3px',
          background: 'transparent', border: 'none', borderRadius: 0,
          color: theme.textSecondary, cursor: 'pointer',
          padding: '2px 4px', fontSize: '0.75rem', whiteSpace: 'nowrap',
          transition: 'color 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = theme.textPrimary; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = theme.textSecondary; }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function TopToolbar({
  onOpenSettings,
  onOpenProfile,
  onSignOut: _onSignOut,
  onOpenLayout,
  activeScene: _activeScene,
  profile,
  dockviewApi: _dockviewApi,
  roomName,
  canEditSettings = true,
}: TopToolbarProps) {
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const { roomRole } = usePermission();

  const { masterVolume, setMasterVolume, bgmMuted, setBgmMuted } = useAdrasteaContext();

  return (
    <div
      style={{
        height: 32,
        minHeight: 32,
        background: theme.bgToolbar,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        zIndex: 10,
      }}
    >
      {/* Adrastea (α) 0.2.0 */}
      <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: theme.textPrimary, fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap' }}>
        Adrastea
      </span>
      <span style={{ fontSize: '10px', color: theme.textMuted, opacity: 0.7, whiteSpace: 'nowrap' }}>
        ({ADRASTEA_STAGE}) {ADRASTEA_VERSION}
      </span>

      {/* | ルーム名 */}
      {roomName && (
        <>
          <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px', flexShrink: 0 }} />
          <span style={{
            fontSize: '12px', color: theme.textSecondary,
            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {roomName}
          </span>
        </>
      )}

      {/* | 設定 */}
      <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px', flexShrink: 0 }} />
      <ToolbarButton onClick={canEditSettings ? onOpenSettings : () => {}} title="ルーム設定" data-testid="toolbar-settings-btn">
        <span style={{ opacity: canEditSettings ? 1 : 0.35, display: 'flex', alignItems: 'center', gap: '3px' }}>
          <Settings size={13} />
          設定
        </span>
      </ToolbarButton>

      {/* | レイアウト */}
      <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px', flexShrink: 0 }} />
      <ToolbarButton onClick={onOpenLayout} title="パネルレイアウト">
        <Eye size={13} />
        レイアウト
      </ToolbarButton>

      {/* スペーサー */}
      <div style={{ flex: 1 }} />

      {/* ロールバッジ */}
      {(() => {
        const badge = ROLE_BADGE[roomRole] ?? { label: roomRole, color: theme.textMuted };
        return (
          <span style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: badge.color,
            border: `1px solid ${badge.color}`,
            borderRadius: 2,
            padding: '1px 4px',
            opacity: 0.8,
          }}>
            {badge.label}
          </span>
        );
      })()}

      {/* BGMプレイヤー */}
      <BgmMiniPlayer />

      {/* マスターボリューム */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Tooltip label={bgmMuted ? 'ミュート解除' : 'ミュート'}>
          <button
            onClick={() => setBgmMuted(!bgmMuted)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: bgmMuted ? theme.danger : theme.textSecondary,
              padding: '2px', display: 'flex', alignItems: 'center',
            }}
          >
            {bgmMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </Tooltip>
        <Tooltip label={`マスターボリューム: ${Math.round(masterVolume * 100)}%`}>
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={bgmMuted ? 0 : masterVolume}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (bgmMuted && v > 0) setBgmMuted(false);
              setMasterVolume(v);
            }}
            style={{ width: '60px' }}
          />
        </Tooltip>
      </div>

      {/* セパレータ */}
      <div style={{ width: 1, height: 20, background: theme.border, margin: '0 4px' }} />

      {/* アセットライブラリ */}
      <ToolbarButton onClick={() => setShowAssetLibrary(true)} title="アセットライブラリ">
        <FolderOpen size={13} />
        アセットライブラリ
      </ToolbarButton>

      {/* プロフィール設定 */}
      <Tooltip label="ユーザー設定">
        <button
          type="button"
          onClick={onOpenProfile}
          className="adra-btn adra-btn--ghost"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: theme.accent, color: theme.bgBase,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 700,
            }}>
              {(profile?.display_name ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      </Tooltip>

      {showAssetLibrary && <AssetLibraryModal onClose={() => setShowAssetLibrary(false)} />}
    </div>
  );
}
