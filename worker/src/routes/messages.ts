import type { Env, AuthUser } from '../types';
import { json } from '../utils/json';

export async function handleMessages(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>,
  user: AuthUser | null,
): Promise<Response> {
  const pathParts = url.pathname.replace('/api/rooms', '').split('/').filter(Boolean);
  const roomId = pathParts[0];
  const subResource = pathParts[1]; // 'messages'
  const action = pathParts[2]; // 'archive' etc.

  if (!roomId) return new Response('Not Found', { status: 404, headers });

  // POST /api/rooms/:id/messages/archive — バッチアーカイブ
  if (subResource === 'messages' && action === 'archive' && request.method === 'POST') {
    // 認証: user 認証 OR X-Archive-Secret ヘッダー
    const archiveSecret = request.headers.get('X-Archive-Secret');
    if (!user && !(archiveSecret && env.ARCHIVE_SECRET && archiveSecret === env.ARCHIVE_SECRET)) {
      return json({ error: 'Unauthorized' }, headers, 401);
    }

    const body = (await request.json()) as {
      messages: Array<{
        id: string;
        room_id: string;
        sender_name: string;
        sender_uid?: string | null;
        sender_avatar?: string | null;
        content: string;
        message_type: string;
        channel?: string;
        allowed_user_ids?: string[] | null;
        created_at: number;
      }>;
    };

    if (!Array.isArray(body.messages)) {
      return json({ error: 'messages array required' }, headers, 400);
    }

    const stmts = body.messages.map((msg) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO messages (id, room_id, sender_name, sender_uid, sender_avatar, content, message_type, channel, allowed_user_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        msg.id,
        msg.room_id,
        msg.sender_name,
        msg.sender_uid ?? null,
        msg.sender_avatar ?? null,
        msg.content,
        msg.message_type,
        msg.channel ?? 'main',
        msg.allowed_user_ids ? JSON.stringify(msg.allowed_user_ids) : null,
        msg.created_at,
      ),
    );

    await env.DB.batch(stmts);

    // D1 上限: ルームあたり8192件を超えたら古いメッセージを削除
    const MAX_D1_MESSAGES = 8192;
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE room_id = ?'
    ).bind(roomId).first<{ cnt: number }>();
    const total = countResult?.cnt ?? 0;
    if (total > MAX_D1_MESSAGES) {
      await env.DB.prepare(
        'DELETE FROM messages WHERE room_id = ? AND id IN (SELECT id FROM messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ?)'
      ).bind(roomId, roomId, total - MAX_D1_MESSAGES).run();
    }

    return json({ ok: true, archived: body.messages.length }, headers);
  }

  // GET /api/rooms/:id/messages — 過去ログ取得
  if (subResource === 'messages' && !action && request.method === 'GET') {
    if (!user) {
      return json({ error: 'Unauthorized' }, headers, 401);
    }

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 200);
    const before = Number(url.searchParams.get('before') ?? Date.now());
    const channel = url.searchParams.get('channel');

    let sql = 'SELECT * FROM messages WHERE room_id = ? AND created_at < ?';
    const params: (string | number)[] = [roomId, before];

    if (channel) {
      sql += ' AND channel = ?';
      params.push(channel);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit + 1);

    const rows = await env.DB.prepare(sql).bind(...params).all();
    const results = (rows.results ?? []) as Array<{
      id: string;
      room_id: string;
      sender_name: string;
      sender_uid: string | null;
      sender_avatar: string | null;
      content: string;
      message_type: string;
      channel: string;
      allowed_user_ids: string | null;
      created_at: number;
    }>;

    const hasMore = results.length > limit;
    if (hasMore) results.pop();

    // allowed_user_ids フィルタ + パース
    const filtered = results
      .filter((row) => {
        if (!row.allowed_user_ids) return true;
        try {
          const ids = JSON.parse(row.allowed_user_ids) as string[];
          return ids.includes(user.uid);
        } catch {
          return true;
        }
      })
      .map((row) => ({
        ...row,
        allowed_user_ids: row.allowed_user_ids ? (JSON.parse(row.allowed_user_ids) as string[]) : undefined,
      }));

    return json({ messages: filtered, has_more: hasMore }, headers);
  }

  // DELETE /api/rooms/:id/messages — ルーム内全メッセージ削除
  if (subResource === 'messages' && !action && request.method === 'DELETE') {
    // 認証: user 認証 OR X-Archive-Secret ヘッダー
    const archiveSecret = request.headers.get('X-Archive-Secret');
    if (!user && !(archiveSecret && env.ARCHIVE_SECRET && archiveSecret === env.ARCHIVE_SECRET)) {
      return json({ error: 'Unauthorized' }, headers, 401);
    }

    await env.DB.prepare('DELETE FROM messages WHERE room_id = ?').bind(roomId).run();
    return json({ ok: true }, headers);
  }

  return new Response('Not Found', { status: 404, headers });
}
