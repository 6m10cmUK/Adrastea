/**
 * ドロップダウン・ポップアップの表示位置を計算する。
 * ビューポートからはみ出る場合は自動的にフリップ・クランプする。
 *
 * @param triggerRect  トリガー要素の getBoundingClientRect() 結果
 * @param popupWidth   ポップアップの推定幅 (px)
 * @param popupHeight  ポップアップの推定高さ (px)
 * @param prefer       開く方向の優先 ('down' = 下方向優先, 'up' = 上方向優先)
 * @returns            { top, left } — position:fixed に直接使える値
 */
export function calcPopupPos(
  triggerRect: DOMRect,
  popupWidth: number,
  popupHeight: number,
  prefer: 'down' | 'up' = 'down',
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 垂直方向: 優先方向に十分スペースがあるか確認してフリップ
  let top: number;
  if (prefer === 'down') {
    if (triggerRect.bottom + 4 + popupHeight <= vh) {
      top = triggerRect.bottom + 4;
    } else if (triggerRect.top - 4 - popupHeight >= 0) {
      top = triggerRect.top - 4 - popupHeight;
    } else {
      // どちらにも収まらない場合は下方向で最大限
      top = triggerRect.bottom + 4;
    }
  } else {
    if (triggerRect.top - 4 - popupHeight >= 0) {
      top = triggerRect.top - 4 - popupHeight;
    } else if (triggerRect.bottom + 4 + popupHeight <= vh) {
      top = triggerRect.bottom + 4;
    } else {
      // どちらにも収まらない場合は上方向で最大限
      top = Math.max(0, triggerRect.top - 4 - popupHeight);
    }
  }

  // 水平方向: 右端はみ出し補正
  let left = triggerRect.left;
  if (left + popupWidth > vw) {
    left = Math.max(0, vw - popupWidth - 4);
  }

  return { top, left };
}
