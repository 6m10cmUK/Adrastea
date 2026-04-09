import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../styles/theme';

type TabType = 'users' | 'rooms' | 'assets';
type SortOrder = 'asc' | 'desc';

interface AdminUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminRoom {
  id: string;
  name: string;
  owner_id: string;
  description: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

interface RoomMember {
  room_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  users: { display_name: string | null; avatar_url: string | null };
}

interface AssetItem {
  id: string;
  title: string;
  ownerId: string;
  size: number;
  type: string;
  createdAt: number;
  url?: string;
}

function CopyableText({ value, compact }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayText = compact && value.length > 8 ? `${value.slice(0, 8)}...` : value;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'コピーしました' : value}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        color: copied ? theme.accent : theme.textSecondary,
        cursor: 'copy',
        fontSize: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {displayText}
    </button>
  );
}

export default function AdrasteaAdmin() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user, token } = useAuth();
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL || '';

  const adminFetch = async (path: string, options?: RequestInit) => {
    const res = await fetch(`${workerUrl}/api/admin${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // admin 判定とデータ初期読み込み
  useEffect(() => {
    async function checkAdminAndLoad() {
      if (!user || !token) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // admin 判定 兼 ルーム一覧取得
        const roomsData = await adminFetch('/rooms');
        setIsAdmin(true);
        setRooms(Array.isArray(roomsData) ? roomsData : []);

        // ユーザー一覧を読み込む
        const usersData = await adminFetch('/users');
        setUsers(Array.isArray(usersData) ? usersData : []);

        // アセット一覧を読み込む
        const assetsData = await adminFetch('/assets');
        setAssets(Array.isArray(assetsData) ? assetsData : []);

        setError(null);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to load admin data';
        if (errMsg.includes('HTTP 403')) {
          setIsAdmin(false);
        } else {
          setError(errMsg);
          setIsAdmin(true); // admin だがエラーが発生
        }
      } finally {
        setLoading(false);
      }
    }

    checkAdminAndLoad();
  }, [user, token, workerUrl]);

  // アクセス権チェック
  if (isAdmin === false) {
    return (
      <div
        className="adrastea-root"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.bgBase,
          color: theme.textPrimary,
          fontSize: '1rem',
        }}
      >
        アクセス権がありません
      </div>
    );
  }

  // 読み込み中
  if (isAdmin === undefined) {
    return (
      <div
        className="adrastea-root"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.bgBase,
          color: theme.textPrimary,
          fontSize: '1rem',
        }}
      >
        読み込み中...
      </div>
    );
  }

  return (
    <div
      className="adrastea-root"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: theme.bgBase,
        color: theme.textPrimary,
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          padding: '16px 20px',
          background: theme.bgToolbar,
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>管理者パネル</h1>
        <a
          href="/adrastea"
          style={{
            padding: '8px 16px',
            background: theme.accent,
            color: theme.textOnAccent,
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          戻る
        </a>
      </div>

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${theme.border}`,
          padding: '0 20px',
          background: theme.bgSurface,
        }}
      >
        {(['users', 'rooms', 'assets'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: activeTab === tab ? theme.accent : theme.textSecondary,
              borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
              transition: 'color 0.2s ease',
            }}
          >
            {tab === 'users' ? 'ユーザー' : tab === 'rooms' ? 'ルーム' : 'アセット'}
          </button>
        ))}
      </div>

      {/* エラー表示 */}
      {error && (
        <div
          style={{
            padding: '12px 20px',
            background: theme.dangerBgSubtle,
            color: theme.danger,
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '0.875rem',
          }}
        >
          エラー: {error}
        </div>
      )}

      {/* コンテンツ */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {loading ? (
          <div style={{ color: theme.textSecondary }}>読み込み中...</div>
        ) : (
          <>
            {activeTab === 'users' && <UsersTab users={users} adminFetch={adminFetch} setUsers={setUsers} />}
            {activeTab === 'rooms' && <RoomsTab rooms={rooms} adminFetch={adminFetch} setRooms={setRooms} />}
            {activeTab === 'assets' && <AssetsTab assets={assets} adminFetch={adminFetch} setAssets={setAssets} />}
          </>
        )}
      </div>
    </div>
  );
}

function UsersTab({
  users,
  adminFetch,
  setUsers,
}: {
  users: AdminUser[];
  adminFetch: (path: string, options?: RequestInit) => Promise<any>;
  setUsers: (users: AdminUser[]) => void;
}) {
  const [editingNameByUserId, setEditingNameByUserId] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'display_name' | 'created_at'>('display_name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const getEditingUserName = (user: AdminUser) => editingNameByUserId[user.id] ?? user.display_name ?? '';
  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const withName = users.map((user) => ({ ...user, _displayName: user.display_name ?? '' }));

    const searched = normalizedQuery
      ? withName.filter((user) => {
          const displayNameMatch = user._displayName.toLowerCase().includes(normalizedQuery);
          const idMatch = user.id.toLowerCase().includes(normalizedQuery);
          return displayNameMatch || idMatch;
        })
      : withName;

    return searched.sort((a, b) => {
      let compared = 0;
      if (sortKey === 'created_at') {
        compared = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        compared = a._displayName.localeCompare(b._displayName, 'ja');
      }
      return sortOrder === 'asc' ? compared : -compared;
    });
  }, [users, searchQuery, sortKey, sortOrder]);

  const toggleSort = (nextKey: 'display_name' | 'created_at') => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortOrder('asc');
  };

  const sortMark = (key: 'display_name' | 'created_at') => (sortKey === key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '');

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('このユーザーを削除しますか？')) {
      return;
    }
    try {
      await adminFetch(`/users/${userId}`, { method: 'DELETE' });
      setUsers(users.filter((u) => u.id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleSaveUserName = async (user: AdminUser) => {
    const nextName = getEditingUserName(user).trim();
    if (!nextName) {
      alert('表示名は空にできません');
      return;
    }

    if (nextName === (user.display_name ?? '')) {
      return;
    }

    setSavingUserId(user.id);
    try {
      await adminFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: nextName }),
      });
      setUsers(users.map((u) => (u.id === user.id ? { ...u, display_name: nextName } : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user name');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>
        ユーザー一覧 ({users.length})
      </h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="表示名 / ユーザーID で検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            minWidth: '220px',
            padding: '8px 10px',
            background: theme.bgInput,
            color: theme.textPrimary,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div style={{ color: theme.textSecondary }}>ユーザーがありません</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('display_name')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    表示名{sortMark('display_name')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  ID
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  アバター
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('created_at')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    作成日時{sortMark('created_at')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  URL
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  style={{
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        value={getEditingUserName(user)}
                        onChange={(e) =>
                          setEditingNameByUserId((prev) => ({ ...prev, [user.id]: e.target.value }))
                        }
                        style={{
                          minWidth: '180px',
                          padding: '6px 8px',
                          background: theme.bgInput,
                          color: theme.textPrimary,
                          border: `1px solid ${theme.borderInput}`,
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}
                      />
                      <button
                        onClick={() => handleSaveUserName(user)}
                        disabled={savingUserId === user.id}
                        style={{
                          padding: '6px 10px',
                          background: theme.accent,
                          color: theme.textOnAccent,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: savingUserId === user.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          opacity: savingUserId === user.id ? 0.7 : 1,
                        }}
                      >
                        保存
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary, fontSize: '0.8rem' }}>
                    <CopyableText value={user.id} compact />
                  </td>
                  <td style={{ padding: '12px' }}>
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="avatar"
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary }}>
                    {new Date(user.created_at).toLocaleString('ja-JP')}
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      style={{
                        padding: '6px 12px',
                        background: theme.danger,
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoomsTab({
  rooms,
  adminFetch,
  setRooms,
}: {
  rooms: AdminRoom[];
  adminFetch: (path: string, options?: RequestInit) => Promise<any>;
  setRooms: (rooms: AdminRoom[]) => void;
}) {
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [membersCache, setMembersCache] = useState<Record<string, RoomMember[]>>({});
  const [membersLoading, setMembersLoading] = useState<string | null>(null);
  const [editingNameByRoomId, setEditingNameByRoomId] = useState<Record<string, string>>({});
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'owner_id' | 'archived' | 'created_at'>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const getEditingRoomName = (room: AdminRoom) => editingNameByRoomId[room.id] ?? room.name;
  const filteredRooms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searched = normalizedQuery
      ? rooms.filter((room) => {
          const nameMatch = room.name.toLowerCase().includes(normalizedQuery);
          const ownerIdMatch = room.owner_id.toLowerCase().includes(normalizedQuery);
          const roomIdMatch = room.id.toLowerCase().includes(normalizedQuery);
          return nameMatch || ownerIdMatch || roomIdMatch;
        })
      : rooms;

    return [...searched].sort((a, b) => {
      let compared = 0;
      if (sortKey === 'created_at') {
        compared = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === 'archived') {
        compared = Number(a.archived) - Number(b.archived);
      } else if (sortKey === 'owner_id') {
        compared = a.owner_id.localeCompare(b.owner_id, 'ja');
      } else {
        compared = a.name.localeCompare(b.name, 'ja');
      }
      return sortOrder === 'asc' ? compared : -compared;
    });
  }, [rooms, searchQuery, sortKey, sortOrder]);

  const toggleSort = (nextKey: 'name' | 'owner_id' | 'archived' | 'created_at') => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortOrder('asc');
  };

  const sortMark = (key: 'name' | 'owner_id' | 'archived' | 'created_at') =>
    sortKey === key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('このルームを削除しますか？関連するすべてのデータが削除されます。')) {
      return;
    }
    try {
      await adminFetch(`/rooms/${roomId}`, { method: 'DELETE' });
      setRooms(rooms.filter((r) => r.id !== roomId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  const handleExpandRoom = async (roomId: string) => {
    if (expandedRoomId === roomId) {
      setExpandedRoomId(null);
      return;
    }

    setExpandedRoomId(roomId);

    if (membersCache[roomId]) return;

    setMembersLoading(roomId);
    try {
      const members = await adminFetch(`/rooms/${roomId}/members`);
      setMembersCache((prev) => ({ ...prev, [roomId]: Array.isArray(members) ? members : [] }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch members');
    } finally {
      setMembersLoading(null);
    }
  };

  const handleRoleChange = async (roomId: string, userId: string, newRole: string) => {
    try {
      await adminFetch(`/rooms/${roomId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });

      setMembersCache((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member role');
    }
  };

  const handleSaveRoomName = async (room: AdminRoom) => {
    const nextName = getEditingRoomName(room).trim();
    if (!nextName) {
      alert('ルーム名は空にできません');
      return;
    }

    if (nextName === room.name) {
      return;
    }

    setSavingRoomId(room.id);
    try {
      await adminFetch(`/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
      setRooms(rooms.map((r) => (r.id === room.id ? { ...r, name: nextName } : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update room name');
    } finally {
      setSavingRoomId(null);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>
        ルーム一覧 ({rooms.length})
      </h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="ルーム名 / ルームID / オーナーID で検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            minWidth: '220px',
            padding: '8px 10px',
            background: theme.bgInput,
            color: theme.textPrimary,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        />
      </div>

      {filteredRooms.length === 0 ? (
        <div style={{ color: theme.textSecondary }}>ルームがありません</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('name')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    ルーム名{sortMark('name')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('owner_id')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    オーナーID{sortMark('owner_id')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('archived')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    アーカイブ{sortMark('archived')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('created_at')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    作成日時{sortMark('created_at')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map((room) => (
                <React.Fragment key={room.id}>
                  <tr
                    onClick={() => handleExpandRoom(room.id)}
                    style={{
                      borderBottom: `1px solid ${theme.borderSubtle}`,
                      cursor: 'pointer',
                      background: expandedRoomId === room.id ? theme.bgInput : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          value={getEditingRoomName(room)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setEditingNameByRoomId((prev) => ({ ...prev, [room.id]: e.target.value }))
                          }
                          style={{
                            minWidth: '180px',
                            padding: '6px 8px',
                            background: theme.bgInput,
                            color: theme.textPrimary,
                            border: `1px solid ${theme.borderInput}`,
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                          }}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRoomName(room);
                          }}
                          disabled={savingRoomId === room.id}
                          style={{
                            padding: '6px 10px',
                            background: theme.accent,
                            color: theme.textOnAccent,
                            border: 'none',
                            borderRadius: '4px',
                            cursor: savingRoomId === room.id ? 'not-allowed' : 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            opacity: savingRoomId === room.id ? 0.7 : 1,
                          }}
                        >
                          保存
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary, fontSize: '0.8rem' }}>
                      <CopyableText value={room.owner_id} compact />
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary }}>
                      {room.archived ? 'はい' : 'いいえ'}
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary }}>
                      {new Date(room.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room.id);
                        }}
                        style={{
                          padding: '6px 12px',
                          background: theme.danger,
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>

                  {expandedRoomId === room.id && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div
                          style={{
                            background: theme.bgInput,
                            padding: '12px 12px 12px 40px',
                            borderBottom: `1px solid ${theme.borderSubtle}`,
                          }}
                        >
                          {membersLoading === room.id ? (
                            <div style={{ color: theme.textSecondary }}>メンバー読み込み中...</div>
                          ) : (membersCache[room.id] || []).length === 0 ? (
                            <div style={{ color: theme.textSecondary }}>メンバーがいません</div>
                          ) : (
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '0.85rem',
                              }}
                            >
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                                  <th style={{ padding: '8px', textAlign: 'left', color: theme.textSecondary }}>
                                    表示名
                                  </th>
                                  <th style={{ padding: '8px', textAlign: 'left', color: theme.textSecondary }}>
                                    ユーザーID
                                  </th>
                                  <th style={{ padding: '8px', textAlign: 'left', color: theme.textSecondary }}>
                                    ロール
                                  </th>
                                  <th style={{ padding: '8px', textAlign: 'left', color: theme.textSecondary }}>
                                    参加日時
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {(membersCache[room.id] || []).map((member) => (
                                  <tr
                                    key={member.user_id}
                                    style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}
                                  >
                                    <td style={{ padding: '8px', color: theme.textPrimary }}>
                                      {member.users?.display_name || 'N/A'}
                                    </td>
                                    <td style={{ padding: '8px', color: theme.textSecondary, fontSize: '0.75rem' }}>
                                      <CopyableText value={member.user_id} compact />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <select
                                        value={member.role}
                                        onChange={(e) =>
                                          handleRoleChange(room.id, member.user_id, e.target.value)
                                        }
                                        style={{
                                          background: theme.bgInput,
                                          color: theme.textPrimary,
                                          border: `1px solid ${theme.borderInput}`,
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          fontSize: '0.85rem',
                                        }}
                                      >
                                        <option value="owner">owner</option>
                                        <option value="sub_owner">sub_owner</option>
                                        <option value="user">user</option>
                                        <option value="guest">guest</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '8px', color: theme.textSecondary }}>
                                      {new Date(member.joined_at).toLocaleString('ja-JP')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssetsTab({
  assets,
  adminFetch,
  setAssets,
}: {
  assets: AssetItem[];
  adminFetch: (path: string, options?: RequestInit) => Promise<any>;
  setAssets: (assets: AssetItem[]) => void;
}) {
  const [editingTitleByAssetId, setEditingTitleByAssetId] = useState<Record<string, string>>({});
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'title' | 'ownerId' | 'size' | 'type' | 'createdAt'>('title');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const getEditingAssetTitle = (asset: AssetItem) => editingTitleByAssetId[asset.id] ?? asset.title;
  const filteredAssets = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searched = normalizedQuery
      ? assets.filter((asset) => {
          const titleMatch = asset.title.toLowerCase().includes(normalizedQuery);
          const ownerIdMatch = asset.ownerId.toLowerCase().includes(normalizedQuery);
          const assetIdMatch = asset.id.toLowerCase().includes(normalizedQuery);
          return titleMatch || ownerIdMatch || assetIdMatch;
        })
      : assets;

    return [...searched].sort((a, b) => {
      let compared = 0;
      if (sortKey === 'createdAt') {
        compared = a.createdAt - b.createdAt;
      } else if (sortKey === 'size') {
        compared = a.size - b.size;
      } else if (sortKey === 'type') {
        compared = a.type.localeCompare(b.type, 'ja');
      } else if (sortKey === 'ownerId') {
        compared = a.ownerId.localeCompare(b.ownerId, 'ja');
      } else {
        compared = a.title.localeCompare(b.title, 'ja');
      }
      return sortOrder === 'asc' ? compared : -compared;
    });
  }, [assets, searchQuery, sortKey, sortOrder]);

  const toggleSort = (nextKey: 'title' | 'ownerId' | 'size' | 'type' | 'createdAt') => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortOrder('asc');
  };

  const sortMark = (key: 'title' | 'ownerId' | 'size' | 'type' | 'createdAt') =>
    sortKey === key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

  const handleDeleteAsset = async (assetId: string) => {
    if (!window.confirm('このアセットを削除しますか？')) {
      return;
    }
    try {
      await adminFetch(`/assets/${assetId}`, { method: 'DELETE' });
      setAssets(assets.filter((a) => a.id !== assetId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete asset');
    }
  };

  const handleSaveAssetTitle = async (asset: AssetItem) => {
    const nextTitle = getEditingAssetTitle(asset).trim();
    if (!nextTitle) {
      alert('タイトルは空にできません');
      return;
    }

    if (nextTitle === asset.title) {
      return;
    }

    setSavingAssetId(asset.id);
    try {
      await adminFetch(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle }),
      });
      setAssets(assets.map((a) => (a.id === asset.id ? { ...a, title: nextTitle } : a)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update asset title');
    } finally {
      setSavingAssetId(null);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>
        アセット一覧 ({assets.length})
      </h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="タイトル / アセットID / オーナーID で検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            minWidth: '220px',
            padding: '8px 10px',
            background: theme.bgInput,
            color: theme.textPrimary,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        />
      </div>

      {filteredAssets.length === 0 ? (
        <div style={{ color: theme.textSecondary }}>アセットがありません</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('title')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    タイトル{sortMark('title')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('ownerId')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    オーナーID{sortMark('ownerId')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('size')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    サイズ{sortMark('size')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('type')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    種別{sortMark('type')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  <button
                    onClick={() => toggleSort('createdAt')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textSecondary,
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    作成日時{sortMark('createdAt')}
                  </button>
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: theme.textSecondary,
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr
                  key={asset.id}
                  style={{
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        value={getEditingAssetTitle(asset)}
                        onChange={(e) =>
                          setEditingTitleByAssetId((prev) => ({ ...prev, [asset.id]: e.target.value }))
                        }
                        style={{
                          minWidth: '180px',
                          padding: '6px 8px',
                          background: theme.bgInput,
                          color: theme.textPrimary,
                          border: `1px solid ${theme.borderInput}`,
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}
                      />
                      <button
                        onClick={() => handleSaveAssetTitle(asset)}
                        disabled={savingAssetId === asset.id}
                        style={{
                          padding: '6px 10px',
                          background: theme.accent,
                          color: theme.textOnAccent,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: savingAssetId === asset.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          opacity: savingAssetId === asset.id ? 0.7 : 1,
                        }}
                      >
                        保存
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary, fontSize: '0.8rem' }}>
                    <CopyableText value={asset.ownerId} compact />
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary }}>
                    {(asset.size / 1024).toFixed(1)} KB
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary }}>
                    {asset.type}
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary }}>
                    {new Date(asset.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary, maxWidth: '320px' }}>
                    {asset.url ? (
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={asset.url}
                        style={{
                          color: theme.accent,
                          textDecoration: 'underline',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                          maxWidth: '100%',
                        }}
                      >
                        {asset.url}
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() => handleDeleteAsset(asset.id)}
                      style={{
                        padding: '6px 12px',
                        background: theme.danger,
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
