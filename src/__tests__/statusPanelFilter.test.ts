import { describe, it, expect } from 'vitest';

// StatusDockPanel で使われているフィルタ+ソートロジックを再現
function filterAndSortCharacters(characters: Array<{
  id: string;
  name: string;
  is_hidden_on_board: boolean;
  board_visible?: boolean;
  initiative?: number;
}>) {
  return [...characters]
    .filter(c => !c.is_hidden_on_board && c.board_visible !== false)
    .sort((a, b) => {
      const byInitiative = (b.initiative ?? 0) - (a.initiative ?? 0);
      if (byInitiative !== 0) return byInitiative;
      const byCreated = ((a as any).created_at ?? 0) - ((b as any).created_at ?? 0);
      if (byCreated !== 0) return byCreated;
      return (a as any).id?.localeCompare?.((b as any).id) ?? 0;
    });
}

describe('StatusDockPanel フィルタロジック', () => {
  it('board_visible: false のキャラは除外される', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: false,
        board_visible: false,
        initiative: 10,
      },
      {
        id: '2',
        name: 'キャラB',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 5,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('キャラB');
  });

  it('is_hidden_on_board: true のキャラは除外される', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: true,
        board_visible: true,
        initiative: 10,
      },
      {
        id: '2',
        name: 'キャラB',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 5,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('キャラB');
  });

  it('両方デフォルト（board_visible 未指定、is_hidden_on_board: false）のキャラは表示される', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: false,
        // board_visible 未指定 = undefined = デフォルト true扱い
        initiative: 10,
      },
      {
        id: '2',
        name: 'キャラB',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 5,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toEqual(['キャラA', 'キャラB']);
  });

  it('board_visible: true を明示したキャラも表示される', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 10,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('キャラA');
  });

  it('混在時、表示対象だけがイニシアチブ降順で並ぶ', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 5,
      },
      {
        id: '2',
        name: 'キャラB（除外: board_visible=false）',
        is_hidden_on_board: false,
        board_visible: false,
        initiative: 20,
      },
      {
        id: '3',
        name: 'キャラC',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 15,
      },
      {
        id: '4',
        name: 'キャラD（除外: is_hidden_on_board=true）',
        is_hidden_on_board: true,
        board_visible: true,
        initiative: 25,
      },
      {
        id: '5',
        name: 'キャラE',
        is_hidden_on_board: false,
        // board_visible 未指定
        initiative: 10,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(3);
    expect(result.map(c => c.name)).toEqual(['キャラC', 'キャラE', 'キャラA']);
    // イニシアチブ確認: 15 > 10 > 5
    expect(result.map(c => c.initiative)).toEqual([15, 10, 5]);
  });

  it('initiative が undefined のキャラは 0 として扱われてソートされる', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 5,
      },
      {
        id: '2',
        name: 'キャラB',
        is_hidden_on_board: false,
        board_visible: true,
        // initiative 未指定
      },
      {
        id: '3',
        name: 'キャラC',
        is_hidden_on_board: false,
        board_visible: true,
        initiative: 0,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(3);
    // キャラA (5) > キャラB (0) = キャラC (0)
    // 同じ値の場合は元の順序を保持
    expect(result.map(c => c.name)).toEqual(['キャラA', 'キャラB', 'キャラC']);
  });

  it('全キャラが除外される場合、空配列を返す', () => {
    const characters = [
      {
        id: '1',
        name: 'キャラA',
        is_hidden_on_board: true,
        board_visible: false,
        initiative: 10,
      },
      {
        id: '2',
        name: 'キャラB',
        is_hidden_on_board: true,
        board_visible: true,
        initiative: 5,
      },
    ];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(0);
  });

  it('空の配列が渡された場合、空配列を返す', () => {
    const characters: Array<{
      id: string;
      name: string;
      is_hidden_on_board: boolean;
      board_visible?: boolean;
      initiative?: number;
    }> = [];

    const result = filterAndSortCharacters(characters);

    expect(result).toHaveLength(0);
  });
});
