import type { Env, AuthUser } from '../types';
import { json } from '../utils/json';

/** スナップショット JSON を gzip して返す。圧縮に失敗した場合は非圧縮で返す。 */
async function snapshotJsonResponse(
  payload: unknown,
  baseHeaders: Record<string, string>,
  status = 200,
): Promise<Response> {
  try {
    const jsonString = JSON.stringify(payload);
    const compressedStream = new Blob([jsonString])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(compressedStream).arrayBuffer();
    return new Response(buf, {
      status,
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
    });
  } catch {
    return json(payload, baseHeaders, status);
  }
}

export async function handleRooms(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>,
  user: AuthUser,
  userToken?: string,
): Promise<Response> {
  const pathParts = url.pathname.replace('/api/rooms', '').split('/').filter(Boolean);
  const roomId = pathParts[0];
  const subResource = pathParts[1]; // 'snapshot' etc.

  // ゲストはルーム詳細とスナップショット取得のみ許可
  if (user.isGuest && !(request.method === 'GET' && roomId)) {
    return json({ error: 'ゲストユーザーはこの操作を実行できません' }, headers, 403);
  }

  // GET /api/rooms — ルーム一覧
  if (!roomId && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM rooms WHERE owner_id = ? ORDER BY updated_at DESC',
    )
      .bind(user.uid)
      .all();
    return json(rows.results, headers);
  }

  // POST /api/rooms — ルーム作成
  if (!roomId && request.method === 'POST') {
    const body = (await request.json()) as {
      name: string;
      dice_system?: string;
      tags?: string[];
    };
    if (!body.name) return json({ error: 'name required' }, headers, 400);

    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO rooms (id, owner_id, name, dice_system, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        user.uid,
        body.name,
        body.dice_system ?? 'DiceBot',
        JSON.stringify(body.tags ?? []),
        now,
        now,
      )
      .run();

    return json({ id, name: body.name, owner_id: user.uid, created_at: now }, headers, 201);
  }

  if (!roomId) return new Response('Not Found', { status: 404, headers });

  // GET /api/rooms/:id/snapshot — ルームデータ取得
  if (subResource === 'snapshot' && request.method === 'GET') {
    // オーナーのみ（ゲストは許可）
    if (!user.isGuest) {
      const room = await env.DB.prepare('SELECT owner_id FROM rooms WHERE id = ?')
        .bind(roomId)
        .first<{ owner_id: string }>();
      if (!room || room.owner_id !== user.uid) {
        return json({ error: 'Forbidden' }, headers, 403);
      }
    }
    const row = await env.DB.prepare('SELECT data, updated_at FROM room_snapshots WHERE room_id = ?')
      .bind(roomId)
      .first<{ data: string; updated_at: number }>();
    if (!row) return snapshotJsonResponse({ data: null, updated_at: 0 }, headers);
    return snapshotJsonResponse(
      { data: JSON.parse(row.data), updated_at: row.updated_at },
      headers,
    );
  }

  // PUT /api/rooms/:id/snapshot — ルームデータ保存
  if (subResource === 'snapshot' && request.method === 'PUT') {
    // オーナーのみ
    const room = await env.DB.prepare('SELECT owner_id FROM rooms WHERE id = ?')
      .bind(roomId)
      .first<{ owner_id: string }>();
    if (!room || room.owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    const body = (await request.json()) as { data: unknown };
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO room_snapshots (room_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET data = ?, updated_at = ?',
    )
      .bind(roomId, JSON.stringify(body.data), now, JSON.stringify(body.data), now)
      .run();

    // roomsのupdated_atも更新
    await env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').bind(now, roomId).run();

    return json({ ok: true, updated_at: now }, headers);
  }

  // GET /api/rooms/:id — ルーム詳細
  if (!subResource && request.method === 'GET') {
    const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return json({ error: 'Not found' }, headers, 404);
    // 認証済みなら誰でも読める（ゲスト含む）
    return json(room, headers);
  }

  // PATCH /api/rooms/:id — ルーム更新
  if (!subResource && request.method === 'PATCH') {
    const room = await env.DB.prepare('SELECT owner_id FROM rooms WHERE id = ?')
      .bind(roomId)
      .first<{ owner_id: string }>();
    if (!room || room.owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    const body = (await request.json()) as {
      name?: string;
      dice_system?: string;
      tags?: string[];
      thumbnail_url?: string;
    };
    const now = Date.now();
    const sets: string[] = ['updated_at = ?'];
    const vals: unknown[] = [now];

    if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
    if (body.dice_system !== undefined) { sets.push('dice_system = ?'); vals.push(body.dice_system); }
    if (body.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(body.tags)); }
    if (body.thumbnail_url !== undefined) { sets.push('thumbnail_url = ?'); vals.push(body.thumbnail_url); }

    vals.push(roomId);
    await env.DB.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals)
      .run();

    return json({ ok: true }, headers);
  }

  // DELETE /api/rooms/:id — ルーム削除
  if (!subResource && request.method === 'DELETE') {
    const room = await env.DB.prepare('SELECT owner_id FROM rooms WHERE id = ?')
      .bind(roomId)
      .first<{ owner_id: string }>();
    if (!room || room.owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    await env.DB.prepare('DELETE FROM room_snapshots WHERE room_id = ?').bind(roomId).run();
    await env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId).run();
    return json({ ok: true }, headers);
  }

  // POST /api/rooms/:id/archive — ルームデータを D1 に退避
  if (subResource === 'archive' && request.method === 'POST') {
    const supabaseHeaders = {
      'apikey': env.SUPABASE_ANON_KEY ?? '',
      'Authorization': `Bearer ${userToken ?? env.SUPABASE_ANON_KEY ?? ''}`,
    };
    const ownerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}&select=owner_id`, {
      headers: supabaseHeaders,
    });
    const ownerData = (await ownerRes.json()) as { owner_id: string }[];
    if (!ownerData?.[0] || ownerData[0].owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    try {
      // Supabase から rooms, room_snapshots を取得
      const roomRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
        method: 'GET',
        headers: supabaseHeaders,
      });
      const rooms = (await roomRes.json()) as unknown[];

      const snapshotRes = await fetch(`${env.SUPABASE_URL}/rest/v1/room_snapshots?room_id=eq.${roomId}`, {
        method: 'GET',
        headers: supabaseHeaders,
      });
      const snapshots = (await snapshotRes.json()) as unknown[];

      // D1 room_archives に INSERT
      const archiveData = JSON.stringify({ rooms, snapshots });
      const now = Date.now();
      await env.DB.prepare(
        'INSERT INTO room_archives (room_id, data, archived_at) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET data = ?, archived_at = ?',
      )
        .bind(roomId, archiveData, now, archiveData, now)
        .run();

      // Supabase DELETE room_snapshots
      await fetch(`${env.SUPABASE_URL}/rest/v1/room_snapshots?room_id=eq.${roomId}`, {
        method: 'DELETE',
        headers: supabaseHeaders,
      });

      // Supabase UPDATE rooms SET archived = 1
      await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 1 }),
      });

      return json({ ok: true }, headers);
    } catch (err) {
      console.error('Archive error:', err);
      return json({ error: 'Failed to archive' }, headers, 500);
    }
  }

  // POST /api/rooms/:id/restore — D1 からルームデータを復元
  if (subResource === 'restore' && request.method === 'POST') {
    const supabaseHeaders = {
      'apikey': env.SUPABASE_ANON_KEY ?? '',
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY ?? ''}`,
    };
    const ownerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}&select=owner_id`, {
      headers: supabaseHeaders,
    });
    const ownerData = (await ownerRes.json()) as { owner_id: string }[];
    if (!ownerData?.[0] || ownerData[0].owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    try {
      // D1 から room_archives を取得
      const archive = await env.DB.prepare('SELECT data FROM room_archives WHERE room_id = ?')
        .bind(roomId)
        .first<{ data: string }>();

      if (!archive) {
        return json({ error: 'No archive found' }, headers, 404);
      }

      const archiveData = JSON.parse(archive.data) as { rooms: unknown[]; snapshots: unknown[] };

      const supabaseHeaders = {
        'apikey': env.SUPABASE_ANON_KEY ?? '',
        'Authorization': `Bearer ${userToken ?? env.SUPABASE_ANON_KEY ?? ''}`,
      };

      // Supabase に復元（room_snapshots INSERT）
      if (archiveData.snapshots.length > 0) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/room_snapshots`, {
          method: 'POST',
          headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(archiveData.snapshots),
        });
      }

      // Supabase UPDATE rooms SET archived = 0
      await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: 0 }),
      });

      // D1 DELETE room_archives
      await env.DB.prepare('DELETE FROM room_archives WHERE room_id = ?').bind(roomId).run();

      return json({ ok: true, data: archiveData }, headers);
    } catch (err) {
      console.error('Restore error:', err);
      return json({ error: 'Failed to restore' }, headers, 500);
    }
  }

  return new Response('Not Found', { status: 404, headers });
}
