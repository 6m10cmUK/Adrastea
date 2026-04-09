import type { Env, AuthUser } from '../types';
import { json } from '../utils/json';

export async function handleAssets(
  request: Request,
  url: URL,
  env: Env,
  headers: Record<string, string>,
  user: AuthUser,
): Promise<Response> {
  const pathParts = url.pathname.replace('/api/assets', '').split('/').filter(Boolean);
  const assetId = pathParts[0];

  // GET /api/assets — アセット一覧
  if (!assetId && request.method === 'GET') {
    const assetType = url.searchParams.get('type'); // 'image' | 'audio' | null
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500'), 500);
    const offset = parseInt(url.searchParams.get('offset') ?? '0') || 0;
    let query = 'SELECT * FROM assets WHERE owner_id = ?';
    const params: unknown[] = [user.uid];

    if (assetType) {
      query += ' AND asset_type = ?';
      params.push(assetType);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = await env.DB.prepare(query).bind(...params).all();
    // tagsをJSONパース
    const results = rows.results.map((r: any) => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
    }));
    return json(results, headers);
  }

  // POST /api/assets — メタデータ登録
  if (!assetId && request.method === 'POST') {
    const body = (await request.json()) as {
      url: string;
      r2_key: string;
      filename: string;
      title: string;
      size_bytes: number;
      width?: number;
      height?: number;
      tags?: string[];
      asset_type?: string;
    };

    if (!body.url || body.r2_key === undefined || body.r2_key === null || !body.filename) {
      return json({ error: 'url, r2_key, filename required' }, headers, 400);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO assets (id, owner_id, url, r2_key, filename, title, size_bytes, width, height, tags, asset_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        user.uid,
        body.url,
        body.r2_key,
        body.filename,
        body.title || body.filename,
        body.size_bytes || 0,
        body.width || 0,
        body.height || 0,
        JSON.stringify(body.tags || []),
        body.asset_type || 'image',
        now,
      )
      .run();

    return json({ id, ...body, created_at: now }, headers, 201);
  }

  if (!assetId) return new Response('Not Found', { status: 404, headers });

  // GET /api/assets/:id — 単体取得（所有者不問）
  if (request.method === 'GET') {
    const asset = await env.DB.prepare('SELECT * FROM assets WHERE id = ?')
      .bind(assetId)
      .first<Record<string, unknown>>();
    if (!asset) return json({ error: 'Not Found' }, headers, 404);
    return json({ ...asset, tags: JSON.parse((asset.tags as string) || '[]') }, headers);
  }

  // PATCH /api/assets/:id — タグ/タイトル更新
  if (request.method === 'PATCH') {
    const asset = await env.DB.prepare('SELECT owner_id FROM assets WHERE id = ?')
      .bind(assetId)
      .first<{ owner_id: string }>();
    if (!asset || asset.owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    const body = (await request.json()) as { tags?: string[]; title?: string };
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (body.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(body.tags)); }
    if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title); }

    if (sets.length === 0) return json({ ok: true }, headers);

    vals.push(assetId);
    await env.DB.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals)
      .run();

    return json({ ok: true }, headers);
  }

  // DELETE /api/assets/:id — 削除（R2も）
  if (request.method === 'DELETE') {
    const asset = await env.DB.prepare('SELECT owner_id, r2_key, size_bytes FROM assets WHERE id = ?')
      .bind(assetId)
      .first<{ owner_id: string; r2_key: string; size_bytes: number }>();
    if (!asset || asset.owner_id !== user.uid) {
      return json({ error: 'Forbidden' }, headers, 403);
    }

    // D1メタデータを先に削除（参照が消えれば孤立ファイルは無害）
    await env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(assetId).run();

    // R2から削除（失敗してもD1は既に削除済みなのでログのみ）
    try {
      if (asset.r2_key) {
        await env.R2_BUCKET.delete(asset.r2_key);
      }
    } catch (e) {
      console.error('R2削除失敗（孤立ファイル）:', asset.r2_key, e);
    }

    // ストレージ使用量更新
    if (asset.size_bytes > 0) {
      const { releaseStorageUsage } = await import('../utils/rateLimit');
      await releaseStorageUsage(env.DB, user.uid, asset.size_bytes).catch((e: unknown) =>
        console.error('ストレージ使用量更新失敗:', e),
      );
    }

    return json({ ok: true }, headers);
  }

  return new Response('Not Found', { status: 404, headers });
}
