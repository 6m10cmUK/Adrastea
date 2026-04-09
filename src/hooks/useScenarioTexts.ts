import { useCallback, useMemo } from 'react';
import { useSupabaseQuery, useSupabaseMutation } from './useSupabaseQuery';
import type { ScenarioText } from '../types/adrastea.types';
import { genId } from '../utils/id';

export function useScenarioTexts(roomId: string, enabled = true, options?: { initialData?: unknown[] }) {
  const { initialData } = options ?? {};
  const textsQuery = useSupabaseQuery<ScenarioText>({
    table: 'scenario_texts',
    columns: 'id,room_id,title,content,visible,speaker_character_id,speaker_name,channel_id,sort_order,created_at,updated_at',
    roomId,
    filter: (q) => q.eq('room_id', roomId),
    enabled,
    initialData,
  });
  const textsData = textsQuery.data;
  const textsMutation = useSupabaseMutation<ScenarioText>('scenario_texts', textsQuery.setData);

  const loading = textsQuery.loading;
  const scenarioTexts: ScenarioText[] = useMemo(() => (textsData ?? []).map((t) => ({
    id: t.id, room_id: t.room_id, title: t.title, content: t.content,
    visible: t.visible, sort_order: t.sort_order,
    speaker_character_id: t.speaker_character_id ?? null,
    speaker_name: t.speaker_name ?? null,
    channel_id: t.channel_id ?? null,
    created_at: t.created_at, updated_at: t.updated_at,
  } as ScenarioText)).sort((a, b) => a.sort_order - b.sort_order), [textsData]);

  const addScenarioText = useCallback(
    async (data: Partial<Omit<ScenarioText, 'id' | 'room_id'>>): Promise<ScenarioText> => {
      const id = (data as { id?: string }).id ?? genId();
      const now = Date.now();
      const newText: ScenarioText = {
        id, room_id: roomId,
        title: data.title ?? '新規テキスト',
        content: data.content ?? '',
        visible: data.visible ?? false,
        speaker_character_id: data.speaker_character_id ?? null,
        speaker_name: data.speaker_name ?? null,
        channel_id: data.channel_id ?? null,
        sort_order: data.sort_order ?? scenarioTexts.length,
        created_at: now, updated_at: now,
      };
      try {
        await textsMutation.insert(newText);
      } catch (err) {
        console.error('シナリオテキスト作成失敗:', err);
        throw err;
      }
      return newText;
    },
    [roomId, scenarioTexts.length, textsMutation]
  );

  const updateScenarioText = useCallback(
    async (textId: string, updates: Partial<ScenarioText>): Promise<void> => {
      try {
        const { id: _id, room_id: _rid, created_at: _ca, updated_at: _ua, ...rest } = updates as ScenarioText;
        await textsMutation.update(textId, rest as Partial<ScenarioText>);
      } catch (err) {
        console.error('シナリオテキスト更新失敗:', err);
        throw err;
      }
    },
    [textsMutation]
  );

  const removeScenarioText = useCallback(
    async (textId: string): Promise<void> => {
      try {
        await textsMutation.remove(textId);
      } catch (err) {
        console.error('シナリオテキスト削除失敗:', err);
        throw err;
      }
    },
    [textsMutation]
  );

  const reorderScenarioTexts = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      try {
        await textsMutation.reorder(orderedIds);
      } catch (err) {
        console.error('シナリオテキスト並べ替え失敗:', err);
        throw err;
      }
    },
    [textsMutation]
  );

  return { scenarioTexts, loading, addScenarioText, updateScenarioText, removeScenarioText, reorderScenarioTexts };
}
