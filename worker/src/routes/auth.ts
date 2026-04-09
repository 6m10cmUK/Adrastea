import type { Env } from '../types';

export async function handleAuth(
  _request: Request,
  _url: URL,
  _env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  return new Response('Auth endpoint deprecated (use Convex Auth)', { status: 410, headers });
}
