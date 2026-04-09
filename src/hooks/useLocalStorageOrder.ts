import { useMemo, useCallback, useState } from 'react';

function applyOrder<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const idToItem = new Map(items.map(i => [i.id, i]));
  const sorted: T[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const item = idToItem.get(id);
    if (item) { sorted.push(item); seen.add(id); }
  }
  for (const item of items) {
    if (!seen.has(item.id)) sorted.push(item);
  }
  return sorted;
}

export function useLocalStorageOrder<T extends { id: string }>(
  items: T[],
  storageKey: string
): {
  orderedItems: T[];
  saveOrder: (orderedIds: string[]) => void;
  removeFromOrder: (id: string) => void;
} {
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const orderedItems = useMemo(
    () => savedIds.length > 0 ? applyOrder(items, savedIds) : items,
    [items, savedIds]
  );

  const saveOrder = useCallback((orderedIds: string[]) => {
    localStorage.setItem(storageKey, JSON.stringify(orderedIds));
    setSavedIds(orderedIds);
  }, [storageKey]);

  const removeFromOrder = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = prev.filter(i => i !== id);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { orderedItems, saveOrder, removeFromOrder };
}
