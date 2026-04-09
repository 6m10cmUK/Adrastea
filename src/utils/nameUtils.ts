/**
 * 複製時の名前生成ルール
 *
 * existingNames が渡された場合:
 *   同名が存在しなければそのまま返す
 *   同名が存在すれば (2), (3)... と空き番号を探す
 * existingNames が渡されない場合（後方互換）:
 *   末尾が (n) 形式でない場合: 元の名前(2) にする
 *   末尾が (n) 形式の場合: 元の名前(n+1) にする
 */
export function generateDuplicateName(name: string, existingNames?: string[]): string {
  if (existingNames) {
    const nameSet = new Set(existingNames);
    if (!nameSet.has(name)) return name;
    // ベース名を取得（末尾の (n) を除去）
    const baseMatch = name.match(/^(.+)\(\d+\)$/);
    const baseName = baseMatch ? baseMatch[1] : name;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${baseName}(${i})`;
      if (!nameSet.has(candidate)) return candidate;
    }
    return `${name}(2)`;
  }

  // 後方互換: existingNames なし
  const match = name.match(/^(.+)\((\d+)\)$/);
  if (!match) {
    return `${name}(2)`;
  }
  const [, baseName, numStr] = match;
  const num = parseInt(numStr, 10);
  return `${baseName}(${num + 1})`;
}
