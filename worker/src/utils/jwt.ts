import type { AuthUser } from '../types';

// JWKS キャッシュ
let cachedKeys: Map<string, CryptoKey> | null = null;
let cacheExpiry = 0;

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getJwksKeys(supabaseUrl: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeys && now < cacheExpiry) return cachedKeys;

  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
  const data = (await res.json()) as { keys: Array<JsonWebKey & { kid?: string; alg?: string; kty?: string }> };

  const keys = new Map<string, CryptoKey>();
  for (const jwk of data.keys ?? []) {
    if (!jwk.kid) continue;
    const alg = jwk.alg ?? (jwk.kty === 'EC' ? 'ES256' : 'RS256');
    let algo: EcKeyImportParams | RsaHashedImportParams;
    if (alg === 'ES256') {
      algo = { name: 'ECDSA', namedCurve: 'P-256' };
    } else if (alg === 'RS256') {
      algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    } else {
      continue;
    }
    const key = await crypto.subtle.importKey('jwk', jwk, algo, false, ['verify']);
    keys.set(jwk.kid, key);
  }

  cachedKeys = keys;
  cacheExpiry = now + 5 * 60 * 1000;
  return keys;
}

/**
 * Supabase JWT を JWKS 公開鍵で検証する（ES256）
 */
export async function verifyJwt(token: string, supabaseUrl: string): Promise<AuthUser | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const decoder = new TextDecoder();
    const header = JSON.parse(decoder.decode(base64urlDecode(parts[0])));
    const payload = JSON.parse(decoder.decode(base64urlDecode(parts[1])));

    // 期限切れチェック
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    // JWKS から公開鍵を取得
    const keys = await getJwksKeys(supabaseUrl);
    const kid = header.kid as string | undefined;
    const key = kid ? keys.get(kid) : keys.values().next().value;
    if (!key) return null;

    // 署名検証
    const alg = header.alg as string;
    let algo: EcdsaParams | AlgorithmIdentifier;
    if (alg === 'ES256') {
      algo = { name: 'ECDSA', hash: 'SHA-256' };
    } else if (alg === 'RS256') {
      algo = { name: 'RSASSA-PKCS1-v1_5' };
    } else {
      return null;
    }

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = base64urlDecode(parts[2]);
    const valid = await crypto.subtle.verify(algo, key, sig, data);
    if (!valid) return null;

    const metadata = payload.user_metadata ?? {};
    return {
      uid: payload.sub,
      displayName: metadata.full_name ?? metadata.name ?? '',
      avatarUrl: metadata.avatar_url ?? null,
      isGuest: payload.is_anonymous ?? false,
    };
  } catch {
    return null;
  }
}
