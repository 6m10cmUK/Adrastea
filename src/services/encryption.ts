/**
 * クライアントサイドの暗号化/復号化サービス
 * AES-GCM を使用した暗号化を実装
 */
export class EncryptionService {
  /**
   * テキストを暗号化
   */
  static async encrypt(text: string, key: string): Promise<{ encrypted: string; iv: string }> {
    try {
      // キーをバイト配列に変換
      const keyBytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
      
      // CryptoKeyオブジェクトを作成
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes.slice(0, 32), // 32バイト（256ビット）のキーを使用
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      
      // 初期化ベクトル（IV）を生成
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // テキストをエンコード
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      // 暗号化
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        cryptoKey,
        data
      );
      
      // Base64エンコード
      return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
      };
    } catch (error) {
      console.error('暗号化エラー:', error);
      throw new Error('暗号化に失敗しました');
    }
  }
  
  /**
   * 暗号化されたテキストを復号化
   */
  static async decrypt(encryptedData: string, iv: string, key: string): Promise<string> {
    try {
      // キーをバイト配列に変換
      const keyBytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
      
      // CryptoKeyオブジェクトを作成
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      // Base64デコード
      const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
      
      // 復号化
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes
        },
        cryptoKey,
        encryptedBytes
      );
      
      // デコード
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('復号化エラー:', error);
      throw new Error('復号化に失敗しました');
    }
  }
}