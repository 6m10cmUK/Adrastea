export function corsHeaders(origin: string, allowedOrigins: string): Record<string, string> {
  if (!allowedOrigins) return {};
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  if (origins.includes('*')) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }
  const isAllowed = origins.some((allowed) => {
    if (allowed.startsWith('https://*.')) {
      const suffix = allowed.slice('https://*'.length);
      return origin.startsWith('https://') && origin.endsWith(suffix);
    }
    return allowed === origin;
  });
  if (!isAllowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
