import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Character, CharacterImage, CharacterStatus, CharacterParameter } from '../types/adrastea.types';
import { AssetPicker } from './AssetPicker';
import { theme } from '../styles/theme';
import { AdInput, AdTextArea, AdColorPicker, NumberDragInput } from './ui';
import { Trash2, Plus } from 'lucide-react';
import { GRID_SIZE } from './Board';
import { characterToClipboardJson } from '../utils/clipboardImport';
import { generateDuplicateName } from '../utils/nameUtils';
import { useEntityEditor } from '../hooks/useEntityEditor';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { canClipboardCopyCharacters } from '../config/permissions';

interface CharacterEditorProps {
  character?: Character | null;
  roomId: string;
  currentUserId: string;
  onDuplicate?: (data: Partial<Character>) => void;
  onClose: () => void;
  initialSection?: string;
}

export interface CharacterEditorHandle {
  save: () => void;
  isDirty: boolean;
  copyToClipboard: () => void;
  duplicate: () => void;
}

function CharacterEditorComponent({
  character,
  roomId: _roomId,
  currentUserId: _currentUserId,
  onDuplicate,
  onClose: _onClose,
  initialSection,
}: CharacterEditorProps, ref: React.Ref<CharacterEditorHandle>) {
  const ctx = useAdrasteaContext();

  // useEntityEditor の初期化
  const isNew = !character;

  const { state, set, setMany, isDirty, flush } = useEntityEditor({
    entity: character as Record<string, unknown> | null | undefined,
    entityId: character?.id ?? null,
    editType: 'character',
    fields: {
      name: { debounce: true, defaultValue: '' },
      color: { debounce: true, defaultValue: '#555555' },
      sheet_url: { debounce: true, defaultValue: '' },
      initiative: { debounce: true, defaultValue: 0 },
      size: { debounce: true, defaultValue: 5 },
      board_x: { debounce: true, defaultValue: 0 },
      board_y: { debounce: true, defaultValue: 0 },
      memo: { debounce: true, defaultValue: '' },
      secret_memo: { debounce: true, defaultValue: '' },
      chat_palette: { debounce: true, defaultValue: '' },
      is_status_private: { debounce: true, defaultValue: false },
      is_hidden_on_board: { debounce: true, defaultValue: false },
      statuses: { debounce: true, defaultValue: [] },
      parameters: { debounce: true, defaultValue: [] },
      images: isNew ? { debounce: true, defaultValue: [] } : { immediate: true, defaultValue: [] },
      active_image_index: isNew ? { debounce: true, defaultValue: 0 } : { immediate: true, defaultValue: 0 },
    },
    onDebounceSave: async (_key, data) => {
      if (data.id) {
        await ctx.updateCharacter(data.id, data.data as Partial<Character>);
      } else {
        const newChar = await ctx.addCharacter(data.data as Partial<Character>);
        ctx.setEditingCharacter(newChar);
      }
    },
    onImmediateUpdate: async (id, data) => {
      await ctx.updateCharacter(id, data as Partial<Character>);
    },
    buildSaveData: (s: any) => ({
      name: (s.name as string)?.trim() || '無名',
      color: s.color,
      sheet_url: (s.sheet_url as string)?.trim() || null,
      images: s.images,
      active_image_index: Math.min(s.active_image_index as number, Math.max(0, (s.images as any[]).length - 1)),
      initiative: s.initiative,
      size: s.size,
      board_x: s.board_x,
      board_y: s.board_y,
      statuses: s.statuses,
      parameters: s.parameters,
      memo: s.memo,
      secret_memo: s.secret_memo,
      chat_palette: s.chat_palette,
      is_status_private: s.is_status_private,
      is_hidden_on_board: s.is_hidden_on_board,
    }),
  });

  // チャットパレットセクション用ref
  const chatPaletteRef = useRef<HTMLDivElement>(null);

  // 初期セクションにスクロール
  useEffect(() => {
    if (initialSection === 'chat_palette' && chatPaletteRef.current) {
      chatPaletteRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [initialSection]);

  // ─── 立ち絵管理 ───
  const images = state.images as CharacterImage[];
  const activeImageIndex = state.active_image_index as number;

  const addImage = () => {
    setMany({ images: [...images, { url: '', label: '' }] } as any);
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    const updates: any = { images: updated };
    if (activeImageIndex === index) {
      updates.active_image_index = Math.max(0, updated.length - 1);
    }
    setMany(updates);
  };

  const updateImage = (index: number, field: keyof CharacterImage, value: string) => {
    setMany({ images: images.map((img, i) => i === index ? { ...img, [field]: value } : img) } as any);
  };

  // ─── ステータス管理 ───
  const statuses = state.statuses as CharacterStatus[];

  const addStatus = () => {
    setMany({ statuses: [...statuses, { label: '', value: 0, max: null }] } as any);
  };

  const removeStatus = (index: number) => {
    setMany({ statuses: statuses.filter((_, i) => i !== index) } as any);
  };

  const updateStatus = (index: number, field: 'label' | 'value' | 'max', value: string | number) => {
    setMany({ statuses: statuses.map((s, i) => (i === index ? { ...s, [field]: field === 'label' ? value : Number(value) } : s)) } as any);
  };

  // ─── パラメータ管理 ───
  const parameters = state.parameters as CharacterParameter[];

  const addParameter = () => {
    setMany({ parameters: [...parameters, { label: '', value: 0 }] } as any);
  };

  const removeParameter = (index: number) => {
    setMany({ parameters: parameters.filter((_, i) => i !== index) } as any);
  };

  const updateParameter = (index: number, field: keyof CharacterParameter, value: string | number) => {
    setMany({ parameters: parameters.map((p, i) => i === index ? { ...p, [field]: value } : p) } as any);
  };

  // ─── クリップボード &複製 ───
  const copyToClipboard = () => {
    if (!character) return;
    if (!canClipboardCopyCharacters(ctx.roomRole, [character], _currentUserId)) {
      ctx.showToast('自分のキャラクターのみコピーできます', 'error');
      return;
    }
    const data = {
      ...character,
      name: (state.name as string)?.trim() || '無名',
      color: state.color as string,
      sheet_url: (state.sheet_url as string)?.trim() || null,
      images: state.images as CharacterImage[],
      active_image_index: state.active_image_index as number,
      initiative: state.initiative as number,
      size: state.size as number,
      board_x: state.board_x as number,
      board_y: state.board_y as number,
      statuses: state.statuses as CharacterStatus[],
      parameters: state.parameters as CharacterParameter[],
      memo: state.memo as string,
      secret_memo: state.secret_memo as string,
      chat_palette: state.chat_palette as string,
      is_status_private: state.is_status_private as boolean,
      is_hidden_on_board: state.is_hidden_on_board as boolean,
    } as Character;
    navigator.clipboard.writeText(characterToClipboardJson(data));
  };

  useImperativeHandle(ref, () => ({
    save: flush,
    get isDirty() { return isDirty; },
    copyToClipboard,
    duplicate: handleDuplicate,
  }));

  // ─── 複製 ───
  const handleDuplicate = () => {
    if (!onDuplicate) return;
    onDuplicate({
      name: generateDuplicateName(state.name as string, ctx.characters?.map(c => c.name) ?? []),
      color: state.color as string,
      sheet_url: (state.sheet_url as string) || null,
      images: state.images as CharacterImage[],
      active_image_index: state.active_image_index as number,
      initiative: state.initiative as number,
      size: state.size as number,
      board_x: state.board_x as number,
      board_y: state.board_y as number,
      statuses: state.statuses as CharacterStatus[],
      parameters: state.parameters as CharacterParameter[],
      memo: state.memo as string,
      secret_memo: state.secret_memo as string,
      chat_palette: state.chat_palette as string,
      is_status_private: state.is_status_private as boolean,
      is_hidden_on_board: state.is_hidden_on_board as boolean,
    });
  };

  const panelStyle: React.CSSProperties = {
    background: theme.bgSurface,
    padding: '8px',
    // flex親(AdModal)では flex:1 が機能、非flex親(dockview)では height が機能
    height: '100%',
    flex: 1,
    minHeight: 0,
    color: theme.textPrimary,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${theme.borderSubtle}`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.textSecondary,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    marginBottom: '4px',
    alignItems: 'center',
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    background: active ? theme.accent : theme.bgInput,
    color: active ? theme.textOnAccent : theme.textPrimary,
    border: `1px solid ${active ? theme.accent : theme.borderInput}`,
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '11px',
    transition: 'all 0.2s',
  });

  return (
    <div style={panelStyle}>
      {/* タイトル */}
      <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700 }}>
        {character ? 'キャラクター編集' : '新規キャラクター'}
      </h3>

      {/* スクロール可能エリア */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* 1. 基本情報 */}
        <div style={sectionStyle}>
          <div style={labelStyle}>基本情報</div>

          <div style={{ ...rowStyle, marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <AdInput
                label="名前"
                value={state.name as string}
                onChange={(e) => set('name', e.target.value)}
                placeholder="キャラクター名"
              />
            </div>
          </div>

          <div style={{ ...rowStyle, marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <AdColorPicker
                label="テーマカラー"
                value={state.color as string}
                onChange={(value) => set('color', value)}
              />
            </div>
          </div>

          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <AdInput
                label="外部URL"
                value={(state.sheet_url as string) ?? ''}
                onChange={(e) => set('sheet_url', e.target.value)}
                placeholder="キャラクターシートURL等"
              />
            </div>
          </div>
        </div>

        {/* 2. 立ち絵・差分 */}
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            立ち絵・差分
            <button onClick={addImage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, padding: '2px', display: 'flex' }}>
              <Plus size={14} />
            </button>
          </div>
          {images.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '8px' }}>
              立ち絵が登録されていません
            </div>
          ) : (
            images.map((img, i) => (
              <div key={i} style={{ ...rowStyle, marginBottom: '8px', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="active_image"
                    checked={activeImageIndex === i}
                    onChange={() => set('active_image_index', i)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <AssetPicker
                      currentUrl={ctx.resolveAssetId(img.asset_id) || null}
                      onSelect={(_url, assetId) => updateImage(i, 'asset_id', assetId || '')}
                      autoTags={['キャラクター']}
                    />
                  </div>
                  <button onClick={() => removeImage(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', display: 'flex', flexShrink: 0 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ width: '100%', marginTop: '4px' }}>
                  <AdInput
                    value={img.label}
                    onChange={(e) => updateImage(i, 'label', e.target.value)}
                    placeholder="画像ラベル（例：通常、怒り）"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3. 盤面設定 */}
        <div style={sectionStyle}>
          <div style={labelStyle}>盤面設定</div>

          <div style={{ marginBottom: '8px' }}>
            <AdInput
              key={`initiative-${state.initiative as number}`}
              type="text"
              inputMode="decimal"
              label="イニシアティブ"
              defaultValue={String(state.initiative as number)}
              min={-99}
              max={99}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (!raw || raw === '-') return;
                const val = Number(raw);
                if (!Number.isFinite(val)) return;
                const rounded = Math.round(val * 10) / 10;
                const clamped = Math.max(-99, Math.min(99, rounded));
                set('initiative', clamped);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
          </div>

          <div style={{ ...rowStyle, gap: '8px' }}>
            <NumberDragInput
              label="X"
              value={state.board_x as number}
              onChange={(v) => set('board_x', v)}
              onDrag={(v) => {
                set('board_x', v, { localOnly: true });
                if (!character?.id) return;
                const el = document.querySelector(`[data-dom-char-id="${character.id}"]`) as HTMLElement | null;
                if (el) { el.style.left = `${v * GRID_SIZE}px`; el.style.transition = 'none'; }
              }}
              relativeRange={64}
            />
            <NumberDragInput
              label="Y"
              value={state.board_y as number}
              onChange={(v) => set('board_y', v)}
              onDrag={(v) => {
                set('board_y', v, { localOnly: true });
                if (!character?.id) return;
                const el = document.querySelector(`[data-dom-char-id="${character.id}"]`) as HTMLElement | null;
                if (el) { el.style.top = `${(v - (state.size as number ?? 5)) * GRID_SIZE}px`; el.style.transition = 'none'; }
              }}
              relativeRange={64}
            />
            <NumberDragInput
              label="駒サイズ"
              value={state.size as number}
              min={1}
              max={128}
              onChange={(v) => set('size', v)}
              onDrag={(v) => {
                set('size', v, { localOnly: true });
                if (!character?.id) return;
                const el = document.querySelector(`[data-dom-char-id="${character.id}"]`) as HTMLElement | null;
                if (el) {
                  const boardY = (state.board_y as number) ?? 0;
                  el.style.height = `${v * GRID_SIZE}px`;
                  el.style.top = `${(boardY - v) * GRID_SIZE}px`;
                  el.style.transition = 'none';
                }
              }}
            />
          </div>
        </div>

        {/* 4. ステータス */}
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            ステータス
            <button onClick={addStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, padding: '2px', display: 'flex' }}>
              <Plus size={14} />
            </button>
          </div>
          {statuses.map((s, i) => (
            <div key={i} style={{ ...rowStyle, marginBottom: '6px' }}>
              <AdInput
                value={s.label}
                onChange={(e) => updateStatus(i, 'label', e.target.value)}
                placeholder="HP"
                style={{ flex: 0, minWidth: '60px' }}
              />
              <AdInput
                key={`status-value-${i}-${s.value}`}
                type="text"
                inputMode="decimal"
                defaultValue={String(s.value)}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw || raw === '-') return;
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed)) {
                    updateStatus(i, 'value', parsed);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                style={{ flex: 0, minWidth: '50px' }}
              />
              <span style={{ color: theme.textMuted, fontSize: '12px' }}>/</span>
              <AdInput
                key={`status-max-${i}-${s.max}`}
                type="text"
                inputMode="decimal"
                placeholder="—"
                defaultValue={s.max != null ? String(s.max) : ''}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '') {
                    updateStatus(i, 'max', null as any);
                    return;
                  }
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed)) {
                    updateStatus(i, 'max', parsed);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                style={{ flex: 0, minWidth: '50px' }}
              />
              <button onClick={() => removeStatus(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', display: 'flex', flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* 5. パラメータ */}
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            パラメータ
            <button onClick={addParameter} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, padding: '2px', display: 'flex' }}>
              <Plus size={14} />
            </button>
          </div>
          {parameters.map((p, i) => (
            <div key={i} style={{ ...rowStyle, marginBottom: '6px' }}>
              <AdInput
                value={p.label}
                onChange={(e) => updateParameter(i, 'label', e.target.value)}
                placeholder="能力名"
                style={{ flex: 0, minWidth: '70px' }}
              />
              <AdInput
                value={String(p.value)}
                onChange={(e) => updateParameter(i, 'value', e.target.value)}
                placeholder="値"
                style={{ flex: 1 }}
              />
              <button onClick={() => removeParameter(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px', display: 'flex', flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* 6. メモ */}
        <div style={sectionStyle}>
          <div style={labelStyle}>メモ</div>
          <AdTextArea
            expandable
            value={state.memo as string}
            onChange={(e) => set('memo', e.target.value)}
            placeholder="キャラクターメモ（最大1024文字）"
            style={{ minHeight: '80px' }}
            maxLength={1024}
          />
        </div>

        {/* 7. シークレットメモ */}
        <div style={sectionStyle}>
          <div style={labelStyle}>シークレットメモ</div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            自分だけが見えます
          </div>
          <AdTextArea
            expandable
            value={state.secret_memo as string}
            onChange={(e) => set('secret_memo', e.target.value)}
            placeholder="秘密のメモ（最大1024文字）"
            style={{ minHeight: '80px' }}
            maxLength={1024}
          />
        </div>

        {/* 8. チャットパレット */}
        <div style={sectionStyle} ref={chatPaletteRef}>
          <div style={labelStyle}>チャットパレット</div>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            改行区切りでコマンドや定型文を登録
          </div>
          <AdTextArea
            expandable
            value={state.chat_palette as string}
            onChange={(e) => set('chat_palette', e.target.value)}
            placeholder="通常攻撃&#10;魔法&#10;防御&#10;（最大4096文字）"
            style={{ minHeight: '80px' }}
            maxLength={4096}
          />
        </div>

        {/* 9. 設定 */}
        <div style={sectionStyle}>
          <div style={labelStyle}>設定</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={() => set('is_status_private', !(state.is_status_private as boolean))}
              style={toggleStyle(state.is_status_private as boolean)}
            >
              {(state.is_status_private as boolean) ? '✓' : '○'} ステータスを非公開にする
            </button>
            <button
              onClick={() => set('is_hidden_on_board', !(state.is_hidden_on_board as boolean))}
              style={toggleStyle(state.is_hidden_on_board as boolean)}
            >
              {(state.is_hidden_on_board as boolean) ? '✓' : '○'} 盤面一覧に表示しない
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const CharacterEditor = forwardRef(CharacterEditorComponent);
