/**
 * ソート済みリスト内で、指定アイテムの直後に挿入するための sort_order を計算する。
 * 対象アイテムと次のアイテムの中間値を返すため、何回呼んでも衝突しない。
 *
 * @param sortedItems sort_order 昇順のアイテム配列
 * @param afterId このIDのアイテムの直後に挿入する。null/undefined なら末尾。
 * @param getSortOrder アイテムから sort_order を取得する関数
 * @returns 挿入先の sort_order。afterId が見つからないか null の場合は undefined（= 各 hook のデフォルト = 末尾）
 */
export function calcInsertSortOrder<T extends { id: string }>(
  sortedItems: T[],
  afterId: string | null | undefined,
  getSortOrder: (item: T) => number,
): number | undefined {
  if (!afterId) return undefined;
  const idx = sortedItems.findIndex(item => item.id === afterId);
  if (idx < 0) return undefined;

  const current = getSortOrder(sortedItems[idx]);
  const next = idx + 1 < sortedItems.length ? getSortOrder(sortedItems[idx + 1]) : current + 1;
  return (current + next) / 2;
}
