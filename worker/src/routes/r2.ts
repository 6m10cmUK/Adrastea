import { reserveStorageUsage, releaseStorageUsage } from '../utils/rateLimit';
import type { Env, AuthUser } from '../types';

export const handleR2 = {
  async getFile(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice('/file/'.length));
    if (!key || key.includes('..')) {
      return new Response('Bad Request', { status: 400, headers });
    }

    const object = await env.R2_BUCKET.get(key);
    if (!object) {
      return new Response('Not Found', { status: 404, headers });
    }

    return new Response(object.body, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },

  async upload(
    request: Request,
    env: Env,
    headers: Record<string, string>,
    user: AuthUser,
  ): Promise<Response> {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const path = formData.get('path') as string | null;

    if (!file || !path) {
      return new Response('Bad Request: file and path required', { status: 400, headers });
    }

    if (path.includes('..') || path.startsWith('/')) {
      return new Response('Invalid path', { status: 400, headers });
    }

    if (!path.startsWith(`users/${user.uid}/`) && !path.startsWith(`${user.uid}/`)) {
      return new Response('Forbidden', { status: 403, headers });
    }

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return new Response('File too large', { status: 413, headers });
    }

    // ストレージ使用量チェック
    const storage = await reserveStorageUsage(env.DB, user.uid, file.size);
    if (!storage.ok) {
      return Response.json(
        { error: 'ストレージ上限に達しました' },
        { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const ALLOWED_TYPE_PREFIXES = ['image/', 'audio/'];
    const contentType = ALLOWED_TYPE_PREFIXES.some((p) => file.type.startsWith(p))
      ? file.type
      : 'application/octet-stream';

    // path をそのまま R2 キーとして使用（フロントが完全なキーを生成済み）
    const key = path;
    await env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType },
    });

    const url = new URL(request.url);
    const publicUrl = `${url.origin}/file/${encodeURIComponent(key)}`;

    const response: Record<string, unknown> = { url: publicUrl, key };
    if (storage.warning) {
      response.warning = 'ストレージ使用量が90%を超えています';
    }

    return Response.json(response, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },

  async deleteFile(
    request: Request,
    url: URL,
    env: Env,
    headers: Record<string, string>,
    user: AuthUser,
  ): Promise<Response> {
    const path = url.searchParams.get('path');
    if (!path) {
      return new Response('Bad Request: path required', { status: 400, headers });
    }

    if (path.includes('..') || path.startsWith('/')) {
      return new Response('Invalid path', { status: 400, headers });
    }

    if (!path.startsWith(`users/${user.uid}/`) && !path.startsWith(`${user.uid}/`)) {
      return new Response('Forbidden', { status: 403, headers });
    }

    // ファイルサイズ取得（ストレージ使用量更新用）
    const object = await env.R2_BUCKET.head(path);
    await env.R2_BUCKET.delete(path);

    if (object?.size) {
      await releaseStorageUsage(env.DB, user.uid, object.size);
    }

    return new Response('OK', { status: 200, headers });
  },
};
