import { API_BASE_URL } from '../config/api';
import { compressImage } from './fileUpload';

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('画像読み込み失敗'));
    img.src = URL.createObjectURL(blob);
  });
}

async function uploadToR2(
  blob: Blob | File,
  r2_key: string,
  token: string,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', blob, r2_key.replace(/\//g, '_'));
  form.append('path', r2_key);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`アップロード失敗: ${res.status}`);
  return res.json();
}

export async function uploadAssetToR2(
  file: File,
  uid: string,
  token: string
): Promise<{ url: string; r2_key: string; size_bytes: number; width: number; height: number }> {
  if (file.size > 5 * 1024 * 1024) throw new Error('画像ファイルサイズが上限(5MB)を超えています');
  const compressed = await compressImage(file);
  const { width, height } = await getImageDimensions(compressed);

  const ext = compressed.type === 'image/gif' ? '.gif' : '.webp';
  const r2_key = `users/${uid}/assets/${Date.now()}_${file.name.replace(/\.[^.]+$/, '')}${ext}`;

  const data = await uploadToR2(compressed, r2_key, token);

  return {
    url: data.url,
    r2_key,
    size_bytes: compressed.size,
    width,
    height,
  };
}

export async function uploadAudioAssetToR2(
  file: File,
  uid: string,
  token: string
): Promise<{ url: string; r2_key: string; size_bytes: number; width: 0; height: 0 }> {
  if (file.size > 50 * 1024 * 1024) throw new Error('音声ファイルサイズが上限(50MB)を超えています');
  const r2_key = `users/${uid}/assets/${Date.now()}_${file.name}`;

  const data = await uploadToR2(file, r2_key, token);

  return { url: data.url, r2_key, size_bytes: file.size, width: 0, height: 0 };
}

/** R2ファイルを直接削除（ロールバック用） */
export async function deleteR2File(r2Key: string, token: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/delete?path=${encodeURIComponent(r2Key)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`削除失敗: ${res.status}`);
}

/**
 * アバター画像を 128x128 webp に圧縮して R2 にアップロードする。
 * 固定パス users/{uid}/avatar.webp に上書き保存。
 */
export async function uploadAvatarToR2(
  file: File | Blob,
  uid: string,
  token: string,
): Promise<string> {
  // canvas で 128x128 にリサイズ + webp 圧縮
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // アスペクト比を維持して中央クロップ
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, 128, 128);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))),
      'image/webp',
      0.7,
    );
  });

  const r2Key = `users/${uid}/avatar.webp`;
  const { url } = await uploadToR2(blob, r2Key, token);
  // キャッシュバスト用にタイムスタンプ付与
  return `${url}?t=${Date.now()}`;
}
