/**
 * オブジェクトから指定キーを削除し、残りをPartialで返す
 * destructuring で unwanted parameter warnings を避けるための utility
 */
export function omitKeys<T extends object>(obj: T, keys: string[]): Partial<T> {
  const result = { ...obj };
  for (const key of keys) {
    delete (result as Record<string, unknown>)[key];
  }
  return result;
}
