import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ADRASTEA_VERSION, ADRASTEA_STAGE } from '../config/adrastea';
import { theme } from '../styles/theme';
import { useRooms, type RoomUI } from '../hooks/useRooms';
import { useAuth } from '../contexts/AuthContext';
import { getAvailableSystems } from '../services/diceRoller';
import { AdModal, AdInput, AdButton, AdComboBox, AdTagInput, ConfirmModal } from './ui/AdComponents';
import type { ComboTagItem } from './ui/AdComponents';
import { Tooltip } from './ui';
import { DiceSystemPicker } from './ui/DiceSystemPicker';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Pencil, X, Share2, Copy } from 'lucide-react';
import { ProfileEditModal } from './ProfileEditModal';

interface RoomLobbyProps {
  onRoomCreated: (roomId: string) => void;
}

// ── ダイスシステムキャッシュ ──
let cachedSystems: { id: string; name: string }[] | null = null;
let systemsPromise: Promise<{ id: string; name: string }[]> | null = null;

function loadSystems(): Promise<{ id: string; name: string }[]> {
  if (cachedSystems) return Promise.resolve(cachedSystems);
  if (!systemsPromise) {
    systemsPromise = getAvailableSystems().then((s) => {
      cachedSystems = s;
      return s;
    }).catch((err) => {
      systemsPromise = null; // リトライ可能にする
      throw err;
    });
  }
  return systemsPromise;
}

// ── Sortable ルームカード ──
function SortableRoomCard({
  room,
  diceSystemName,
  onEnter,
  onEdit,
  onDelete,
  onShare,
}: {
  room: RoomUI;
  diceSystemName: string | null;
  onEnter: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'border-color 0.15s, box-shadow 0.15s',
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging || hovered ? theme.shadowMd : theme.shadowSm,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? theme.bgElevated : theme.bgSurface,
        border: `1px solid ${hovered ? theme.accentHover : theme.border}`,
        borderTop: hovered ? `2px solid ${theme.accent}` : `2px solid transparent`,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'grab',
        overflow: 'hidden',
        position: 'relative',
        transition: 'background 0.15s, border-color 0.15s',
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      {/* サムネイル */}
      <div
        onClick={onEnter}
        style={{
          height: '120px',
          background: `linear-gradient(135deg, ${theme.accentGradientFrom} 0%, ${theme.accentGradientTo} 100%)`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span style={{ fontSize: '28px', color: theme.textMuted, opacity: 0.3 }}>🎲</span>
      </div>

      {/* 情報エリア */}
      <div
        onClick={onEnter}
        style={{ padding: '10px 12px', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: theme.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {room.name}
        </div>

        {(diceSystemName || room.tags.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {diceSystemName && (
              <span
                style={{
                  padding: '0 5px',
                  fontSize: '10px',
                  background: theme.greenBgSubtle,
                  color: theme.green,
                  border: `1px solid ${theme.greenBorderSubtle}`,
                }}
              >
                {diceSystemName}
              </span>
            )}
            {room.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '0 5px',
                  fontSize: '10px',
                  background: theme.accentBgSubtle,
                  color: theme.accent,
                  border: `1px solid ${theme.accentBorderSubtle}`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: 'auto' }}>
          {new Date(room.updated_at).toLocaleDateString('ja-JP')}
        </div>
      </div>

      {/* アクションボタン */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          display: 'flex',
          gap: '2px',
        }}
      >
        <Tooltip label="共有">
          <button
            className="adra-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              color: theme.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          >
            <Share2 size={12} />
          </button>
        </Tooltip>
        <Tooltip label="編集">
          <button
            className="adra-btn-icon"
            onClick={onEdit}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              color: theme.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          >
            <Pencil size={12} />
          </button>
        </Tooltip>
        <Tooltip label="削除">
          <button
            className="adra-btn-icon adra-btn-icon--danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              color: theme.danger,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            }}
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── メイン ──
const RoomLobby: React.FC<RoomLobbyProps> = ({ onRoomCreated }) => {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { rooms, loading, deleteRoom, updateRoom, reorderRooms, addRoom } = useRooms(user?.uid);
  const [diceSystems, setDiceSystems] = useState<{ id: string; name: string }[]>(cachedSystems ?? []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomUI | null>(null);
  const [searchFilters, setSearchFilters] = useState<ComboTagItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [shareRoom, setShareRoom] = useState<RoomUI | null>(null);
  const [copied, setCopied] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  // マウント時にダイスシステム一覧を先行ロード
  useEffect(() => {
    loadSystems().then(setDiceSystems).catch(console.error);
  }, []);

  // 作成フォーム state
  const [createName, setCreateName] = useState('');
  const [createDice, setCreateDice] = useState('DiceBot');
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // 編集フォーム state
  const [editName, setEditName] = useState('');
  const [editDice, setEditDice] = useState('DiceBot');
  const [editTags, setEditTags] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ダイスシステム id → name のマップ（O(1)参照用）
  const diceSystemNameMap = useMemo(() => new Map(diceSystems.map((s) => [s.id, s.name])), [diceSystems]);

  // 全ルームの既存タグ一覧（使用回数順）
  const allExistingTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rooms) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [rooms]);

  // 検索候補（タグ+ダイスシステムをカテゴリ付きで）
  const searchSuggestions = useMemo(() => {
    // タグ（使用回数順）
    const tagCounts = new Map<string, number>();
    for (const r of rooms) for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const tagItems = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => ({ label: tag, category: 'tag' } as ComboTagItem));

    // ダイスシステム
    const diceItems = diceSystems.map((s) => ({ label: s.name, category: 'dice_system' } as ComboTagItem));

    return [...tagItems, ...diceItems];
  }, [rooms, diceSystems]);

  // フィルター済みルーム（名前・タグ・ダイスシステムで検索）
  const filteredRooms = useMemo(() => {
    // カテゴリ別にフィルタ分離
    const selectedTags: string[] = [];
    const selectedDiceSystems: string[] = [];
    for (const f of searchFilters) {
      if (typeof f === 'string') continue;
      if (f.category === 'tag') selectedTags.push(f.label);
      else if (f.category === 'dice_system') selectedDiceSystems.push(f.label);
    }

    const q = searchText.trim().toLowerCase();

    return rooms.filter((r) => {
      // ダイスシステムフィルタ（選択あれば AND）
      if (selectedDiceSystems.length > 0) {
        const roomDiceName = diceSystemNameMap.get(r.dice_system) ?? r.dice_system;
        if (!selectedDiceSystems.includes(roomDiceName) && !selectedDiceSystems.includes(r.dice_system)) return false;
      }
      // タグフィルタ（選択タグのいずれかを持っていれば OK = OR）
      if (selectedTags.length > 0) {
        if (!selectedTags.some((t) => r.tags.includes(t))) return false;
      }
      // フリーテキストでルーム名・タグ・ダイスシステム検索
      if (q) {
        return r.name.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.dice_system.toLowerCase().includes(q) ||
          (diceSystemNameMap.get(r.dice_system)?.toLowerCase().includes(q) ?? false);
      }
      return true;
    });
  }, [rooms, searchFilters, searchText, diceSystemNameMap]);

  // ── 作成 ──
  const creatingRef = useRef(false);
  const handleCreate = async () => {
    const name = createName.trim();
    if (!name || creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);
    try {
      const id = await addRoom(name, createDice, createTags);
      onRoomCreated(id);
    } catch (error) {
      console.error('ルーム作成に失敗しました:', error);
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  // ── 削除 ──
  const [deleteTarget, setDeleteTarget] = useState<RoomUI | null>(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteRoom(deleteTarget.id);
    setDeleteTarget(null);
  };

  // ── 編集モーダル開く ──
  const openEditModal = (room: RoomUI) => {
    setEditingRoom(room);
    setEditName(room.name);
    setEditDice(room.dice_system);
    setEditTags([...room.tags]);
  };

  // ── 編集保存 ──
  const handleEditSave = async () => {
    if (!editingRoom) return;
    try {
      await updateRoom(editingRoom.id, {
        name: editName.trim() || editingRoom.name,
        dice_system: editDice,
        tags: editTags,
      });
      setEditingRoom(null);
    } catch (err) {
      console.error('ルーム更新に失敗:', err);
    }
  };

  // ── DnD ──
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = filteredRooms.map((r) => r.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newIds = arrayMove(ids, oldIndex, newIndex);
    // 検索中でないときだけ全体の並び順を保存
    if (!searchText.trim() && searchFilters.length === 0) {
      reorderRooms(newIds);
    } else {
      // 検索中はフィルターされてない room の位置を維持しつつ並び替え
      const allIds = rooms.map((r) => r.id);
      const filtered = new Set(filteredRooms.map((r) => r.id));
      const result: string[] = [];
      let fi = 0;
      for (const id of allIds) {
        if (filtered.has(id)) {
          result.push(newIds[fi++]);
        } else {
          result.push(id);
        }
      }
      reorderRooms(result);
    }
  };

  const handleCreateDiceChange = (id: string) => {
    setCreateDice(id);
  };

  const handleEditDiceChange = (id: string) => {
    setEditDice(id);
  };

  return (
    <div
      className="adrastea-root"
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.bgDeep,
        color: theme.textPrimary,
        overflow: 'auto',
      }}
    >
      {/* ヘッダー */}
      <div style={{ padding: '24px 32px 0', textAlign: 'center', position: 'relative' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.05em', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Adrastea
          <span style={{ fontSize: '0.7rem', fontWeight: 400, color: theme.textMuted, marginLeft: '6px' }}>
            {ADRASTEA_STAGE} {ADRASTEA_VERSION}
          </span>
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: '0.8rem', color: theme.textMuted }}>
          TRPGオンラインセッションツール
        </p>
        <div style={{ position: 'absolute', top: '24px', right: '32px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip label="ユーザー設定">
            <button
              type="button"
              onClick={() => setShowProfileEdit(true)}
              className="adra-btn adra-btn--ghost"
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
        </div>
      </div>

      {/* 検索 */}
      <div style={{ padding: '0 32px 12px', maxWidth: '500px', margin: '0 auto' }}>
        <AdComboBox
          mode="multi"
          tags={searchFilters}
          onChange={setSearchFilters}
          suggestions={searchSuggestions}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          categoryConfig={{
            tag: { displayName: 'タグ', chipBg: theme.accentBgSubtle, chipBorder: theme.accentBorderSubtle },
            dice_system: { displayName: 'ダイスシステム', chipBg: theme.greenBgSubtle, chipBorder: theme.greenBorderSubtle },
          }}
          label=""
          hideAddButton
          placeholder="ルーム名・タグ・ダイスシステムで検索..."
        />
      </div>

      {/* カードグリッド */}
      <div style={{ padding: '0 32px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted, fontSize: '13px' }}>
            読み込み中...
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredRooms.map((r) => r.id)} strategy={rectSortingStrategy}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                {/* 新規作成カード */}
                <div
                  className="adra-card-create"
                  onClick={() => {
                    setCreateName('');
                    setCreateDice('DiceBot');
                    setCreateTags([]);
                    setShowCreateModal(true);
                  }}
                  style={{
                    border: `2px dashed ${theme.border}`,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    minHeight: '100px',
                    color: theme.textMuted,
                    fontSize: '13px',
                  }}
                >
                  <Plus size={24} />
                  ルームを作成
                </div>

                {/* ルームカード */}
                {filteredRooms.map((room) => (
                  <SortableRoomCard
                    key={room.id}
                    room={room}
                    diceSystemName={
                      room.dice_system !== 'DiceBot'
                        ? (diceSystemNameMap.get(room.dice_system) ?? room.dice_system)
                        : null
                    }
                    onEnter={() => onRoomCreated(room.id)}
                    onEdit={() => openEditModal(room)}
                    onDelete={() => setDeleteTarget(room)}
                    onShare={() => { setShareRoom(room); setCopied(false); }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 作成モーダル */}
      {showCreateModal && (
        <AdModal
          title="ルームを作成"
          width="400px"
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <AdButton onClick={() => setShowCreateModal(false)}>キャンセル</AdButton>
              <AdButton
                variant="primary"
                disabled={!createName.trim() || isCreating}
                onClick={handleCreate}
              >
                {isCreating ? '作成中...' : '作成'}
              </AdButton>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AdInput
              label="ルーム名"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder="例: 第1回セッション"
              autoFocus
            />
            <DiceSystemPicker value={createDice} onChange={handleCreateDiceChange} systems={diceSystems} />
            <AdTagInput tags={createTags} onChange={setCreateTags} existingTags={allExistingTags} />
          </div>
        </AdModal>
      )}

      {/* 編集モーダル */}
      {editingRoom && (
        <AdModal
          title="ルームを編集"
          width="400px"
          onClose={() => setEditingRoom(null)}
          footer={
            <>
              <AdButton onClick={() => setEditingRoom(null)}>キャンセル</AdButton>
              <AdButton variant="primary" onClick={handleEditSave}>
                保存
              </AdButton>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <AdInput
              label="ルーム名"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <DiceSystemPicker value={editDice} onChange={handleEditDiceChange} systems={diceSystems} />
            <AdTagInput tags={editTags} onChange={setEditTags} existingTags={allExistingTags} />
          </div>
        </AdModal>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <ConfirmModal
          message={`「${deleteTarget.name}」を削除しますか？この操作は取り消せません。`}
          confirmLabel="削除"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 共有モーダル */}
      {shareRoom && (
        <AdModal
          title={`「${shareRoom.name}」を共有`}
          width="480px"
          onClose={() => setShareRoom(null)}
          footer={
            <AdButton onClick={() => setShareRoom(null)}>閉じる</AdButton>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
            <div
              style={{
                padding: '8px 12px',
                background: theme.bgInput,
                border: `1px solid ${theme.borderInput}`,
                fontSize: '12px',
                color: theme.textPrimary,
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {`${window.location.origin}/adrastea/${shareRoom.id}`}
            </div>
            <AdButton
              variant="primary"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/adrastea/${shareRoom.id}`);
                setCopied(true);
              }}
            >
              <Copy size={12} />
              {copied ? 'コピーしました' : 'リンクをコピー'}
            </AdButton>
          </div>
        </AdModal>
      )}

      {/* プロフィール編集モーダル */}
      {showProfileEdit && profile && (
        <ProfileEditModal
          profile={profile}
          onSave={updateProfile}
          onSignOut={signOut}
          onClose={() => setShowProfileEdit(false)}
        />
      )}
    </div>
  );
};

export default RoomLobby;
