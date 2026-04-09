export const API_BASE_URL = import.meta.env.VITE_R2_WORKER_URL ?? '';
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

if (!API_BASE_URL) {
  console.error('VITE_R2_WORKER_URL が設定されていません。.envファイルを確認してください。');
}

/** JWT付きfetch（Supabase JWT を Authorization ヘッダーで Worker に送信） */
export async function apiFetch(path: string, init?: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  return res;
}
