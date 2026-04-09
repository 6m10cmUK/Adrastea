import type { Env, AuthUser } from '../types';
import { json } from '../utils/json';

function isAdmin(env: Env, user: AuthUser): boolean {
  const adminIds = (env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(user.uid);
}

function supabaseHeaders(env: Env): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? '';
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function supabaseFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  const base = env.SUPABASE_URL ?? '';
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(env), ...init?.headers },
  });
}

export async function handleAdmin(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>,
  user: AuthUser,
): Promise<Response> {
  if (!isAdmin(env, user)) {
    return json({ error: 'Forbidden' }, headers, 403);
  }

  const pathParts = url.pathname.replace('/api/admin', '').split('/').filter(Boolean);
  const resource = pathParts[0];
  const resourceId = pathParts[1];

  // GET /api/admin/assets
  if (resource === 'assets' && !resourceId && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM assets ORDER BY created_at DESC LIMIT 500'
    ).all();
    const results = (rows.results as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      title: r.title,
      ownerId: r.owner_id,
      size: r.size_bytes,
      type: r.asset_type,
      createdAt: r.created_at,
      url: r.url,
      r2_key: r.r2_key,
      filename: r.filename,
      width: r.width,
      height: r.height,
      tags: JSON.parse((r.tags as string) || '[]'),
    }));
    return json(results, headers);
  }

  // DELETE /api/admin/assets/:id
  if (resource === 'assets' && resourceId && request.method === 'DELETE') {
    const asset = await env.DB.prepare('SELECT r2_key, size_bytes, owner_id FROM assets WHERE id = ?')
      .bind(resourceId)
      .first<{ r2_key: string; size_bytes: number; owner_id: string }>();
    if (!asset) return json({ error: 'Not Found' }, headers, 404);

    await env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(resourceId).run();

    try {
      if (asset.r2_key) await env.R2_BUCKET.delete(asset.r2_key);
    } catch (e) {
      console.error('R2削除失敗:', asset.r2_key, e);
    }

    if (asset.size_bytes > 0) {
      const { releaseStorageUsage } = await import('../utils/rateLimit');
      await releaseStorageUsage(env.DB, asset.owner_id, asset.size_bytes).catch((e: unknown) =>
        console.error('ストレージ使用量更新失敗:', e),
      );
    }

    return json({ ok: true }, headers);
  }

  // PATCH /api/admin/assets/:id
  if (resource === 'assets' && resourceId && request.method === 'PATCH') {
    const body = await request.json() as { title?: string };
    const title = (body.title ?? '').trim();
    if (!title) {
      return json({ error: 'title is required' }, headers, 400);
    }

    const result = await env.DB.prepare(
      'UPDATE assets SET title = ? WHERE id = ?'
    )
      .bind(title, resourceId)
      .run();

    if (!result.success || (result.meta.changes ?? 0) === 0) {
      return json({ error: 'Not Found' }, headers, 404);
    }

    return json({ ok: true }, headers);
  }

  // GET /api/admin/users
  if (resource === 'users' && !resourceId && request.method === 'GET') {
    const res = await supabaseFetch(
      env,
      'users?select=id,display_name,avatar_url,created_at,updated_at&order=created_at.desc'
    );
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    const data = await res.json();
    return json(data, headers);
  }

  // DELETE /api/admin/users/:id
  if (resource === 'users' && resourceId && !pathParts[2] && request.method === 'DELETE') {
    const res = await supabaseFetch(env, `users?id=eq.${resourceId}`, { method: 'DELETE' });
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    return json({ ok: true }, headers);
  }

  // PATCH /api/admin/users/:id
  if (resource === 'users' && resourceId && !pathParts[2] && request.method === 'PATCH') {
    const body = await request.json() as { display_name?: string };
    const displayName = (body.display_name ?? '').trim();
    if (!displayName) {
      return json({ error: 'display_name is required' }, headers, 400);
    }

    const res = await supabaseFetch(env, `users?id=eq.${resourceId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    return json({ ok: true }, headers);
  }

  // GET /api/admin/rooms
  if (resource === 'rooms' && !resourceId && request.method === 'GET') {
    const res = await supabaseFetch(
      env,
      'rooms?select=id,name,owner_id,description,archived,created_at,updated_at&order=created_at.desc'
    );
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    const data = await res.json();
    return json(data, headers);
  }

  // DELETE /api/admin/rooms/:id
  if (resource === 'rooms' && resourceId && !pathParts[2] && request.method === 'DELETE') {
    // Delete room_members first (foreign key constraint)
    const rmRes = await supabaseFetch(env, `room_members?room_id=eq.${resourceId}`, { method: 'DELETE' });
    if (!rmRes.ok) {
      return json({ error: 'Supabase error', status: rmRes.status }, headers, 502);
    }

    const res = await supabaseFetch(env, `rooms?id=eq.${resourceId}`, { method: 'DELETE' });
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    return json({ ok: true }, headers);
  }

  // PATCH /api/admin/rooms/:id
  if (resource === 'rooms' && resourceId && !pathParts[2] && request.method === 'PATCH') {
    const body = await request.json() as { name?: string };
    const name = (body.name ?? '').trim();
    if (!name) {
      return json({ error: 'name is required' }, headers, 400);
    }

    const res = await supabaseFetch(env, `rooms?id=eq.${resourceId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    return json({ ok: true }, headers);
  }

  // GET /api/admin/rooms/:id/members
  if (resource === 'rooms' && resourceId && pathParts[2] === 'members' && !pathParts[3] && request.method === 'GET') {
    const res = await supabaseFetch(
      env,
      `room_members?select=room_id,user_id,role,joined_at,users(display_name,avatar_url)&room_id=eq.${resourceId}&order=joined_at.asc`
    );
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    const data = await res.json();
    return json(data, headers);
  }

  // PUT /api/admin/rooms/:id/members/:userId
  if (resource === 'rooms' && resourceId && pathParts[2] === 'members' && pathParts[3] && request.method === 'PUT') {
    const body = await request.json() as { role: string };
    const res = await supabaseFetch(
      env,
      `room_members?room_id=eq.${resourceId}&user_id=eq.${pathParts[3]}`,
      {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role: body.role }),
      }
    );
    if (!res.ok) {
      return json({ error: 'Supabase error', status: res.status }, headers, 502);
    }
    return json({ ok: true }, headers);
  }

  return new Response('Not Found', { status: 404, headers });
}
