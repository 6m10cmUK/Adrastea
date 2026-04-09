import type { CharacterStatus } from '../types/adrastea.types';

/**
 * 同一ラベルの value 変化をチャット1行ずつに整形（仕様: [キャラ名] ラベル : 旧値 → 新値）
 */
export function buildStatusChangeChatContents(
  characterName: string,
  prev: CharacterStatus[],
  next: CharacterStatus[]
): string[] {
  const prevByLabel = new Map<string, CharacterStatus>();
  for (const s of prev) {
    if (!prevByLabel.has(s.label)) prevByLabel.set(s.label, s);
  }
  const out: string[] = [];
  for (const b of next) {
    const a = prevByLabel.get(b.label);
    if (a && a.value !== b.value) {
      out.push(`[${characterName}] ${b.label} : ${a.value} → ${b.value}`);
    }
  }
  return out;
}
