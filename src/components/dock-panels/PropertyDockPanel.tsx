import { useState, useRef, useEffect, useMemo } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import { CharacterEditor, type CharacterEditorHandle } from '../CharacterEditor';
import { ObjectEditor } from '../ObjectEditor';
import { CutinEditor } from '../CutinEditor';
import { BgmEditor } from '../BgmEditor';
import { ScenarioTextEditor } from '../ScenarioTextEditor';
import { ConfirmModal, Tooltip } from '../ui';
import { Trash2, Clipboard, CopyPlus, Send } from 'lucide-react';
import { objectToClipboardJson, bgmToClipboardJson } from '../../utils/clipboardImport';
import { generateDuplicateName } from '../../utils/nameUtils';
import { resolveTemplateVars } from '../utils/chatEditorUtils';
import { canClipboardCopyCharacters } from '../../config/permissions';
import type React from 'react';

const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' } as const;

function PropertyFooterActions({ onCopy, onDuplicate, copyDisabled, children }: {
  onCopy: () => void;
  onDuplicate: () => void;
  copyDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <Tooltip label="コピー">
        <button
          type="button"
          onClick={copyDisabled ? undefined : onCopy}
          disabled={copyDisabled}
          style={{
            ...iconBtn,
            color: theme.textSecondary,
            opacity: copyDisabled ? 0.35 : 1,
            cursor: copyDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <Clipboard size={16} />
        </button>
      </Tooltip>
      <Tooltip label="複製">
        <button onClick={onDuplicate} style={{ ...iconBtn, color: theme.textSecondary }}><CopyPlus size={16} /></button>
      </Tooltip>
      {children}
    </div>
  );
}

export function PropertyDockPanel() {
  const ctx = useAdrasteaContext();
  const { user } = useAuth();
  const [pendingDelete, setPendingDelete] = useState<{ msg: string; action: () => void } | null>(null);
  const charEditorRef = useRef<CharacterEditorHandle>(null);

  // シーン切替時: fg/bg 編集中なら新シーンの同タイプに差し替え、それ以外はクリア
  const effectiveEditingObjectId = useMemo(() => {
    if (!ctx.editingObjectId) return ctx.editingObjectId;
    if (ctx.activeObjects.find(o => o.id === ctx.editingObjectId)) return ctx.editingObjectId;
    // activeObjects に見つからない → シーンが切り替わった
    const oldObj = ctx.allObjects.find(o => o.id === ctx.editingObjectId);
    if (oldObj && (oldObj.type === 'foreground' || oldObj.type === 'background')) {
      // fg/bg は新シーンの同タイプに差し替え
      const newObj = ctx.activeObjects.find(o => o.type === oldObj.type);
      if (newObj) return newObj.id;
    }
    // シーンオブジェクト等 → クリア
    return undefined;
  }, [ctx.editingObjectId, ctx.activeObjects, ctx.allObjects]);

  useEffect(() => {
    if (effectiveEditingObjectId !== ctx.editingObjectId) {
      ctx.setEditingObjectId(effectiveEditingObjectId);
    }
  }, [effectiveEditingObjectId]);

  let content: React.ReactNode = null;
  let footer: React.ReactNode = null;
  let onDelete: (() => void) | undefined;

  // ObjectEditor
  if (!content && effectiveEditingObjectId !== undefined && ctx.roomId) {
    const obj = effectiveEditingObjectId ? ctx.activeObjects.find((o) => o.id === effectiveEditingObjectId) ?? null : null;
    const canDelete = effectiveEditingObjectId && obj && obj.type !== 'foreground' && obj.type !== 'background' && obj.type !== 'characters_layer';
    // fg/bg はシーン切替時に ID が変わるが type ベースのキーで remount を防止
    const editorKey = obj && (obj.type === 'foreground' || obj.type === 'background')
      ? `scene-${obj.type}` : (effectiveEditingObjectId ?? 'new-object');
    content = (
      <ObjectEditor
        key={editorKey}
        object={obj}
        roomId={ctx.roomId}
        onSave={async (data) => {
          if (effectiveEditingObjectId) {
            await ctx.updateObject(effectiveEditingObjectId, data);
          } else {
            await ctx.addObject(data);
          }
        }}
        onClose={() => ctx.setEditingObjectId(undefined)}
      />
    );
    if (canDelete) {
      onDelete = () => { ctx.removeObject(effectiveEditingObjectId!); ctx.setEditingObjectId(undefined); };
    }
    if (obj && canDelete) {
      footer = (
        <PropertyFooterActions
          onCopy={() => { navigator.clipboard.writeText(objectToClipboardJson(obj)); ctx.showToast(`${obj.name} をコピーしました`, 'success'); }}
          onDuplicate={async () => {
            const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = obj as any;
            await ctx.addObject({ ...rest, name: generateDuplicateName(obj.name, ctx.activeObjects.map(o => o.name)), sort_order: obj.sort_order + 1 });
          }}
        />
      );
    }
  }


  // CharacterEditor
  const liveEditingCharacter = ctx.editingCharacter?.id
    ? ctx.characters.find(c => c.id === ctx.editingCharacter!.id) ?? ctx.editingCharacter
    : ctx.editingCharacter;
  if (!content && ctx.editingCharacter !== undefined && ctx.roomId) {
    const canCopyCharClipboard =
      !!liveEditingCharacter &&
      canClipboardCopyCharacters(ctx.roomRole, [liveEditingCharacter], user?.uid ?? '');
    content = (
      <CharacterEditor
        ref={charEditorRef}
        key={liveEditingCharacter?.id ?? 'new-character'}
        character={liveEditingCharacter}
        roomId={ctx.roomId}
        currentUserId={user?.uid ?? ''}
        onDuplicate={(data) => ctx.addCharacter(data)}
        onClose={() => ctx.setEditingCharacter(undefined)}
      />
    );
    footer = liveEditingCharacter ? (
      <PropertyFooterActions
        copyDisabled={!canCopyCharClipboard}
        onCopy={() => charEditorRef.current?.copyToClipboard()}
        onDuplicate={() => charEditorRef.current?.duplicate()}
      />
    ) : null;
    if (ctx.editingCharacter) {
      onDelete = () => { ctx.removeCharacter(ctx.editingCharacter!.id); ctx.setEditingCharacter(undefined); };
    }
  }

  // CutinEditor
  if (!content && ctx.editingCutin !== undefined && ctx.roomId) {
    content = (
      <CutinEditor
        key={ctx.editingCutin?.id ?? 'new-cutin'}
        cutin={ctx.editingCutin}
        roomId={ctx.roomId}
        onSave={async (data) => {
          if (ctx.editingCutin) {
            await ctx.updateCutin(ctx.editingCutin.id, data);
          } else {
            await ctx.addCutin(data);
          }
        }}
        onClose={() => ctx.setEditingCutin(undefined)}
      />
    );
    if (ctx.editingCutin) {
      onDelete = () => { ctx.removeCutin(ctx.editingCutin!.id); ctx.setEditingCutin(undefined); };
    }
  }

  // BgmEditor
  if (!content && ctx.editingBgmId) {
    const track = ctx.bgms.find((b) => b.id === ctx.editingBgmId);
    if (track) {
      content = (
        <BgmEditor
          key={track.id}
          track={track}
          activeSceneId={ctx.activeScene?.id ?? null}
          onUpdate={ctx.updateBgm}
          onClose={() => ctx.setEditingBgmId(null)}
        />
      );
      onDelete = () => { ctx.removeBgm(track.id); ctx.setEditingBgmId(null); };
      footer = (
        <PropertyFooterActions
          onCopy={() => { navigator.clipboard.writeText(bgmToClipboardJson(track)); ctx.showToast(`${track.name} をコピーしました`, 'success'); }}
          onDuplicate={async () => {
            const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = track as any;
            await ctx.addBgm({ ...rest, name: `${track.name} (複製)` });
          }}
        />
      );
    }
  }

  // ScenarioTextEditor
  if (!content && ctx.editingScenarioTextId) {
    const scenarioText = ctx.scenarioTexts.find((t) => t.id === ctx.editingScenarioTextId);
    if (scenarioText) {
      content = (
        <ScenarioTextEditor
          key={scenarioText.id}
          text={scenarioText}
          onUpdate={ctx.updateScenarioText}
          onClose={() => ctx.setEditingScenarioTextId(null)}
        />
      );
      onDelete = () => {
        ctx.removeScenarioText(scenarioText.id);
        ctx.setEditingScenarioTextId(null);
      };
      footer = (
        <PropertyFooterActions
          onCopy={() => {
            navigator.clipboard.writeText(JSON.stringify({ kind: 'scenario_text', data: { title: scenarioText.title, content: scenarioText.content, speaker_character_id: scenarioText.speaker_character_id, speaker_name: scenarioText.speaker_name, channel_id: scenarioText.channel_id } }));
            ctx.showToast(`${scenarioText.title || 'テキストメモ'} をコピーしました`, 'success');
          }}
          onDuplicate={async () => {
            await ctx.addScenarioText({
              title: generateDuplicateName(scenarioText.title, ctx.scenarioTexts.map(s => s.title)),
              content: scenarioText.content,
              speaker_character_id: scenarioText.speaker_character_id,
              speaker_name: scenarioText.speaker_name,
              channel_id: scenarioText.channel_id,
            });
          }}
        >
          <Tooltip label="チャットに送信">
            <button
              aria-label="チャットに送信"
              onClick={() => {
                if (!scenarioText.content) return;
                const char = scenarioText.speaker_character_id ? ctx.characters.find(c => c.id === scenarioText.speaker_character_id) : null;
                const resolved = resolveTemplateVars(scenarioText.content, char ?? null);
                const charName = scenarioText.speaker_name || char?.name;
                const charAvatarAssetId = char ? (char.images[char.active_image_index]?.asset_id ?? null) : null;
                ctx.handleSendMessage(resolved, 'chat', charName, charAvatarAssetId, scenarioText.channel_id ?? undefined);
                ctx.showToast('チャットに送信しました', 'success');
              }}
              disabled={!scenarioText.content}
              style={{ ...iconBtn, color: scenarioText.content ? theme.accent : theme.textMuted }}
            >
              <Send size={16} />
            </button>
          </Tooltip>
        </PropertyFooterActions>
      );
    }
  }

  if (!content) return null;

  return (
    <div data-selection-panel style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {content}
      </div>
      {(footer || onDelete) && (
        <div style={{ padding: '8px', borderTop: `1px solid ${theme.borderSubtle}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {onDelete ? (
            <Tooltip label="削除">
              <button
                onClick={() => setPendingDelete({ msg: '削除しますか？', action: onDelete! })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger, padding: '4px', display: 'flex' }}
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          ) : <div />}
          {footer}
        </div>
      )}
      {pendingDelete && (
        <ConfirmModal
          message={pendingDelete.msg}
          confirmLabel="削除"
          danger
          onConfirm={() => { pendingDelete.action(); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
