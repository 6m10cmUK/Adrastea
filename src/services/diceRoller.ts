import type { DiceResult } from '../types/adrastea.types';

/**
 * BCDice API を使用したダイスロール処理
 * GET https://bcdice.onlinesession.app/v2/game_system/{gameSystem}/roll?command={command}
 */

export async function rollDice(
  input: string,
  gameSystem: string = 'DiceBot',
): Promise<DiceResult | null> {
  try {
    const res = await fetch(
      `https://bcdice.onlinesession.app/v2/game_system/${encodeURIComponent(gameSystem)}/roll?command=${encodeURIComponent(input)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; text?: string; secret?: boolean; success?: boolean; failure?: boolean; reason?: string };
    if (!data.ok) return null;
    return {
      text: data.text || '',
      success: data.success ? true : data.failure ? false : null,
      result: input,
      isSecret: data.secret ?? false,
    };
  } catch {
    return null;
  }
}

export async function getAvailableSystems(): Promise<
  { id: string; name: string }[]
> {
  const FALLBACK = [{ id: 'DiceBot', name: '汎用ダイスボット' }];

  try {
    const response = await fetch(
      'https://bcdice.onlinesession.app/v2/game_system'
    );
    if (!response.ok) return FALLBACK;

    const data = await response.json() as { game_system?: { id: string; name: string }[] };
    if (!Array.isArray(data.game_system)) return FALLBACK;

    const systems = data.game_system
      .filter((item) => item.id !== 'DiceBot')
      .map((item) => ({ id: item.id, name: item.name }));

    return [{ id: 'DiceBot', name: '汎用ダイスボット' }, ...systems];
  } catch {
    return FALLBACK;
  }
}

export async function getGameSystemHelp(gameSystem: string = 'DiceBot'): Promise<string | null> {
  try {
    const response = await fetch(
      `https://bcdice.onlinesession.app/v2/game_system/${encodeURIComponent(gameSystem)}`
    );
    if (!response.ok) return null;

    const data = await response.json() as { ok?: boolean; help_message?: string };
    if (data.ok === false) return null;
    return data.help_message ?? null;
  } catch {
    return null;
  }
}
