/**
 * Cloudflare Worker — Adrastea API
 *
 * - R2 ファイルアップロード/配信
 * - D1 ユーザー/ルーム/アセット管理
 * - Supabase Auth (JWT HS256)
 * - WebRTC シグナリング (KV polling)
 * - 使用量制御 (KV カウンター)
 */

import { handleRooms } from './routes/rooms';
import { handleMessages } from './routes/messages';
import { handleAssets } from './routes/assets';
import { handleR2 } from './routes/r2';
import { handleAdmin } from './routes/admin';
import { corsHeaders } from './utils/cors';
import { checkRateLimit } from './utils/rateLimit';
import { verifyJwt } from './utils/jwt';
import type { Env, AuthUser } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGINS ?? '');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      return await handleRequest(request, url, env, headers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
  },

  // Supabase pause 予防 ping（週2回実行）
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?select=id&limit=1`, {
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      });
      console.log(`Supabase ping: ${res.status}`);
    } catch (err) {
      console.error('Supabase ping failed:', err);
    }

    // 30日以上未更新のルームを自動アーカイブ
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const isoThirtyDaysAgo = new Date(thirtyDaysAgo).toISOString();

      // Supabase から対象ルーム取得
      const archiveRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/rooms?select=id&archived=eq.0&updated_at=lt.${isoThirtyDaysAgo}&limit=5`,
        {
          method: 'GET',
          headers: {
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!archiveRes.ok) {
        console.warn(`Failed to fetch rooms for auto-archive: ${archiveRes.status}`);
      } else {
        const roomsToArchive = (await archiveRes.json()) as Array<{ id: string }>;

        // 各ルームをアーカイブ
        for (const room of roomsToArchive) {
          try {
            console.log(`Auto-archiving room: ${room.id}`);

            const supabaseHeaders = {
              'apikey': env.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
            };

            const roomRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${room.id}`, {
              headers: supabaseHeaders,
            });
            const rooms = (await roomRes.json()) as unknown[];

            const snapshotRes = await fetch(`${env.SUPABASE_URL}/rest/v1/room_snapshots?room_id=eq.${room.id}`, {
              headers: supabaseHeaders,
            });
            const snapshots = (await snapshotRes.json()) as unknown[];

            // D1 room_archives に INSERT
            const archiveData = JSON.stringify({ rooms, snapshots });
            const now = Date.now();
            await env.DB.prepare(
              'INSERT INTO room_archives (room_id, data, archived_at) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET data = ?, archived_at = ?',
            )
              .bind(room.id, archiveData, now, archiveData, now)
              .run();

            // Supabase DELETE room_snapshots
            await fetch(`${env.SUPABASE_URL}/rest/v1/room_snapshots?room_id=eq.${room.id}`, {
              method: 'DELETE',
              headers: supabaseHeaders,
            });

            // Supabase UPDATE rooms SET archived = 1
            await fetch(`${env.SUPABASE_URL}/rest/v1/rooms?id=eq.${room.id}`, {
              method: 'PATCH',
              headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ archived: 1 }),
            });

            console.log(`Archived room: ${room.id}`);
          } catch (roomErr) {
            console.error(`Failed to archive room ${room.id}:`, roomErr);
            // 個別ルームのアーカイブ失敗は続行
          }
        }

        console.log(`Auto-archive completed: ${roomsToArchive.length} rooms processed`);
      }
    } catch (err) {
      console.error('Auto-archive error:', err);
    }

    // --- assets/R2 突き合わせ（孤立ファイル・壊れた参照の検出・削除） ---
    try {
      // 1. Supabase の assets テーブルから全 r2_key を取得
      // NOTE: RLS ポリシーが anon key での SELECT/DELETE をブロックする場合は SUPABASE_SERVICE_ROLE_KEY を使う
      const assetsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/assets?select=id,r2_key`,
        {
          headers: {
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!assetsRes.ok) throw new Error(`assets fetch failed: ${assetsRes.status}`);
      const assets = (await assetsRes.json()) as Array<{ id: string; r2_key: string }>;
      const dbKeys = new Set(assets.map(a => a.r2_key).filter(Boolean));

      // 2. R2 から全ファイルキーを取得（ページネーション対応）
      const r2Keys = new Set<string>();
      let cursor: string | undefined;
      do {
        const listed = await env.R2_BUCKET.list({ cursor, limit: 1000 });
        for (const obj of listed.objects) {
          r2Keys.add(obj.key);
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      // 3. 孤立ファイル（R2 にあるが DB にない）→ R2 から削除
      let orphanCount = 0;
      for (const key of r2Keys) {
        if (!dbKeys.has(key)) {
          await env.R2_BUCKET.delete(key);
          orphanCount++;
          if (orphanCount >= 20) break; // 1回あたり最大20件
        }
      }

      // 4. 壊れた参照（DB にあるが R2 にない）→ DB から削除
      let brokenCount = 0;
      for (const asset of assets) {
        if (asset.r2_key && !r2Keys.has(asset.r2_key)) {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/assets?id=eq.${asset.id}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
              },
            }
          );
          brokenCount++;
          if (brokenCount >= 20) break; // 1回あたり最大20件
        }
      }

      if (orphanCount > 0 || brokenCount > 0) {
        console.log(`Assets reconciliation: ${orphanCount} orphan files deleted, ${brokenCount} broken refs deleted`);
      }
    } catch (err) {
      console.error('Assets reconciliation failed:', err);
    }
  },
};

async function handleRequest(request: Request, url: URL, env: Env, headers: Record<string, string>): Promise<Response> {

    // 使用量制御（GET /file/* は除外）
    if (!url.pathname.startsWith('/file/')) {
      const rateLimitResult = await checkRateLimit(env.DB);
      if (!rateLimitResult.ok) {
        return new Response(
          JSON.stringify({ error: '本日の利用上限に達しました' }),
          { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
    }

    // --- R2 画像配信（認証不要） ---
    if (url.pathname.startsWith('/file/') && request.method === 'GET') {
      return handleR2.getFile(request, env, headers);
    }

    // --- 認証エンドポイント（Supabase Auth が担当、Worker では不要） ---
    if (url.pathname.startsWith('/auth/')) {
      return new Response('Auth endpoint deprecated (use Supabase Auth)', { status: 410, headers });
    }

    // --- Messages Archive (JWT or X-Archive-Secret) ---
    if (url.pathname.match(/^\/api\/rooms\/[^/]+\/messages\/archive/) && request.method === 'POST') {
      const archiveSecret = request.headers.get('X-Archive-Secret');
      if (archiveSecret && env.ARCHIVE_SECRET && archiveSecret === env.ARCHIVE_SECRET) {
        return handleMessages(request, url, env, headers, null);
      }
    }

    // --- 以下は認証必須 ---
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401, headers });
    }
    const user = await verifyJwt(authHeader.slice(7), env.SUPABASE_URL ?? '');
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers });
    }

    // --- R2 アップロード/削除 ---
    if (url.pathname === '/upload' && request.method === 'POST') {
      return handleR2.upload(request, env, headers, user);
    }
    if (url.pathname === '/delete' && request.method === 'DELETE') {
      return handleR2.deleteFile(request, url, env, headers, user);
    }

    // --- Messages API ---
    if (url.pathname.match(/^\/api\/rooms\/[^/]+\/messages/)) {
      return handleMessages(request, url, env, headers, user);
    }

    // --- Rooms API ---
    if (url.pathname.startsWith('/api/rooms')) {
      return handleRooms(request, url, env, headers, user, authHeader.slice(7));
    }

    // --- Admin API ---
    if (url.pathname.startsWith('/api/admin')) {
      return handleAdmin(request, url, env, headers, user);
    }

    // --- Assets API ---
    if (url.pathname.startsWith('/api/assets')) {
      return handleAssets(request, url, env, headers, user);
    }

    return new Response('Not Found', { status: 404, headers });
}
