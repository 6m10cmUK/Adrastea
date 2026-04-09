import { apiFetch } from '../config/api';

export class EncryptionKeyService {
  /**
   * ユーザーの暗号化キーを取得（なければ生成してサーバーに保存）
   */
  static async getUserKey(_uid?: string): Promise<string> {
    // D1からキーを取得
    const res = await apiFetch('/auth/me');
    if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました');
    const data = await res.json();

    if (data.encryption_key) {
      return data.encryption_key;
    }

    // キーがなければ生成して保存
    const newKey = await this.generateSecureKey();
    const updateRes = await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryption_key: newKey }),
    });
    if (!updateRes.ok) throw new Error('暗号化キーの保存に失敗しました');
    return newKey;
  }

  /**
   * 安全な暗号化キーを生成
   */
  private static async generateSecureKey(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }
}
