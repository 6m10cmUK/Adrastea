/** Supabase Realtime / PostgREST で bigint PK が number と string のどちらでも来うるため正規化する */
export function rowIdKey(id: unknown): string {
  return id === null || id === undefined ? '' : String(id);
}

export function sameRowId(a: unknown, b: unknown): boolean {
  return rowIdKey(a) === rowIdKey(b) && rowIdKey(a) !== '';
}
