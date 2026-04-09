const DAILY_LIMIT = 90_000; // Workers無料枠10万の90%
const STORAGE_LIMIT = 1073741824; // 1GB per user

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkRateLimit(db: D1Database): Promise<{ ok: boolean; count: number }> {
  try {
    const today = getToday();
    const key = 'workers_daily';

    // INSERT...ON CONFLICTで原子的にカウントを取得・更新
    const result = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, date) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN date = excluded.date THEN count + 1 ELSE 1 END,
           date = excluded.date
         RETURNING count`,
      )
      .bind(key, today)
      .first<{ count: number }>();

    const count = result?.count ?? 0;

    if (count >= DAILY_LIMIT) {
      return { ok: false, count };
    }

    return { ok: true, count };
  } catch {
    // D1障害時はリクエストを通す（カウント不可だが機能継続優先）
    return { ok: true, count: 0 };
  }
}

export async function reserveStorageUsage(
  db: D1Database,
  userId: string,
  additionalBytes: number,
): Promise<{ ok: boolean; warning: boolean; usedBytes: number }> {
  try {
    const now = Date.now();

    // INSERT...ON CONFLICTで原子的に加算してチェック
    const result = await db
      .prepare(
        `INSERT INTO storage_usage (user_id, bytes, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           bytes = bytes + excluded.bytes,
           updated_at = excluded.updated_at
         RETURNING bytes`,
      )
      .bind(userId, additionalBytes, now)
      .first<{ bytes: number }>();

    const newBytes = result?.bytes ?? additionalBytes;

    if (newBytes > STORAGE_LIMIT) {
      // 現在値を取得（失敗時は0）
      const current = await db
        .prepare('SELECT bytes FROM storage_usage WHERE user_id = ?')
        .bind(userId)
        .first<{ bytes: number }>();
      const usedBytes = current?.bytes ?? 0;
      return { ok: false, warning: true, usedBytes };
    }

    return {
      ok: true,
      warning: newBytes > STORAGE_LIMIT * 0.9,
      usedBytes: newBytes,
    };
  } catch {
    // D1障害時は通す（ストレージ管理より機能継続優先）
    return { ok: true, warning: false, usedBytes: 0 };
  }
}

export async function releaseStorageUsage(
  db: D1Database,
  userId: string,
  deltaBytes: number,
): Promise<void> {
  try {
    const now = Date.now();
    await db
      .prepare('UPDATE storage_usage SET bytes = MAX(0, bytes - ?), updated_at = ? WHERE user_id = ?')
      .bind(deltaBytes, now, userId)
      .run();
  } catch {
    // D1エラーは無視（削除処理なので致命的でない）
  }
}
