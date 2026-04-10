import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useSupabaseQuery } from '../hooks/useSupabaseQuery';
import RoomLobby from '../components/RoomLobby';
import { ADRASTEA_VERSION, ADRASTEA_STAGE } from '../config/adrastea';
import { TopToolbar } from '../components/TopToolbar';
import { DockLayout } from '../components/DockLayout';
import { SettingsModal } from '../components/SettingsModal';
import { ProfileEditModal } from '../components/ProfileEditModal';
import { CutinOverlay } from '../components/CutinOverlay';
import { AdrasteaProvider, useAdrasteaContext } from '../contexts/AdrasteaContext';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { ToastContainer } from '../components/ui/Toast';
import { usePasteHandler } from '../hooks/usePasteHandler';
import { useGlobalKeyboardShortcuts } from '../hooks/useGlobalKeyboardShortcuts';
import { pasteSceneFromClipboard, pasteBgmToScene } from '../utils/clipboardImport';
import { theme } from '../styles/theme';
import type { UserProfile } from '../types/adrastea.types';

/** 共通ローディング画面 */
function LoadingScreen({ progress, statusText }: { progress: number; statusText: string }) {
  return (
    <div
      className="adrastea-root"
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: theme.bgBase, color: theme.textPrimary,
      }}
    >
      <div style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '24px', letterSpacing: '0.05em', fontFamily: "'Barlow Condensed', sans-serif" }}>
        Adrastea
        <span style={{ fontSize: '0.7rem', fontWeight: 400, color: theme.textMuted, marginLeft: '6px' }}>
          {ADRASTEA_STAGE} {ADRASTEA_VERSION}
        </span>
      </div>
      <div style={{
        width: '240px', height: '4px', background: theme.border, borderRadius: '2px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`, height: '100%',
          background: theme.accent, borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        marginTop: '12px', fontSize: '0.8rem', color: theme.textSecondary,
      }}>
        {statusText}
      </div>
    </div>
  );
}

/** Dockview + オーバーレイ */
interface AdrasteaRoomProps {
  uid: string;
  token: string;
}

function AdrasteaRoom({ uid: _uid, token: _token }: AdrasteaRoomProps) {
  const ctx = useAdrasteaContext();
  const { can } = usePermission();
  const isOwner = ctx.roomRole === 'owner';
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  // ブラウザ標準の右クリックメニューを抑止（テキスト入力欄は除外）
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // グローバルキーボードショートカット（Ctrl+C/D/Delete）
  useGlobalKeyboardShortcuts();

  // クリップボードインポート
  usePasteHandler({
    addCharacter: (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
    addObject: async (data) => {
      const { sort_order: _so, ...rest } = data;
      const scene_ids = rest.global ? [] : (ctx.activeScene ? [ctx.activeScene.id] : []);
      return ctx.addObject({ ...rest, scene_ids });
    },
    addScene: (data) => pasteSceneFromClipboard(data, ctx),
    addBgm: (data) => pasteBgmToScene(data, ctx.activeScene?.id ?? null, ctx),
    addScenarioText: (data) => ctx.addScenarioText(data),
    showToast: ctx.showToast,
    updateObject: ctx.updateObject,
    updateScene: ctx.updateScene,
    allObjects: ctx.activeObjects,
    activeSceneId: ctx.activeScene?.id ?? null,
    existingCharacterNames: ctx.characters?.map(c => c.name),
    existingScenarioTitles: ctx.scenarioTexts?.map(t => t.title),
    keyboardActionsRef: ctx.keyboardActionsRef,
  });

  // メンバー管理（全メンバーが取得可能、users JOIN で display_name/avatar_url も取得）
  const { data: members = [], setData: setRoomMembersData } = useSupabaseQuery<any>({
    table: 'room_members',
    columns: 'id,room_id,user_id,role,joined_at,users(display_name,avatar_url)',
    roomId: ctx.room?.id ?? 'null',
    filter: (q) => q.eq('room_id', ctx.room?.id ?? ''),
    enabled: !!ctx.room,
    realtimeChannelSuffix: 'roster',
  });

  // members を SettingsModal / CharacterPanel 向けにフラット化
  const flatMembers = useMemo(() =>
    members.map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      display_name: m.users?.display_name ?? null,
      avatar_url: m.users?.avatar_url ?? null,
    })),
    [members]
  );

  // members を AdrasteaContext に同期
  useEffect(() => {
    ctx.setMembers(flatMembers);
  }, [flatMembers, ctx]);

  const handleAssignRole = useCallback(
    async (targetUserId: string, role: 'sub_owner' | 'user' | 'guest') => {
      if (!ctx.room) return;
      let snapshot: any[] = [];
      setRoomMembersData((prev) => {
        snapshot = [...prev];
        return prev.map((m: any) =>
          m.user_id === targetUserId ? { ...m, role } : m
        );
      });
      const { error } = await supabase
        .from('room_members')
        .update({ role })
        .eq('room_id', ctx.room.id)
        .eq('user_id', targetUserId);
      if (error) {
        setRoomMembersData(snapshot);
        console.error('Failed to assign role:', error);
        ctx.showToast('ロールの更新に失敗しました', 'error');
      }
    },
    [ctx.room, ctx.showToast, setRoomMembersData]
  );

  // ローディング画面（認証ステップ完了済み + データ読み込み中）
  if (ctx.isLoading) {
    // 認証分(1) + データステップ分 で全体進捗を計算
    const totalSteps = ctx.loadingSteps.length + 1;
    const doneSteps = 1 + ctx.loadingSteps.filter(s => s.done).length; // 認証は完了済み
    const currentStep = ctx.loadingSteps.find(s => !s.done);
    return (
      <LoadingScreen
        progress={doneSteps / totalSteps}
        statusText={currentStep ? `${currentStep.label}を読み込み中...` : '読み込み中...'}
      />
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: theme.bgBase, display: 'flex', flexDirection: 'column' }}
      className="adrastea-root"
    >
      {/* TopToolbar（Dockview外、常時表示） */}
      <TopToolbar
        onOpenSettings={() => ctx.setShowSettings(true, 'room')}
        onOpenProfile={() => setShowProfileEdit(true)}
        onOpenLayout={() => ctx.setShowSettings(true, 'layout')}
        onSignOut={ctx.signOut}
        activeScene={ctx.activeScene}
        profile={ctx.profile}
        dockviewApi={ctx.dockviewApi}
        roomName={ctx.room?.name}
      />

      {/* Dockviewエリア */}
      <div style={{ flex: 1, position: 'relative', zIndex: 0 }}>
        <DockLayout />
      </div>


      {/* カットインオーバーレイ（全画面演出） */}
      <CutinOverlay
        cutins={ctx.cutins}
        activeCutin={ctx.room?.active_cutin ?? null}
        onCutinEnd={ctx.clearCutin}
      />

      {/* 統合設定モーダル */}
      {ctx.showSettings && ctx.room && (
        <SettingsModal
          initialSection={ctx.settingsSection}
          room={ctx.room}
          onSaveRoom={(updates) => ctx.updateRoom(updates)}
          onDeleteRoom={ctx.deleteRoom}
          dockviewApi={ctx.dockviewApi}
          can={can}
          isOwner={isOwner}
          members={flatMembers}
          onAssignRole={handleAssignRole}
          onClose={() => ctx.setShowSettings(false)}
        />
      )}

      {/* プロフィール編集モーダル */}
      {showProfileEdit && ctx.profile && (
        <ProfileEditModal
          profile={ctx.profile}
          onSave={async (data) => { await ctx.updateProfile(data); }}
          onSignOut={ctx.signOut}
          onClose={() => setShowProfileEdit(false)}
        />
      )}

      {/* トースト通知 */}
      <ToastContainer toasts={ctx.toasts} />
    </div>
  );
}

const Adrastea: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, onboarded, updateProfile, token } = useAuth();

  // Supabase から room データを取得
  const { data: roomDataArray = [] } = useSupabaseQuery<any>({
    table: 'rooms',
    columns: '*',
    roomId: roomId ?? 'null',
    filter: (q) => q.eq('id', roomId ?? ''),
    enabled: !!roomId,
    // セッション内の rooms は useAdrastea が購読。ここも channel を取ると同名で2本目の subscribe が無視され active_scene が死ぬ
    realtime: false,
  });
  const roomData = roomDataArray[0] ?? (roomId ? null : undefined);

  useEffect(() => {
    document.title = 'Adrastea';
  }, []);

  // ルーム入室時に last_accessed_at を更新
  useEffect(() => {
    if (roomData && !roomData.archived && roomId) {
      (async () => {
        try {
          await supabase.from('rooms').update({ last_accessed_at: Date.now() }).eq('id', roomId);
        } catch (err) {
          console.error('Failed to update last_accessed_at:', err);
        }
      })();
    }
  }, [roomData?.id, roomId]);

  // ログイン後に元のURLへ復帰
  useEffect(() => {
    if (!user) return;
    const saved = sessionStorage.getItem('adrastea_redirect');
    if (saved) {
      sessionStorage.removeItem('adrastea_redirect');
      navigate(saved, { replace: true });
    }
  }, [user?.uid]);

  // room_members からロール取得（roster 用フックとチャンネル名が被ると Realtime が片方にしか届かないため suffix 分離）
  const { data: myMembersData = [] } = useSupabaseQuery<any>({
    table: 'room_members',
    columns: 'id,room_id,user_id,role,joined_at',
    roomId: roomId ?? 'null',
    filter: (q) => q.eq('room_id', roomId ?? ''),
    enabled: !!(roomId && user),
    realtimeChannelSuffix: 'self-role',
  });
  const memberRole = myMembersData.find(m => m.user_id === user?.uid)?.role ?? undefined;

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [joinDone, setJoinDone] = useState(!user || !roomId || isGuestMode);
  const [joinedRole, setJoinedRole] = useState<'owner' | 'sub_owner' | 'user' | 'guest' | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // ルーム入室時に join を呼ぶ
  useEffect(() => {
    if (roomId && user) {
      (async () => {
        try {
          // 既存メンバーかチェック
          const { data: existing } = await supabase
            .from('room_members')
            .select('role')
            .eq('room_id', roomId)
            .eq('user_id', user.uid)
            .maybeSingle();

          if (existing) {
            // 既に参加済み
            setJoinedRole(existing.role as 'owner' | 'sub_owner' | 'user' | 'guest');
          } else {
            // 新規参加: ルームの default_login_role を取得してロール決定
            const { data: roomData } = await supabase
              .from('rooms')
              .select('default_login_role')
              .eq('id', roomId)
              .single();
            const defaultRole = roomData?.default_login_role ?? 'user';

            const { data } = await supabase
              .from('room_members')
              .insert({
                room_id: roomId,
                user_id: user.uid,
                role: defaultRole,
                joined_at: Date.now(),
              })
              .select('role')
              .single();
            if (data) {
              setJoinedRole(data.role as 'owner' | 'sub_owner' | 'user' | 'guest');
            }
          }
        } catch (err) {
          console.error('Failed to join room:', err);
        } finally {
          setJoinDone(true);
        }
      })();
    }
  }, [roomId, user?.uid]);

  // ルームアーカイブ復元チェック（入室時）
  useEffect(() => {
    if (roomData?.archived === 1 && !isRestoring && user && roomId) {
      setIsRestoring(true);

      (async () => {
        try {
          // 認証トークン取得
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          if (!token) {
            console.error('No auth token for restore');
            setIsRestoring(false);
            return;
          }

          // Worker API に restore リクエスト
          const apiUrl = import.meta.env.VITE_R2_WORKER_URL as string;
          const res = await fetch(`${apiUrl}/api/rooms/${roomId}/restore`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!res.ok) {
            throw new Error(`Restore failed: ${res.status} ${res.statusText}`);
          }

          // 復元完了後、ページリロード
          window.location.reload();
        } catch (err) {
          console.error('Room restore failed:', err);
          setIsRestoring(false);
        }
      })();
    }
  }, [roomData?.archived, user, roomId, isRestoring]);

  // owner check 状態を算出
  const ownerCheck: 'loading' | 'ok' | 'denied' =
    !roomId ? 'ok'
    : roomData === undefined ? 'loading'
    : roomData === null ? 'denied'
    : 'ok';

  // ロール判定（memberRole 優先、undefined 時は joinedRole を使う）
  const roomRole = (user ? ((memberRole ?? joinedRole) ?? 'guest') : 'guest') as 'owner' | 'sub_owner' | 'user' | 'guest';

  const handleRoomCreated = (newRoomId: string) => {
    navigate(`/${newRoomId}`);
  };

  // 認証ローディング（全体の最初のステップ）
  if (authLoading) {
    return <LoadingScreen progress={0} statusText="認証を確認中..." />;
  }

  // 未認証 + ルームIDなし → ログイン画面（ルームIDがあれば観戦可能）
  if (!user && !roomId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: theme.bgBase,
      }}>
        <div style={{
          background: theme.bgBase, border: `1px solid ${theme.border}`, borderRadius: 0,
          padding: '40px', textAlign: 'center', color: theme.textPrimary,
          width: '340px',
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontFamily: "'Barlow Condensed', sans-serif" }}>
            Adrastea
            <span style={{ fontSize: '0.7rem', fontWeight: 400, color: theme.textMuted, marginLeft: '6px' }}>
              {ADRASTEA_STAGE} {ADRASTEA_VERSION}
            </span>
          </h2>
          <p style={{ margin: '0 0 24px', color: theme.textSecondary, fontSize: '0.9rem' }}>
            TRPGオンラインセッションツール
          </p>
          <button
            onClick={() => {
              sessionStorage.setItem('adrastea_redirect', window.location.pathname);
              signIn();
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', background: '#fff', color: '#333',
              border: 'none', borderRadius: 0, fontSize: '0.9rem',
              fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  // 未認証 + ルームIDあり → ログインorゲスト選択画面
  if (!user && !isGuestMode && roomId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: theme.bgBase,
      }}>
        <div style={{
          background: theme.bgBase, border: `1px solid ${theme.border}`, borderRadius: 0,
          padding: '40px', textAlign: 'center', color: theme.textPrimary,
          width: '340px',
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontFamily: "'Barlow Condensed', sans-serif" }}>
            Adrastea
            <span style={{ fontSize: '0.7rem', fontWeight: 400, color: theme.textMuted, marginLeft: '6px' }}>
              {ADRASTEA_STAGE} {ADRASTEA_VERSION}
            </span>
          </h2>
          <p style={{ margin: '0 0 32px', color: theme.textSecondary, fontSize: '0.9rem' }}>
            TRPGオンラインセッションツール
          </p>
          <button
            onClick={() => {
              sessionStorage.setItem('adrastea_redirect', window.location.pathname);
              signIn();
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', background: '#fff', color: '#333',
              border: 'none', borderRadius: 0, fontSize: '0.9rem',
              fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
          <button
            onClick={() => setIsGuestMode(true)}
            style={{
              marginTop: '24px',
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              borderRadius: 0,
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ゲストとして参加（読み取り専用）
          </button>
        </div>
      </div>
    );
  }

  // オンボーディング（初回ログイン時）— ProfileEditModal で統一
  if (!onboarded) {
    const handleCompleteOnboarding = async () => {
      try {
        await supabase.auth.updateUser({ data: { onboarded: true } });
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
      }
    };

    const prof: UserProfile = {
      uid: user?.uid ?? '',
      display_name: user?.displayName ?? '',
      avatar_url: user?.avatarUrl ?? null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    return (
      <>
        <div style={{
          position: 'fixed', inset: 0,
          background: theme.bgBase, zIndex: 1099,
        }} />
        <ProfileEditModal
          profile={prof}
          onSave={async (data) => {
            await updateProfile(data);
            await handleCompleteOnboarding();
          }}
          onSignOut={async () => {
            await supabase.auth.signOut();
            navigate('/adrastea');
          }}
          onClose={handleCompleteOnboarding}
        />
      </>
    );
  }

  // ルーム未選択 → ロビー
  if (!roomId) {
    return <RoomLobby onRoomCreated={handleRoomCreated} />;
  }

  // オーナーチェック中
  if (ownerCheck === 'loading') {
    return <LoadingScreen progress={0.5} statusText="ルームを確認中..." />;
  }

  // join 完了 & ロール確定待ち（joinedRole があれば memberRole が undefined でも進める）
  if (user && roomId && (!joinDone || (memberRole === undefined && joinedRole === null))) {
    return <LoadingScreen progress={0.6} statusText="ルームを準備中..." />;
  }

  // オーナーでない → アクセス拒否
  if (ownerCheck === 'denied') {
    return (
      <div
        className="adrastea-root"
        style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: theme.bgBase, color: theme.textPrimary,
        }}
      >
        <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '16px' }}>
          ルームが見つかりません
        </div>
        <div style={{ fontSize: '0.9rem', color: theme.textSecondary, marginBottom: '24px' }}>
          このルームは存在しないか、削除された可能性があります
        </div>
        <button
          onClick={() => navigate('/adrastea')}
          style={{
            padding: '8px 20px',
            background: theme.accent,
            color: theme.textOnAccent,
            border: 'none',
            borderRadius: 0,
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ロビーに戻る
        </button>
      </div>
    );
  }

  // 復元中はローディング画面表示
  if (isRestoring) {
    return <LoadingScreen progress={0.7} statusText="ルームデータを復元中..." />;
  }

  return (
    <AdrasteaProvider roomId={roomId} roomRole={roomRole}>
      <AdrasteaRoom uid={user?.uid ?? ''} token={token ?? ''} />
    </AdrasteaProvider>
  );
};

export default Adrastea;
