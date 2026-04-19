import { useState, useEffect, useRef, useMemo } from 'react';
import type { Room } from '../types/adrastea.types';
import type { DockviewApi } from 'dockview';
import type { PermissionKey } from '../config/permissions';
import { AdButton, AdInput, AdCheckbox, ConfirmModal, Tooltip } from './ui';
import { AdTagInput } from './ui/AdComponents';
import { DiceSystemPicker } from './ui/DiceSystemPicker';
import { theme } from '../styles/theme';
import { X, Trash2 } from 'lucide-react';
import { getAvailableSystems } from '../services/diceRoller';
import {
  getSavedLayouts,
  addLayout,
  updateLayout,
  deleteLayout,
  scaleLayout,
  migrateStatusPanelBoardOverlay,
} from '../services/layoutStorage';
import { sanitizeDockviewLayoutForRole } from '../services/layoutSanitize';
import type { RoomRole } from '../contexts/AdrasteaContext';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { relaxGroupWidth, fixAllNonBoardWidths } from './dock-panels/dockColumnState';
import { isPrivateChatChannel } from '../utils/chatChannelVisibility';

type SettingsSection = 'room' | 'layout' | 'members';

interface SettingsModalProps {
  initialSection?: SettingsSection;
  room: Room;
  onSaveRoom: (updates: {
    name?: string;
    tags?: string[];
    dice_system?: string;
    default_login_role?: 'sub_owner' | 'user' | 'guest';
    status_change_chat_enabled?: boolean;
    status_change_chat_channel?: string;
  }) => void;
  onDeleteRoom: () => void;
  dockviewApi: DockviewApi | null;
  can: (permission: PermissionKey) => boolean;
  onClose: () => void;
  isOwner: boolean;
  members: Array<{ user_id: string; role: string; joined_at: number; display_name: string | null; avatar_url: string | null }>;
  onAssignRole: (targetUserId: string, role: 'sub_owner' | 'user' | 'guest') => void;
}

interface PanelDef {
  id: string;
  component: string;
  title: string;
  permission: PermissionKey;
  disabled?: boolean;
}

const PANEL_DEFS: PanelDef[] = [
  { id: 'character', component: 'character', title: 'キャラクター', permission: 'panel_character' },
  { id: 'chatLog', component: 'chatLog', title: 'チャットログ', permission: 'panel_chat' },
  { id: 'chatInput', component: 'chatInput', title: 'チャット入力', permission: 'panel_chat' },
  { id: 'chatPalette', component: 'chatPalette', title: 'チャットパレット', permission: 'panel_chat' },
  { id: 'status', component: 'status', title: 'ステータス', permission: 'panel_status' },
  { id: 'property', component: 'property', title: 'プロパティ', permission: 'panel_property' },
  { id: 'pdfViewer', component: 'pdfViewer', title: 'PDF', permission: 'panel_pdfViewer' },
  { id: 'scene', component: 'scene', title: 'シーン', permission: 'panel_scene' },
  { id: 'layer', component: 'layer', title: 'レイヤー', permission: 'panel_layer' },
  { id: 'bgm', component: 'bgm', title: 'BGM', permission: 'panel_bgm' },
  { id: 'scenarioText', component: 'scenarioText', title: 'テキストメモ', permission: 'panel_scenarioText' },
  { id: 'cutin', component: 'cutin', title: 'カットイン (開発中)', permission: 'panel_cutin', disabled: true },
  { id: 'timeline', component: 'timeline', title: 'タイムライン (開発中)', permission: 'panel_timeline', disabled: true },
];

const NAV_ITEMS: Array<{ key: SettingsSection; label: string }> = [
  { key: 'room', label: 'ルーム設定' },
  { key: 'layout', label: 'レイアウト' },
  { key: 'members', label: 'メンバー管理' },
];

function RoomSettingsSection({
  room,
  onSaveRoom,
  onDeleteRoom,
  onClose,
  isOwner,
  canEdit,
  systems,
  dockviewApi,
}: {
  room: Room;
  onSaveRoom: (updates: {
    name?: string;
    tags?: string[];
    dice_system?: string;
    default_login_role?: 'sub_owner' | 'user' | 'guest';
    status_change_chat_enabled?: boolean;
    status_change_chat_channel?: string;
  }) => void;
  onDeleteRoom: () => void;
  onClose: () => void;
  isOwner: boolean;
  canEdit: boolean;
  systems: { id: string; name: string }[];
  dockviewApi: DockviewApi | null;
}) {
  const { channels, updateRoom } = useAdrasteaContext();
  const statusNotifyChannels = useMemo(
    () => channels.filter((c) => !c.is_archived && !isPrivateChatChannel(c)),
    [channels]
  );
  const [roomName, setRoomName] = useState(room.name);
  const [tags, setTags] = useState<string[]>(room.tags ?? []);
  const [diceSystem, setDiceSystem] = useState(room.dice_system);
  const [defaultLoginRole, setDefaultLoginRole] = useState<'sub_owner' | 'user' | 'guest'>(room.default_login_role as 'sub_owner' | 'user' | 'guest' ?? 'user');
  const [statusChangeEnabled, setStatusChangeEnabled] = useState(room.status_change_chat_enabled !== false);
  const [statusChangeChannelId, setStatusChangeChannelId] = useState(room.status_change_chat_channel ?? 'main');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const skipStatusChatPersistRef = useRef(true);

  useEffect(() => {
    setStatusChangeEnabled(room.status_change_chat_enabled !== false);
    setStatusChangeChannelId(room.status_change_chat_channel ?? 'main');
    skipStatusChatPersistRef.current = true;
  }, [room.id, room.status_change_chat_enabled, room.status_change_chat_channel]);

  useEffect(() => {
    if (!canEdit) return;
    if (skipStatusChatPersistRef.current) {
      skipStatusChatPersistRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      updateRoom({
        status_change_chat_enabled: statusChangeEnabled,
        status_change_chat_channel: statusChangeChannelId,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [statusChangeEnabled, statusChangeChannelId, canEdit, updateRoom]);

  useEffect(() => {
    const allowed = new Set(statusNotifyChannels.map((c) => c.channel_id));
    if (allowed.has(statusChangeChannelId)) return;
    const fallback =
      (allowed.has('main') ? 'main' : null) ??
      statusNotifyChannels[0]?.channel_id ??
      'main';
    setStatusChangeChannelId(fallback);
  }, [statusNotifyChannels, statusChangeChannelId]);

  const handleSave = () => {
    onSaveRoom({
      name: roomName,
      tags,
      dice_system: diceSystem,
      status_change_chat_enabled: statusChangeEnabled,
      status_change_chat_channel: statusChangeChannelId,
      ...(isOwner && {
        default_login_role: defaultLoginRole,
      }),
    });
    onClose();
  };

  const sectionHeadingStyle: React.CSSProperties = { fontSize: 11, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 12 };
  const sectionDescStyle: React.CSSProperties = { fontSize: 11, color: theme.textMuted, marginBottom: 4 };
  const selectStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 12, background: theme.bgSurface, color: theme.textPrimary, border: `1px solid ${theme.border}`, outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: canEdit ? 1 : 0.5, pointerEvents: canEdit ? 'auto' : 'none' }}>
      {/* ── 基本情報 ── */}
      <div style={sectionHeadingStyle}>基本情報</div>
      <AdInput
        label="ルーム名"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        disabled={!canEdit}
      />
      <AdTagInput tags={tags} onChange={setTags} existingTags={[]} />
      <DiceSystemPicker
        value={diceSystem}
        onChange={setDiceSystem}
        systems={systems}
      />

      {/* ── 盤面 ── */}
      <div style={sectionHeadingStyle}>盤面</div>
      <AdCheckbox
        label={<span style={{ color: theme.textPrimary }}>グリッドを表示する</span>}
        checked={room.grid_visible}
        disabled={!canEdit}
        onChange={(v) => updateRoom({ grid_visible: v })}
      />

      {/* ── チャット ── */}
      <div style={sectionHeadingStyle}>チャット</div>
      <div style={sectionDescStyle}>
        ステータスパネルで HP などの数値を変えたとき、確定後に選択したチャットへ一行ずつ流します（ステータス非公開のキャラは除く）
      </div>
      <AdCheckbox
        label={<span style={{ color: theme.textPrimary }}>ステータス変更をチャットに通知</span>}
        checked={statusChangeEnabled}
        disabled={!canEdit}
        onChange={setStatusChangeEnabled}
      />
      {statusChangeEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionDescStyle}>通知先チャンネル</div>
          <select
            value={statusChangeChannelId}
            onChange={(e) => setStatusChangeChannelId(e.target.value)}
            disabled={!canEdit}
            style={selectStyle}
          >
            {statusNotifyChannels.map((ch) => (
              <option key={ch.channel_id} value={ch.channel_id}>
                {ch.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── 管理 ── */}
      {isOwner && (
        <>
          <div style={sectionHeadingStyle}>管理</div>
          <div style={sectionDescStyle}>
            新しく参加するユーザーに自動で付与されるロール
          </div>
          <select
            value={defaultLoginRole}
            onChange={(e) => setDefaultLoginRole(e.target.value as 'sub_owner' | 'user' | 'guest')}
            disabled={!canEdit}
            style={selectStyle}
          >
            <option value="sub_owner">サブオーナー</option>
            <option value="user">ユーザー</option>
            <option value="guest">ゲスト</option>
          </select>
        </>
      )}
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          {isOwner ? (
            <AdButton variant="danger" onClick={() => setShowDeleteConfirm(true)}>
              ルームを削除
            </AdButton>
          ) : (
            <div />
          )}
          <AdButton variant="primary" onClick={handleSave}>
            保存
          </AdButton>
        </div>
      )}
      {!canEdit && (
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
          ルーム設定の変更にはオーナー権限が必要です
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmModal
          message={`「${room.name}」を削除しますか？この操作は取り消せません。`}
          confirmLabel="削除"
          danger
          onConfirm={() => onDeleteRoom()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* 開発者 */}
      <div style={{ pointerEvents: 'auto', opacity: 1 }}>
        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>
          開発者
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: theme.textPrimary }}>デバッグコンソール</span>
          <AdButton
            onClick={() => {
              if (!dockviewApi) return;
              const existing = dockviewApi.getPanel('debugConsole');
              if (existing) {
                existing.api.setActive();
              } else {
                let targetGroup = dockviewApi.activeGroup;
                if (targetGroup?.panels.some(p => p.id === 'board')) {
                  targetGroup = dockviewApi.groups.find(g => !g.panels.some(p => p.id === 'board')) ?? undefined;
                }
                if (targetGroup) {
                  dockviewApi.addPanel({ id: 'debugConsole', component: 'debugConsole', title: 'Debug Console', position: { referenceGroup: targetGroup, direction: 'within' } });
                }
              }
            }}
          >
            {dockviewApi?.getPanel('debugConsole') ? '表示中' : '表示する'}
          </AdButton>
        </div>
      </div>
    </div>
  );
}

function LayoutSection({
  dockviewApi,
  can,
  onClose: _onClose,
}: {
  dockviewApi: DockviewApi | null;
  can: (permission: PermissionKey) => boolean;
  onClose: () => void;
}) {
  const { statusPanelBoardOverlay, setStatusPanelBoardOverlay, roomRole } = useAdrasteaContext();
  const [, forceUpdate] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [layouts, setLayouts] = useState(() => getSavedLayouts());
  const [newLayoutName, setNewLayoutName] = useState('');
  const [layoutApplyError, setLayoutApplyError] = useState<string | null>(null);

  /** 盤面オーバーメタ付きで適用（保存済みレイアウトクリック時など） */
  const applyLayout = (
    layout: object,
    overlayMeta?: { statusPanelOnBoard?: boolean; statusOverlayVisibility?: Record<string, boolean> }
  ) => {
    if (!dockviewApi) return false;
    try {
      // fromJSON 前に全グループの幅制約を解除
      dockviewApi.groups.forEach((g) => relaxGroupWidth(g));

      // 比率ベースレイアウトをスケーリング
      let layoutToApply = layout;
      if ((layout as any).grid?.width === 1) {
        layoutToApply = scaleLayout(layout, dockviewApi.width, dockviewApi.height);
      }
      layoutToApply = sanitizeDockviewLayoutForRole(layoutToApply, roomRole as RoomRole);

      dockviewApi.fromJSON(layoutToApply as Parameters<typeof dockviewApi.fromJSON>[0]);
      if (overlayMeta) {
        setStatusPanelBoardOverlay(migrateStatusPanelBoardOverlay(overlayMeta));
      }
      requestAnimationFrame(() => requestAnimationFrame(() => fixAllNonBoardWidths(dockviewApi)));
      forceUpdate((c) => c + 1);
      return true;
    } catch {
      return false;
    }
  };

  const togglePanel = (panelId: string, component: string, title: string) => {
    if (!dockviewApi) return;
    const existing = dockviewApi.getPanel(panelId);
    if (existing) {
      dockviewApi.removePanel(existing);
    } else {
      dockviewApi.addPanel({
        id: panelId,
        component,
        title,
        floating: true,
      });
    }
    forceUpdate((n) => n + 1);
  };

  // ユーザー権限とサブオーナー以上で分ける
  const userPanels = PANEL_DEFS.filter((p) =>
    ['panel_board', 'panel_character', 'panel_chat', 'panel_status', 'panel_property', 'panel_pdfViewer'].includes(p.permission)
  );
  const subOwnerPanels = PANEL_DEFS.filter((p) =>
    ['panel_scene', 'panel_layer', 'panel_bgm', 'panel_scenarioText', 'panel_cutin', 'panel_timeline'].includes(p.permission)
  );

  const sectionHeaderStyle = {
    fontSize: '11px',
    color: theme.textMuted,
    marginBottom: '8px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  };

  const renderPanelRow = (p: PanelDef) => {
    const exists = !!dockviewApi?.getPanel(p.id);
    const lacksPermission = !can(p.permission);
    const disabled = Boolean(p.disabled) || lacksPermission;
    return (
      <div
        key={p.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          borderBottom: `1px solid ${theme.borderSubtle}`,
        }}
      >
        <span style={{ fontSize: '12px', color: disabled ? theme.textMuted : theme.textPrimary }}>
          {p.title}
        </span>
        <AdButton
          onClick={() => togglePanel(p.id, p.component, p.title)}
          style={{ fontSize: '11px' }}
          disabled={disabled}
        >
          {exists ? '非表示' : '表示する'}
        </AdButton>
      </div>
    );
  };

  return (
    <div>
      {userPanels.length > 0 && (
        <>
          <div style={sectionHeaderStyle}>パネル</div>
          <div>{userPanels.map(renderPanelRow)}</div>
        </>
      )}
      {subOwnerPanels.length > 0 && (
        <>
          <div style={{ ...sectionHeaderStyle, marginTop: '16px' }}>管理者パネル</div>
          <div>{subOwnerPanels.map(renderPanelRow)}</div>
        </>
      )}
      {/* 保存済みレイアウト */}
      <div style={{ ...sectionHeaderStyle, marginTop: '16px' }}>保存済みレイアウト</div>
      <div style={{ padding: '6px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {layouts.length === 0 && (
          <div style={{ fontSize: '11px', color: theme.textMuted }}>保存済みレイアウトはありません</div>
        )}
        {layouts.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
              <div
                onClick={() => {
                  if (
                    !applyLayout(l.layout, {
                      statusPanelOnBoard: l.statusPanelOnBoard,
                      statusOverlayVisibility: l.statusOverlayVisibility,
                    })
                  ) {
                    setLayoutApplyError('レイアウトの適用に失敗しました');
                    setTimeout(() => setLayoutApplyError(null), 5000);
                  }
                }}
                style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary }}
              >
                {l.name}
              </div>
              <Tooltip label="今の配置でこのプリセットを上書き">
                <AdButton
                  type="button"
                  onClick={() => {
                    if (!dockviewApi) return;
                    if (!updateLayout(l.id, dockviewApi.toJSON(), statusPanelBoardOverlay)) return;
                    setLayouts(getSavedLayouts());
                  }}
                  style={{ fontSize: '10px', padding: '2px 8px', flexShrink: 0 }}
                  disabled={!dockviewApi}
                >
                  更新
                </AdButton>
              </Tooltip>
              <Trash2
                size={13}
                style={{ cursor: 'pointer', color: theme.textMuted, flexShrink: 0 }}
                onClick={() => {
                  deleteLayout(l.id);
                  setLayouts(getSavedLayouts());
                }}
              />
            </div>
          ))}
        {layoutApplyError && (
          <div style={{ fontSize: '11px', color: theme.danger }}>{layoutApplyError}</div>
        )}
        {/* 新規保存 */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <input
            type="text"
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            placeholder="レイアウト名"
            maxLength={128}
            style={{
              flex: 1,
              fontSize: '11px',
              padding: '4px 6px',
              background: theme.bgInput,
              color: theme.textPrimary,
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              outline: 'none',
            }}
          />
          <AdButton
            onClick={() => {
              if (!dockviewApi || !newLayoutName.trim()) return;
              addLayout(newLayoutName.trim(), dockviewApi.toJSON(), statusPanelBoardOverlay);
              setLayouts(getSavedLayouts());
              setNewLayoutName('');
            }}
            style={{ fontSize: '11px', flexShrink: 0 }}
          >
            保存
          </AdButton>
        </div>
      </div>
      {/* レイアウトエクスポート */}
      <div style={{ ...sectionHeaderStyle, marginTop: '16px' }}>レイアウト操作</div>
      <div style={{ padding: '6px 0' }}>
        <AdButton
          onClick={() => {
            if (!dockviewApi) return;
            const json = JSON.stringify(
              {
                _adrasteaLayoutExport: 1 as const,
                layout: dockviewApi.toJSON(),
                statusPanelOnBoard: statusPanelBoardOverlay,
              },
              null,
              2
            );
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `adrastea-layout-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{ fontSize: '11px' }}
        >
          レイアウトをエクスポート
        </AdButton>
        <AdButton
          onClick={() => {
            if (!dockviewApi) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(reader.result as string) as Record<string, unknown>;
                  const isWrapped =
                    parsed._adrasteaLayoutExport === 1 &&
                    parsed.layout &&
                    typeof parsed.layout === 'object';
                  const dockJson = (isWrapped ? parsed.layout : parsed) as object;
                  const overlayMeta = isWrapped
                    ? {
                        statusPanelOnBoard: parsed.statusPanelOnBoard as boolean | undefined,
                      }
                    : undefined;
                  if (!applyLayout(dockJson, overlayMeta)) {
                    setImportError('読み込みに失敗しました。正しいJSONファイルか確認してください。');
                    setTimeout(() => setImportError(null), 5000);
                  }
                } catch {
                  setImportError('読み込みに失敗しました。正しいJSONファイルか確認してください。');
                  setTimeout(() => setImportError(null), 5000);
                }
              };
              reader.readAsText(file);
            };
            input.click();
          }}
          style={{ fontSize: '11px', marginTop: '4px' }}
        >
          レイアウトをインポート
        </AdButton>
        {importError && (
          <div style={{ fontSize: '11px', color: theme.danger, marginTop: '4px' }}>{importError}</div>
        )}
        <AdButton
          onClick={() => {
            localStorage.removeItem('adrastea-layouts');
            localStorage.removeItem('adrastea-dock-layout-gm');
            localStorage.removeItem('adrastea-dock-layout-owner');
            localStorage.removeItem('adrastea-dock-layout-sub_owner');
            localStorage.removeItem('adrastea-dock-layout-user');
            localStorage.removeItem('adrastea-dock-layout-guest');
            window.location.reload();
          }}
          style={{ fontSize: '11px', marginTop: '4px', color: theme.danger }}
        >
          レイアウトデータをリセット
        </AdButton>
      </div>
    </div>
  );
}

function MembersSection({
  members,
  onAssignRole,
  canEdit,
}: {
  members: Array<{ user_id: string; role: string; joined_at: number; display_name: string | null; avatar_url: string | null }>;
  onAssignRole: (targetUserId: string, role: 'sub_owner' | 'user' | 'guest') => void;
  canEdit: boolean;
}) {
  return (
    <div style={{ opacity: canEdit ? 1 : 0.5, pointerEvents: canEdit ? 'auto' : 'none' }}>
      <div style={{
        fontSize: 11,
        color: theme.textMuted,
        marginBottom: 8,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        メンバー一覧
      </div>
      <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
        オーナーのロールは変更できません
      </div>
      {members.length === 0 ? (
        <div style={{ color: theme.textMuted, fontSize: 12 }}>メンバーがいません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {members.map((m) => (
            <div
              key={m.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: `1px solid ${theme.borderSubtle}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    draggable={false}
                  />
                ) : (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: theme.border,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: theme.textMuted, flexShrink: 0,
                  }}>
                    {(m.display_name ?? '?').charAt(0)}
                  </div>
                )}
                <span style={{ fontSize: 12, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.display_name ?? m.user_id}
                </span>
              </div>
              {m.role === 'owner' ? (
                <span style={{ fontSize: 11, color: theme.textMuted, padding: '2px 8px' }}>オーナー</span>
              ) : (
                <select
                  value={m.role}
                  onChange={(e) => onAssignRole(m.user_id, e.target.value as 'sub_owner' | 'user' | 'guest')}
                  style={{
                    padding: '4px 6px',
                    fontSize: 11,
                    background: theme.bgSurface,
                    color: theme.textPrimary,
                    border: `1px solid ${theme.border}`,
                    outline: 'none',
                  }}
                >
                  <option value="sub_owner">サブオーナー</option>
                  <option value="user">ユーザー</option>
                  <option value="guest">ゲスト</option>
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export function SettingsModal({
  initialSection = 'room',
  room,
  onSaveRoom,
  onDeleteRoom,
  dockviewApi,
  can,
  onClose,
  isOwner,
  members,
  onAssignRole,
}: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [diceSystems, setDiceSystems] = useState<{id:string;name:string}[]>([]);

  useEffect(() => {
    getAvailableSystems().then(setDiceSystems).catch(console.error);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="adrastea-root"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '440px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowLg,
          display: 'flex',
          zIndex: 9999,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* サイドバー */}
        <div
          style={{
            width: '160px',
            background: theme.bgSurface,
            borderRight: `1px solid ${theme.border}`,
            position: 'relative',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px 12px 8px',
              fontSize: '11px',
              color: theme.textMuted,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            設定
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {NAV_ITEMS.map((item) => {
              const restricted = (item.key === 'room' && !can('room_settings')) || (item.key === 'members' && !isOwner);
              return (
              <button
                key={item.key}
                onClick={() => !restricted && setSection(item.key)}
                disabled={restricted}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: restricted ? 'not-allowed' : 'pointer',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  display: 'block',
                  opacity: restricted ? 0.35 : 1,
                  background:
                    section === item.key ? theme.bgElevated : 'transparent',
                  color:
                    section === item.key ? theme.textPrimary : theme.textSecondary,
                }}
              >
                {item.label}
              </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <div style={{ borderTop: `1px solid ${theme.border}` }}>
              <button
                onClick={() => { window.location.href = '/adrastea'; }}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  display: 'block',
                  background: 'transparent',
                  color: theme.textSecondary,
                }}
              >
                ルームから退出
              </button>
            </div>
          </div>

          {/* 閉じるボタン */}
          <Tooltip label="閉じる">
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: theme.textMuted,
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>

        {/* コンテンツエリア */}
        <div
          style={{
            flex: 1,
            background: theme.bgElevated,
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          {section === 'room' && (
            <RoomSettingsSection
              room={room}
              onSaveRoom={onSaveRoom}
              onDeleteRoom={onDeleteRoom}
              onClose={onClose}
              isOwner={isOwner}
              canEdit={can('room_settings')}
              systems={diceSystems}
              dockviewApi={dockviewApi}
            />
          )}
          {section === 'layout' && (
            <LayoutSection
              dockviewApi={dockviewApi}
              can={can}
              onClose={onClose}
            />
          )}
          {section === 'members' && (
            <MembersSection
              members={members}
              onAssignRole={onAssignRole}
              canEdit={isOwner}
            />
          )}
        </div>
      </div>
    </div>
  );
}
