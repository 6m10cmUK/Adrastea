export function json(data: unknown, headers: Record<string, string>, status = 200): Response {
  return Response.json(data, { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
