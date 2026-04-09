import { encode as encodeWebP } from '@jsquash/webp';
import { API_BASE_URL, BACKEND_URL } from '../config/api';
import { supabase } from './supabase';

if (!API_BASE_URL) {
  throw new Error('API_BASE_URL が設定されていません。.env.local に VITE_API_BASE_URL を設定してください。');
}

/**
 * アニメーション画像かどうかをバイナリヘッダーで判定
 */
async function isAnimatedImage(file: File): Promise<boolean> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // GIF89a + 複数の Graphics Control Extension (0x21 0xF9)
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && bytes[4] === 0x39 && bytes[5] === 0x61
  ) {
    let count = 0;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
        count++;
        if (count >= 2) return true;
      }
    }
  }

  // WebP: RIFF ヘッダー内に ANIM チャンクが存在
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    // "ANIM" = 0x41 0x4E 0x49 0x4D
    for (let i = 12; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
        return true;
      }
    }
  }

  // APNG: PNG ヘッダー + acTL (Animation Control) チャンクが存在
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    // "acTL" = 0x61 0x63 0x54 0x4C
    for (let i = 8; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x61 && bytes[i + 1] === 0x63 && bytes[i + 2] === 0x54 && bytes[i + 3] === 0x4c) {
        return true;
      }
    }
  }

  return false;
}

/**
 * アニメーション画像を backend で圧縮する
 * backend 未設定 or 失敗時は元ファイルをそのまま返す
 */
async function compressAnimatedImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<Blob> {
  if (!BACKEND_URL) return file;

  try {
    const form = new FormData();
    form.append('file', file);
    const url = `${BACKEND_URL}/api/compress-image?max_width=${maxWidth}&quality=${quality}`;
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) {
      console.warn(`アニメ画像圧縮失敗 (${res.status}), 元ファイルを使用`);
      return file;
    }
    const blob = await res.blob();
    return blob;
  } catch (e) {
    console.warn('アニメ画像圧縮エラー, 元ファイルを使用:', e);
    return file;
  }
}

/**
 * Canvas APIでリサイズ → jSquash(libwebp Wasm)でWebPエンコード
 * アニメーション画像は backend で圧縮（フレーム保持）
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 80
): Promise<Blob> {
  if (await isAnimatedImage(file)) {
    return compressAnimatedImage(file, maxWidth, quality);
  }
  const imageData = await resizeToImageData(file, maxWidth);
  const webpBuffer = await encodeWebP(imageData, { quality });
  return new Blob([webpBuffer], { type: 'image/webp' });
}

function resizeToImageData(file: File, maxWidth: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(objectUrl); return reject(new Error('Canvas context取得失敗')); }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(imageData);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('画像読み込み失敗')); };
    img.src = objectUrl;
  });
}

async function getIdToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}

/**
 * 圧縮後の MIME type に応じた拡張子を返す
 */
function extFromMime(blob: Blob): string {
  if (blob.type === 'image/gif') return '.gif';
  return '.webp';
}

/**
 * 画像アップロード（自動圧縮あり）
 */
export async function uploadImage(
  file: File,
  path: string,
  options?: { maxWidth?: number; quality?: number }
): Promise<string> {
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('画像ファイルサイズが上限(10MB)を超えています');
  }
  const compressed = await compressImage(
    file,
    options?.maxWidth ?? 1920,
    options?.quality ?? 80
  );
  const ext = extFromMime(compressed);
  const token = await getIdToken();
  const form = new FormData();
  form.append('file', compressed, path.replace(/\//g, '_') + ext);
  form.append('path', path);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`アップロード失敗: ${res.status}`);
  const data = await res.json();
  return data.url;
}

/**
 * 音声ファイルアップロード（圧縮なし）
 */
export async function uploadAudio(file: File, path: string): Promise<string> {
  const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_AUDIO_SIZE) {
    throw new Error('音声ファイルサイズが上限(50MB)を超えています');
  }
  const token = await getIdToken();
  const form = new FormData();
  form.append('file', file);
  form.append('path', path);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`アップロード失敗: ${res.status}`);
  const data = await res.json();
  return data.url;
}

/**
 * ファイル削除
 */
export async function deleteFile(path: string): Promise<void> {
  if (path.includes('..') || path.startsWith('/')) {
    throw new Error('Invalid file path');
  }
  const token = await getIdToken();
  const res = await fetch(
    `${API_BASE_URL}/delete?path=${encodeURIComponent(path)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`削除失敗: ${res.status}`);
}
