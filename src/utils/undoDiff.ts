/**
 * エンティティ配列の前後を比較して diff エントリを生成する。
 * Undo/Redo stack 用。
 */

export interface UndoEntry {
  entityType: 'object' | 'character' | 'scene' | 'bgm';
  operation: 'add' | 'update' | 'remove';
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: number;
}

export function computeDiffs<T extends { id: string }>(
  entityType: UndoEntry['entityType'],
  prev: T[],
  current: T[],
): UndoEntry[] {
  const prevMap = new Map(prev.map(e => [e.id, e]));
  const currMap = new Map(current.map(e => [e.id, e]));
  const entries: UndoEntry[] = [];
  const now = Date.now();

  for (const [id, curr] of currMap) {
    const p = prevMap.get(id);
    if (!p) {
      entries.push({ entityType, operation: 'add', entityId: id, before: null, after: curr as unknown as Record<string, unknown>, timestamp: now });
    } else if (JSON.stringify(p) !== JSON.stringify(curr)) {
      entries.push({ entityType, operation: 'update', entityId: id, before: p as unknown as Record<string, unknown>, after: curr as unknown as Record<string, unknown>, timestamp: now });
    }
  }

  for (const [id, p] of prevMap) {
    if (!currMap.has(id)) {
      entries.push({ entityType, operation: 'remove', entityId: id, before: p as unknown as Record<string, unknown>, after: null, timestamp: now });
    }
  }

  return entries;
}
