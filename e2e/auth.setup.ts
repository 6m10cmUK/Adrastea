import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
export const AUTH_FILE = path.join(__dirname, '.auth/state.json');

const CACHE_TTL_MS = 50 * 60 * 1000;

const SUPABASE_URL = 'https://yrbunpqdbhlgxagifpau.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_J1PYr4e0chbEHislvQVTKw_F7Wx5-WH';

setup('authenticate', async () => {
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      console.log('✅ 認証状態が50分以内 — 再利用します');
      return;
    }
    console.log('⏰ 認証状態が期限切れ — 再認証します');
  }

  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD が .env.local に未設定');
  }

  // Node.js 側で Supabase にログイン
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Supabase 認証失敗: ${error?.message ?? 'セッションなし'}`);
  }

  const sessionJson = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.session.user,
  });

  // Supabase が localStorage に保存するキー名
  const storageKey = `sb-yrbunpqdbhlgxagifpau-auth-token`;

  // storageState JSON を直接構築
  const origin = 'https://localhost:6100';
  const storageState = {
    cookies: [],
    origins: [{
      origin,
      localStorage: [
        { name: storageKey, value: sessionJson },
      ],
    }],
  };

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(storageState, null, 2));
  console.log(`✅ 認証状態を ${AUTH_FILE} に保存しました（email: ${email}）`);
});
