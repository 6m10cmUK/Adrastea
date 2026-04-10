import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';

/** useSupabaseQuery の filter に渡る `from(...).select(...)` 直後のクエリビルダー */
type SupabaseSelectQueryBuilder = ReturnType<
  ReturnType<typeof supabase.from>['select']
>;
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import { useAuth } from '../contexts/AuthContext';
import type { ChatMessage } from '../types/adrastea.types';
import type { ChatInject } from '../types/adrastea-persistence';
import { rollDice } from '../services/diceRoller';
import { genId } from '../utils/id';
import { API_BASE_URL } from '../config/api';

// localStorage キーとヘルパー関数
const SECRET_DICE_STORAGE_KEY = 'adrastea:secret_dice_notifications';

function loadSecretDiceNotifications(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${SECRET_DICE_STORAGE_KEY}:${roomId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveSecretDiceNotification(roomId: string, msg: ChatMessage) {
  try {
    const existing = loadSecretDiceNotifications(roomId);
    // 重複チェック
    if (existing.some((m) => m.id === msg.id)) return;
    existing.push(msg);
    // 最大100件保持（古いものから削除）
    const trimmed = existing.slice(-100);
    localStorage.setItem(`${SECRET_DICE_STORAGE_KEY}:${roomId}`, JSON.stringify(trimmed));
  } catch {
    // localStorage 容量オーバー等は無視
  }
}

function removeSecretDiceNotification(roomId: string, messageId: string) {
  try {
    const existing = loadSecretDiceNotifications(roomId);
    const filtered = existing.filter((m) => m.id !== messageId);
    localStorage.setItem(`${SECRET_DICE_STORAGE_KEY}:${roomId}`, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}

interface ArchiveMessagesResponse {
  messages: Array<{
    id: string;
    room_id: string;
    sender_name: string;
    sender_uid: string | null;
    sender_avatar_asset_id: string | null;
    content: string;
    message_type: string;
    channel?: string;
    allowed_user_ids?: string[];
    created_at: number;
  }>;
  has_more: boolean;
}

export function useAdrasteaChat(roomId: string, options?: { inject?: ChatInject; initialData?: unknown[]; enabled?: boolean }) {
  const { inject, initialData, enabled } = options ?? {};
  const injectRef = useRef(inject);
  injectRef.current = inject;
  const { user, token } = useAuth();

  // R-02: filter メモ化（毎レンダーの新参照を防ぐ）
  const filter = useCallback(
    (q: SupabaseSelectQueryBuilder) =>
      q.eq('room_id', roomId).order('created_at', { ascending: false }).limit(200),
    [roomId]
  );

  const messagesQuery = useSupabaseQuery<ChatMessage>({
    table: 'messages',
    columns: 'id,room_id,sender_name,sender_uid,sender_avatar_asset_id,content,message_type,channel,allowed_user_ids,created_at,edited_at,edited_by_uid',
    roomId,
    filter,
    enabled: !inject && enabled !== false,
    initialData,
  });
  const messagesData = messagesQuery.data;
  /** useState の setter は安定参照。messagesQuery オブジェクトを effect 依存にすると毎レンダーで購読が張り直される */
  const setMessagesData = messagesQuery.setData;
  const chatMutation = useSupabaseMutation<ChatMessage>('messages', setMessagesData);

  const loading = inject ? false : messagesQuery.loading;

  // 秘密ダイス Broadcast 送信用チャネル ref
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 秘密ダイス Broadcast 購読（他ユーザーの秘密ダイス通知を受信）
  useEffect(() => {
    if (inject || enabled === false) return;
    const channel = supabase.channel(`room:${roomId}:broadcast`);
    broadcastChannelRef.current = channel;

    // リロード時: localStorage から秘密ダイス通知を復元
    const savedNotifications = loadSecretDiceNotifications(roomId);
    if (savedNotifications.length > 0) {
      setMessagesData((prev) => {
        const newMsgs = savedNotifications.filter((saved) => !prev.some((m) => m.id === saved.id));
        if (newMsgs.length === 0) return prev;
        return [...prev, ...newMsgs];
      });
    }

    channel.on('broadcast', { event: 'secret_dice' }, (payload) => {
      const p = payload.payload as {
        message_id: string;
        sender_name: string;
        sender_uid: string;
        sender_avatar_asset_id: string | null;
        channel?: string;
        created_at: number;
      };
      // 自分が送信者なら無視（既にローカルに結果がある）
      if (p.sender_uid === user?.uid) return;
      // ダミーメッセージをローカル state に追加
      const dummyMsg: ChatMessage = {
        id: p.message_id,
        room_id: roomId,
        sender_name: p.sender_name,
        sender_uid: p.sender_uid,
        sender_avatar_asset_id: p.sender_avatar_asset_id,
        content: 'シークレットダイス',
        message_type: 'secret_dice',
        channel: p.channel,
        created_at: p.created_at,
      };
      // localStorage に保存（リロード時復元用）
      saveSecretDiceNotification(roomId, dummyMsg);
      setMessagesData((prev) => {
        if (prev.some((m) => m.id === p.message_id)) return prev;
        return [...prev, dummyMsg];
      });
    });
    channel.subscribe();
    return () => {
      broadcastChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId, inject, enabled, user?.uid, setMessagesData]);

  // ローカルキャッシュ: Supabase から消えたメッセージも保持（archive 対策）
  const localCacheRef = useRef<Map<string, ChatMessage>>(new Map());
  // D1 から取得した過去ログ
  const [archivedMessages, setArchivedMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // ルーム切替: 前ルームのメッセージキャッシュが残るとマージが膨らみ別ルーム混入の原因になる
  useEffect(() => {
    localCacheRef.current.clear();
    setArchivedMessages([]);
    setHasMore(true);
  }, [roomId]);

  // auth がない場合（ゲスト等）は D1 から取得できないので hasMore を false に
  useEffect(() => {
    if (!user) setHasMore(false);
  }, [user]);

  // Supabase メッセージを ChatMessage に変換してキャッシュにマージ
  const supabaseMessages: ChatMessage[] = useMemo(() => {
    if (inject) return [];
    if (!messagesData) return [];
    const msgs = [...messagesData].reverse().map((m) => ({
      id: m.id,
      room_id: m.room_id,
      sender_name: m.sender_name,
      sender_uid: m.sender_uid ?? undefined,
      sender_avatar_asset_id: m.sender_avatar_asset_id ?? null,
      content: m.content,
      message_type: m.message_type as ChatMessage['message_type'],
      channel: m.channel ?? 'main',
      allowed_user_ids: m.allowed_user_ids,
      created_at: m.created_at,
      edited_at: m.edited_at ?? undefined,
      edited_by_uid: m.edited_by_uid ?? undefined,
    }));
    // キャッシュに追加
    for (const msg of msgs) {
      localCacheRef.current.set(msg.id, msg);
      // DB に同じ id で dice メッセージがあれば localStorage から削除（オープン済み）
      if (msg.message_type === 'dice') {
        removeSecretDiceNotification(roomId, msg.id);
      }
    }
    return msgs;
  }, [inject, messagesData, roomId]);

  // 全メッセージ = Supabase キャッシュ + D1 アーカイブ（ID重複排除、created_at ソート）
  // inject モードでは inject.data をそのまま返す
  const messages: ChatMessage[] = useMemo(() => {
    if (inject) return inject.data;
    const merged = new Map<string, ChatMessage>();
    // D1 アーカイブ（古い方が先）
    for (const msg of archivedMessages) {
      merged.set(msg.id, msg);
    }
    // ローカルキャッシュ（Supabase 由来、上書き優先）
    for (const [id, msg] of localCacheRef.current) {
      merged.set(id, msg);
    }
    // Supabase の最新データで上書き
    for (const msg of supabaseMessages) {
      merged.set(msg.id, msg);
    }
    return Array.from(merged.values()).sort((a, b) => a.created_at - b.created_at);
  }, [inject, supabaseMessages, archivedMessages]);

  const sendMessage = useCallback(
    async (
      senderName: string,
      content: string,
      messageType: ChatMessage['message_type'] = 'chat',
      senderUid?: string,
      senderAvatarAssetId?: string | null,
      diceSystem?: string,
      channel?: string,
      allowedUserIds?: string[]
    ) => {
      const inj = injectRef.current;
      if (inj) {
        return await inj.send(senderName, content, messageType, senderUid, senderAvatarAssetId, diceSystem, channel, allowedUserIds);
      }
      try {
        let finalContent = content;
        let finalType: ChatMessage['message_type'] = messageType;

        if (messageType === 'chat') {
          const result = await rollDice(content, diceSystem || 'DiceBot');
          if (result) {
            const color = result.success ? '#4a90d9' : '#e05555';
            finalContent = `${content} <color=${color}>${result.text}</color>`;
            finalType = result.isSecret ? 'secret_dice' : 'dice';
          }
        }

        const id = genId();
        const msg: ChatMessage = {
          id,
          room_id: roomId,
          sender_name: senderName,
          content: finalContent,
          message_type: finalType,
          sender_uid: senderUid,
          sender_avatar_asset_id: senderAvatarAssetId,
          channel,
          created_at: Date.now(),
        };

        // R-03:楽観的更新でローカルに追加。エラー時は insert が throw するため catch で捕捉される
        await chatMutation.insert(msg);

        // 秘密ダイス: 他ユーザーへの通知は DB トリガー（notify_secret_dice）が Realtime Broadcast で行う

        return msg;
      } catch (error) {
        console.error('メッセージ送信失敗:', error);
        return null;
      }
    },
    [roomId, chatMutation]
  );

  const loadMore = useCallback(async () => {
    if (inject) return;
    if (loadingMore || !hasMore) return;
    if (!user || !token) return;
    setLoadingMore(true);
    try {
      // 最古のメッセージの created_at をカーソルにする
      const allMsgs = messages;
      const oldest = allMsgs.length > 0 ? allMsgs[0].created_at : Date.now();

      const params = new URLSearchParams({
        before: String(oldest),
        limit: '200',
      });
      const res = await fetch(
        `${API_BASE_URL}/api/rooms/${roomId}/messages?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        console.error('過去ログ取得失敗:', res.status);
        // 401: 認証エラー（トークン無効）→リトライ不可
        if (res.status === 401) {
          console.warn('[useAdrasteaChat] 401 Unauthorized - cannot retry loadMore');
          setHasMore(false);
        }
        // その他ネットワークエラーは一時的→hasMore は変えない（リトライ可能）
        setLoadingMore(false);
        return;
      }

      const data = await res.json() as ArchiveMessagesResponse;
      setHasMore(data.has_more);

      if (data.messages.length > 0) {
        const newMsgs: ChatMessage[] = data.messages.map((m) => ({
          id: m.id,
          room_id: m.room_id,
          sender_name: m.sender_name,
          sender_uid: m.sender_uid ?? undefined,
          sender_avatar_asset_id: m.sender_avatar_asset_id ?? null,
          content: m.content,
          message_type: m.message_type as ChatMessage['message_type'],
          channel: m.channel ?? 'main',
          allowed_user_ids: m.allowed_user_ids,
          created_at: m.created_at,
        }));
        setArchivedMessages(prev => [...newMsgs, ...prev]);
      }
    } catch (error) {
      console.error('過去ログ取得エラー:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [inject, loadingMore, hasMore, messages, roomId, user, token]);

  const editMessage = useCallback(
    async (messageId: string, newSenderName: string, newContent: string) => {
      if (injectRef.current) return;
      const uid = user?.uid;
      try {
        // 楽観的更新（localCacheRef も同期）
        const cached = localCacheRef.current.get(messageId);
        if (cached) {
          localCacheRef.current.set(messageId, { ...cached, sender_name: newSenderName, content: newContent, edited_at: Date.now(), edited_by_uid: uid });
        }
        setMessagesData((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, sender_name: newSenderName, content: newContent, edited_at: Date.now(), edited_by_uid: uid }
              : m
          )
        );
        const { error } = await supabase
          .from('messages')
          .update({
            sender_name: newSenderName,
            content: newContent,
            edited_at: Date.now(),
            edited_by_uid: uid,
          })
          .eq('id', messageId);
        if (error) {
          location.reload();
          throw error;
        }
      } catch (err) {
        console.error('メッセージ編集失敗:', err);
        throw err;
      }
    },
    [setMessagesData, user?.uid]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (injectRef.current) return;
      try {
        localCacheRef.current.delete(messageId);
        setMessagesData((prev) => prev.filter((m) => m.id !== messageId));
        const { error } = await supabase.from('messages').delete().eq('id', messageId);
        if (error) {
          location.reload();
          throw error;
        }
      } catch (err) {
        console.error('メッセージ削除失敗:', err);
        throw err;
      }
    },
    [setMessagesData]
  );

  const clearMessages = useCallback(async () => {
    if (injectRef.current) return;
    try {
      // 楽観的更新: 全メッセージをクリア
      setMessagesData([]);
      setArchivedMessages([]);
      localCacheRef.current.clear();

      // RLS で owner のみが削除可能。フロント側は呼び出し元（ChatLogPanel等）で owner チェック
      // Supabase のメッセージを削除
      const { error: sbError } = await supabase.from('messages').delete().eq('room_id', roomId);
      if (sbError) {
        // ロールバック（エラー時）
        location.reload();
        throw sbError;
      }

      // D1 アーカイブも削除
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/api/rooms/${roomId}/messages`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (e) {
          console.error('D1 メッセージ削除失敗:', e);
        }
      }
    } catch (err) {
      console.error('メッセージ削除失敗:', err);
      throw err;
    }
  }, [roomId, setMessagesData, token]);

  const openSecretDice = useCallback(
    async (messageId: string) => {
      try {
        // 楽観的更新: message_type を 'dice' に変更（全ユーザーに公開）
        setMessagesData((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, message_type: 'dice' as const } : msg
          )
        );
        // localStorage からも削除（オープン済みは通知不要）
        removeSecretDiceNotification(roomId, messageId);

        const { error } = await supabase.from('messages').update({ message_type: 'dice' }).eq('id', messageId);
        if (error) {
          location.reload();
          throw error;
        }
      } catch (err) {
        console.error('秘密ダイス公開失敗:', err);
        throw err;
      }
    },
    [setMessagesData, roomId]
  );

  return {
    messages,
    loading,
    loadingMore: inject ? false : loadingMore,
    hasMore: inject ? false : hasMore,
    sendMessage,
    loadMore,
    clearMessages,
    openSecretDice,
    editMessage,
    deleteMessage,
  };
}
