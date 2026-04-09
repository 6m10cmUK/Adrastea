import { useEffect } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { usePermission } from '../../hooks/usePermission';
import { ScenarioTextPanel } from '../ScenarioTextPanel';
import { generateDuplicateName } from '../../utils/nameUtils';
import { resolveTemplateVars } from '../utils/chatEditorUtils';

export function ScenarioTextDockPanel() {
  const ctx = useAdrasteaContext();
  const { can } = usePermission();
  const canEdit = can('scene_edit');

  useEffect(() => {
    ctx.registerPanel('scenarioText');
    return () => ctx.unregisterPanel('scenarioText');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = ctx.panelSelection?.panel === 'scenario_text' ? ctx.panelSelection.ids : [];

  return (
    <ScenarioTextPanel
      texts={ctx.scenarioTexts}
      selectedIds={selectedIds}
      onSelectIds={(ids) => {
        if (ids.length > 0) {
          ctx.clearAllEditing();
          ctx.setPanelSelection({ panel: 'scenario_text', ids });
          if (ids.length === 1) {
            ctx.setEditingScenarioTextId(ids[0]);
          }
        } else {
          // 空白クリック: 選択だけ解除、プロパティ表示は維持
          ctx.setPanelSelection(null);
        }
      }}
      keyboardActionsRef={ctx.keyboardActionsRef}
      panelSelection={ctx.panelSelection}
      onAdd={canEdit ? () => {
        const lastChannel = ctx.scenarioTexts.length > 0
          ? ctx.scenarioTexts[ctx.scenarioTexts.length - 1].channel_id
          : 'info';
        ctx.addScenarioText({ title: '新規テキストメモ', content: '', channel_id: lastChannel });
      } : () => {}}
      onRemove={canEdit ? (ids) => {
        ids.forEach(id => ctx.removeScenarioText(id));
      } : () => {}}
      onReorderTexts={ctx.reorderScenarioTexts}
      onSendToChat={(textId) => {
        const t = ctx.scenarioTexts.find(st => st.id === textId);
        if (!t || !t.content) return;
        const char = t.speaker_character_id ? ctx.characters.find(c => c.id === t.speaker_character_id) : null;
        const resolved = resolveTemplateVars(t.content, char ?? null);
        const msgType = 'chat' as const;
        const charName = t.speaker_name || char?.name;
        const charAvatarAssetId = char?.images[char.active_image_index]?.asset_id ?? null;
        ctx.handleSendMessage(resolved, msgType, charName, charAvatarAssetId, t.channel_id ?? undefined);
      }}
      onCopy={(ids) => {
        const items = ctx.scenarioTexts.filter(t => ids.includes(t.id));
        if (items.length === 0) return;
        if (items.length === 1) {
          const t = items[0];
          navigator.clipboard.writeText(JSON.stringify({
            kind: 'scenario_text',
            data: { title: t.title, content: t.content, speaker_character_id: t.speaker_character_id, speaker_name: t.speaker_name, channel_id: t.channel_id },
          }));
          ctx.showToast(`${t.title || 'テキストメモ'} をコピーしました`, 'success');
        } else {
          navigator.clipboard.writeText(JSON.stringify({
            kind: 'scenario_text',
            data: items.map(t => ({ title: t.title, content: t.content, speaker_character_id: t.speaker_character_id, speaker_name: t.speaker_name, channel_id: t.channel_id })),
          }));
          ctx.showToast(`${items.length}件のテキストメモをコピーしました`, 'success');
        }
      }}
      onDuplicate={canEdit ? (ids) => {
        const items = ctx.scenarioTexts.filter(t => ids.includes(t.id));
        items.forEach(t => {
          ctx.addScenarioText({
            title: generateDuplicateName(t.title, ctx.scenarioTexts.map(s => s.title)),
            content: t.content,
            speaker_character_id: t.speaker_character_id,
            speaker_name: t.speaker_name,
            channel_id: t.channel_id,
          });
        });
      } : () => {}}
      onPaste={canEdit ? async () => {
        try {
          const text = await navigator.clipboard.readText();
          const parsed = JSON.parse(text);
          if (parsed?.kind === 'scenario_text' && parsed.data) {
            await ctx.addScenarioText({
              title: parsed.data.title ? generateDuplicateName(parsed.data.title, ctx.scenarioTexts.map(s => s.title)) : '新規テキストメモ',
              content: parsed.data.content ?? '',
              speaker_character_id: parsed.data.speaker_character_id ?? null,
              speaker_name: parsed.data.speaker_name ?? null,
              channel_id: parsed.data.channel_id ?? null,
            });
            ctx.showToast('テキストメモを貼り付けました', 'success');
          }
        } catch {
          // クリップボードが対応フォーマットでない場合は何もしない
        }
      } : async () => {}}
      channels={ctx.channels}
    />
  );
}
