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

// .env.local から Supabase URL/KEY を読む
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_ANON_KEY が .env.local に未設定');
}

setup('authenticate', async () => {
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      console.log('✅ 認証状態が50分以内 — 再利用します');
      return;
    }
    console.log('⏰ 認証状態が期限切れ — 再認証します');
  }

  const email = process.env.PLAYWRIGHT_TEST_EMAIL || 'test@adrastea.local';
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || 'test_password_12345';
  if (!email || !password) {
    throw new Error('PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD が .env.local に未設定');
  }

  // Node.js 側で Supabase にログイン（ユーザーが存在しなければ signUp で作成）
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // ユーザーが存在しない場合は signUp で作成
    const signUp = await supabase.auth.signUp({ email, password, options: { data: { full_name: 'Test User' } } });
    if (signUp.error || !signUp.data.session) {
      throw new Error(`Supabase 認証失敗 (signIn: ${error.message}, signUp: ${signUp.error?.message ?? 'セッションなし'})`);
    }
    data = signUp.data;
    error = null;
  }
  if (!data.session) {
    throw new Error('Supabase 認証失敗: セッションなし');
  }

  const sessionJson = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.session.user,
  });

  // Supabase JS のデフォルト storageKey: sb-{hostname.split('.')[0]}-auth-token
  const url = new URL(SUPABASE_URL);
  const storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`;

  // storageState JSON を直接構築
  const origin = process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:6100';
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
