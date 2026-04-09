export function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export function formatInitiative(val: number): string {
  if (val === 0) return '0';
  const rounded = Math.round(val * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** StatusDockPanel / 盤面オーバーレイで同一の並びにする */
export function filterAndSortStatusPanelCharacters<T extends {
  id: string;
  is_hidden_on_board: boolean;
  board_visible?: boolean;
  initiative?: number;
  created_at?: number;
}>(characters: T[]): T[] {
  return [...characters]
    .filter((c) => !c.is_hidden_on_board && c.board_visible !== false)
    .sort((a, b) => {
      const byInitiative = (b.initiative ?? 0) - (a.initiative ?? 0);
      if (byInitiative !== 0) return byInitiative;
      const byCreated = (a.created_at ?? 0) - (b.created_at ?? 0);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
}
