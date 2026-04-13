import React from 'react';
import type { BoardObject, BoardObjectType } from '../types/adrastea.types';
import { AssetPicker } from './AssetPicker';
import { theme } from '../styles/theme';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { useEntityEditor } from '../hooks/useEntityEditor';
import { AdInput, AdTextArea, AdSection, AdCheckbox, AdColorPicker, AdToggleButtons, AdSlider, FadeInIcon, NumberDragInput } from './ui';
import { Droplets } from 'lucide-react';
import { GRID_SIZE } from './Board';


const FONT_OPTIONS = [
  { value: 'sans-serif', label: 'ゴシック体' },
  { value: 'serif', label: '明朝体' },
  { value: '"Noto Sans JP", sans-serif', label: 'Noto Sans JP' },
  { value: '"Noto Serif JP", serif', label: 'Noto Serif JP' },
  { value: 'monospace', label: '等幅' },
  { value: '"M PLUS Rounded 1c", sans-serif', label: 'M PLUS Rounded' },
  { value: '"Zen Maru Gothic", sans-serif', label: 'Zen 丸ゴシック' },
  { value: '"Kosugi Maru", sans-serif', label: '小杉丸ゴシック' },
  { value: 'cursive', label: '筆記体' },
  { value: 'fantasy', label: 'ファンタジー' },
];

interface ObjectEditorProps {
  object?: BoardObject | null;
  defaultType?: BoardObjectType;
  roomId: string;
  onSave: (data: Partial<BoardObject>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** ボード上のオブジェクト DOM 要素のスタイルを直接変更（React 経由なし） */
function setDomStyle(objId: string | undefined, prop: string, valueMas: number) {
  if (!objId) return;
  const el = document.querySelector(`[data-dom-obj-id="${objId}"]`) as HTMLElement | null;
  if (el) {
    el.style.setProperty(prop, `${valueMas * GRID_SIZE}px`);
    el.style.transition = 'none';
  }
}

function setDomRotation(objId: string | undefined, deg: number) {
  if (!objId) return;
  const el = document.querySelector(`[data-dom-obj-id="${objId}"]`) as HTMLElement | null;
  if (el) {
    el.style.transform = deg ? `rotate(${deg}deg)` : '';
    el.style.transition = 'none';
  }
}

export function ObjectEditor({ object, defaultType, roomId: _roomId, onSave: _onSave }: ObjectEditorProps) {
  const ctx = useAdrasteaContext();
  const isGlobal = object?.is_global ?? false;
  const isNew = object === null;

  const { state, set } = useEntityEditor({
    entity: object as Record<string, unknown> | null | undefined,
    entityId: object?.id ?? null,
    editType: 'object',
    fields: {
      // debounce: テキスト入力・数値入力（連続入力）
      name:               { debounce: true, defaultValue: '' },
      x:                  { debounce: true, defaultValue: 50 },
      y:                  { debounce: true, defaultValue: 50 },
      width:              { debounce: true, defaultValue: 4 },
      height:             { debounce: true, defaultValue: 4 },
      text_content:       { debounce: true, defaultValue: '' },
      font_size:          { debounce: true, defaultValue: 16 },
      font_family:        { debounce: true, defaultValue: 'sans-serif' },
      letter_spacing:     { debounce: true, defaultValue: 0 },
      line_height:        { debounce: true, defaultValue: 1.2 },
      text_color:         { debounce: true, defaultValue: '#ffffff' },
      scale_x:            { debounce: true, defaultValue: 1 },
      scale_y:            { debounce: true, defaultValue: 1 },
      memo:               { debounce: true, defaultValue: '' },
      opacity:            { debounce: true, defaultValue: 1 },
      rotation:           { debounce: true, defaultValue: 0 },

      // immediate: トグル・選択（1回の操作 = 1回の書き込み）
      type:               { defaultValue: defaultType ?? 'panel' },
      visible:            { immediate: true, defaultValue: true },
      position_locked:    { immediate: true, defaultValue: false },
      size_locked:        { immediate: true, defaultValue: false },
      image_asset_id:     { immediate: true, defaultValue: null },
      image_fit:          { immediate: true, defaultValue: 'contain' },
      background_color:   { immediate: true, defaultValue: '#1e1e2e' },
      color_enabled:      { immediate: true, defaultValue: false },
      auto_size:          { immediate: true, defaultValue: true },
      text_align:         { immediate: true, defaultValue: 'left' },
      text_vertical_align: { immediate: true, defaultValue: 'top' },
      is_global:          { defaultValue: false },
    },
    onDebounceSave: (key, data) => ctx.setPendingEdit(key, data as any),
    onImmediateUpdate: (id, data) => (ctx as any).updateObject(id, data),
    buildSaveData: (s: any) => {
      const type = s.type as string;
      const isForeground = type === 'foreground';
      const data: Record<string, unknown> = {
        type,
        name: isForeground ? '前景' : ((s.name as string)?.trim() ?? ''),
        visible: s.visible,
        opacity: s.opacity,
      };
      if (type === 'panel') {
        data.x = s.x;
        data.y = s.y;
        data.image_asset_id = s.image_asset_id || null;
        data.color_enabled = s.color_enabled ?? false;
        data.background_color = (s.background_color as string) || '#1e1e2e';
        data.width = s.width;
        data.height = s.height;
        data.image_fit = s.image_fit;
        data.position_locked = s.position_locked;
        data.size_locked = s.size_locked;
        data.rotation = s.rotation;
      } else if (type === 'text') {
        data.x = s.x;
        data.y = s.y;
        data.text_content = s.text_content;
        data.font_size = s.font_size;
        data.font_family = s.font_family;
        data.letter_spacing = s.letter_spacing;
        data.line_height = s.line_height;
        data.auto_size = s.auto_size;
        data.text_align = s.text_align;
        data.text_vertical_align = s.text_vertical_align;
        data.text_color = s.text_color;
        data.color_enabled = s.color_enabled ?? false;
        data.background_color = (s.background_color as string) || '#1e1e2e';
        data.width = s.width;
        data.height = s.height;
        data.position_locked = s.position_locked;
        data.size_locked = s.size_locked;
        data.scale_x = s.scale_x;
        data.scale_y = s.scale_y;
        data.rotation = s.rotation;
      } else if (type === 'foreground') {
        data.image_asset_id = s.image_asset_id || null;
        data.color_enabled = s.color_enabled ?? false;
        data.background_color = (s.background_color as string) || '#666666';
        data.image_fit = s.image_fit;
      } else if (type === 'background') {
        data.image_asset_id = s.image_asset_id || null;
        data.color_enabled = s.color_enabled ?? false;
        data.background_color = (s.background_color as string) || '#333333';
        data.opacity = s.opacity;
        data.visible = s.visible;
      }
      if (type !== 'background') {
        data.memo = ((s.memo as string) ?? '').slice(0, 2048);
      }
      return data;
    },
  });

  const bgEnabled = !!(state.color_enabled);
  const isBackground = (state.type as string) === 'background';
  const isForeground = (state.type as string) === 'foreground';

  // 前景のサイズ・位置は scenes テーブルに保存
  const fgSet = (field: 'x' | 'y' | 'width' | 'height', v: number) => {
    if (!ctx.activeScene) return;
    const key = `foreground_${field}` as const;
    ctx.updateScene(ctx.activeScene.id, { [key]: v });
  };

  if (object === undefined) return null;

  const panelStyle: React.CSSProperties = {
    background: theme.bgSurface,
    color: theme.textPrimary,
    padding: '8px',
    boxSizing: 'border-box',
  };

  const title = isNew
    ? '新規オブジェクト'
    : isBackground
      ? '背景'
      : isForeground
        ? '前景'
        : isGlobal
          ? 'ルームオブジェクト'
          : 'シーンオブジェクト';

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 8px' }}>{title}</h3>

      {/* タイプ選択（新規のみ） */}
      {isNew && (
        <AdSection label="タイプ">
          <AdToggleButtons
            value={state.type as BoardObjectType}
            onChange={(v) => set('type', v as BoardObjectType)}
            options={[
              { value: 'panel', label: 'パネル' },
              { value: 'text', label: 'テキスト' },
            ]}
          />
        </AdSection>
      )}

      {/* background: 画像・グリッドの編集 */}
      {isBackground && !isNew && (
        <>
          <AdSection>
            <AdToggleButtons
              value={(ctx.activeScene?.bg_color_enabled) ? 'color' : 'image'}
              options={[
                { value: 'image', label: '画像' },
                { value: 'color', label: '単色' },
              ]}
              onChange={(v) => {
                if (ctx.activeScene) {
                  ctx.updateScene(ctx.activeScene.id, { bg_color_enabled: v === 'color' });
                }
              }}
            />
          </AdSection>
          {ctx.activeScene?.bg_color_enabled ? (
            <AdSection label="背景色">
              <AdColorPicker value={ctx.activeScene?.bg_color ?? '#333333'} onChange={(c) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { bg_color: c }); }} enableAlpha />
            </AdSection>
          ) : (
            <AdSection title="背景画像">
              <AssetPicker
                currentUrl={ctx.resolveAssetId(ctx.activeScene?.background_asset_id) || null}
                onSelect={(_url, assetId) => {
                  if (ctx.activeScene) {
                    ctx.updateScene(ctx.activeScene.id, { background_asset_id: assetId ?? null });
                    if (assetId) ctx.updateScene(ctx.activeScene.id, { bg_color_enabled: false });
                  }
                }}
                autoTags={['背景']}
              />
            </AdSection>
          )}

          <div style={{ marginBottom: '12px' }}>
            <AdCheckbox
              label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Droplets size={14} style={{ color: ctx.activeScene?.bg_blur ? theme.accent : theme.textMuted }} />背景ぼかし</span>}
              checked={!!ctx.activeScene?.bg_blur}
              onChange={(v) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { bg_blur: v }); }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <AdCheckbox
              label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FadeInIcon size={16} color={ctx.activeScene?.bg_transition === 'fade' ? theme.accent : theme.textMuted} />背景フェードイン</span>}
              checked={ctx.activeScene?.bg_transition === 'fade'}
              onChange={(v) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { bg_transition: v ? 'fade' : 'none' }); }}
            />
          </div>
          {ctx.activeScene?.bg_transition === 'fade' && (
            <div style={{ marginBottom: '12px', paddingLeft: '20px' }}>
              <AdSlider
                label="時間"
                min={100} max={3000} step={100}
                value={ctx.activeScene?.bg_transition_duration ?? 500}
                onChange={(v) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { bg_transition_duration: v }); }}
                suffix="ms"
              />
            </div>
          )}
        </>
      )}

      {/* panel / text / foreground の編集フォーム */}
      {!isBackground && (
        <>
          {/* 名前（前景は固定） */}
          {!isForeground && (
            <AdSection label="名前">
              <AdInput value={(state.name as string) ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="オブジェクト名" />
            </AdSection>
          )}

          {/* panel: 画像 + 背景色 + サイズ */}
          {(state.type as string) === 'panel' && (
            <>
              <AdSection>
                <AssetPicker
                  label="画像"
                  currentUrl={ctx.resolveAssetId(state.image_asset_id as string) || null}
                  onSelect={(_url, assetId) => { set('image_asset_id', assetId ?? null); if (assetId) set('color_enabled', false); }}
                  autoTags={['オブジェクト']}
                />
              </AdSection>
              {(state.image_asset_id as string) && (
                <AdSection label="画像表示">
                  <AdToggleButtons
                    value={state.image_fit as string}
                    options={[
                      { value: 'contain', label: '全体表示' },
                      { value: 'cover', label: 'トリミング' },
                      { value: 'stretch', label: '引き伸ばし' },
                    ]}
                    onChange={(v) => set('image_fit', v)}
                  />
                </AdSection>
              )}
              <AdSection label="背景色">
                <AdCheckbox
                  checked={bgEnabled}
                  onChange={(v) => set('color_enabled', v)}
                  label="背景色を使用"
                />
                {bgEnabled && (
                  <div style={{ marginTop: '6px' }}>
                    <AdColorPicker value={state.background_color as string} onChange={(c) => set('background_color', c)} enableAlpha />
                  </div>
                )}
              </AdSection>
              <AdSection label="位置">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <NumberDragInput
                    label="x:"
                    value={state.x as number}
                    onChange={(v) => set('x', v)}
                    onDrag={(v) => { set('x', v, { localOnly: true }); setDomStyle(object?.id, 'left', v); }}
                    relativeRange={64}
                  />
                  <NumberDragInput
                    label="y:"
                    value={state.y as number}
                    onChange={(v) => set('y', v)}
                    onDrag={(v) => { set('y', v, { localOnly: true }); setDomStyle(object?.id, 'top', v); }}
                    relativeRange={64}
                  />
                </div>
              </AdSection>
              <AdSection label="サイズ">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <NumberDragInput
                    label="x:"
                    value={state.width as number}
                    onChange={(v) => set('width', v)}
                    onDrag={(v) => { set('width', v, { localOnly: true }); setDomStyle(object?.id, 'width', v); }}
                    min={0.01}
                    max={128}
                  />
                  <NumberDragInput
                    label="y:"
                    value={state.height as number}
                    onChange={(v) => set('height', v)}
                    onDrag={(v) => { set('height', v, { localOnly: true }); setDomStyle(object?.id, 'height', v); }}
                    min={0.01}
                    max={128}
                  />
                </div>
              </AdSection>
              <AdSection label="回転">
                <NumberDragInput
                  label="°"
                  value={state.rotation as number}
                  onChange={(v) => set('rotation', ((Math.round(v) % 360) + 360) % 360)}
                  onDrag={(v) => { const deg = ((Math.round(v) % 360) + 360) % 360; set('rotation', deg, { localOnly: true }); setDomRotation(object?.id, deg); }}
                  step={45}
                  shiftStep={0.5}
                  dragScale={2}
                />
              </AdSection>
              <AdSection label="ロック">
                <AdCheckbox checked={state.position_locked as boolean} onChange={(v) => set('position_locked', v)} label="位置を固定" />
                <AdCheckbox checked={state.size_locked as boolean} onChange={(v) => set('size_locked', v)} label="サイズを固定" />
              </AdSection>
            </>
          )}

          {/* text: テキスト内容 + フォント + 色 + 背景色 + サイズ */}
          {(state.type as string) === 'text' && (
            <>
              <AdSection label="テキスト内容">
                <AdTextArea
                  expandable
                  value={(state.text_content as string) ?? ''}
                  onChange={(e) => set('text_content', e.target.value)}
                  placeholder="表示するテキスト"
                  rows={3}
                />
              </AdSection>
              <AdSection label="フォント">
                <select
                  value={state.font_family as string}
                  onChange={(e) => set('font_family', e.target.value)}
                  style={{
                    width: '100%',
                    height: '24px',
                    padding: '2px 6px',
                    fontSize: '12px',
                    background: theme.bgInput,
                    border: `1px solid ${theme.borderInput}`,
                    borderRadius: 0,
                    color: theme.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: state.font_family as string,
                  }}
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </AdSection>
              <AdSection label="フォントサイズ">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AdInput
                    key={`font-size-${state.font_size as number}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(state.font_size as number)}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw || raw === '-') return;
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      set('font_size', Math.max(1, n));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    fullWidth={false}
                    inputWidth="64px"
                  />
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>px</span>
                </div>
              </AdSection>
              <AdSection label="間隔">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>文字:</span>
                  <AdInput
                    key={`letter-spacing-${state.letter_spacing as number}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(state.letter_spacing as number)}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw || raw === '-') return;
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) {
                        set('letter_spacing', parsed);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    fullWidth={false}
                    inputWidth="52px"
                  />
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>px</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>行:</span>
                  <AdInput
                    key={`line-height-${state.line_height as number}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(state.line_height as number)}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw || raw === '-') return;
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) {
                        set('line_height', Math.max(0.5, parsed));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    fullWidth={false}
                    inputWidth="52px"
                    step="0.1"
                  />
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>倍</span>
                </div>
              </AdSection>
              <AdSection label="比率">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>水平:</span>
                  <AdInput
                    key={`scale-x-${state.scale_x as number}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(state.scale_x as number)}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw || raw === '-') return;
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) {
                        set('scale_x', Math.max(0.01, parsed));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    fullWidth={false}
                    inputWidth="52px"
                    step="0.1"
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>垂直:</span>
                  <AdInput
                    key={`scale-y-${state.scale_y as number}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(state.scale_y as number)}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw || raw === '-') return;
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed)) {
                        set('scale_y', Math.max(0.01, parsed));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    fullWidth={false}
                    inputWidth="52px"
                    step="0.1"
                  />
                </div>
              </AdSection>
              <AdSection label="配置">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>x:</span>
                  <AdToggleButtons
                    value={state.text_align as string}
                    onChange={(v) => set('text_align', v)}
                    options={[
                      { value: 'left', label: '左' },
                      { value: 'center', label: '中央' },
                      { value: 'right', label: '右' },
                    ]}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>y:</span>
                  <AdToggleButtons
                    value={state.text_vertical_align as string}
                    onChange={(v) => set('text_vertical_align', v)}
                    options={[
                      { value: 'top', label: '上' },
                      { value: 'middle', label: '中央' },
                      { value: 'bottom', label: '下' },
                    ]}
                  />
                </div>
              </AdSection>
              <AdSection label="テキスト色">
                <AdColorPicker value={state.text_color as string} onChange={(c) => set('text_color', c)} enableAlpha />
              </AdSection>
              <AdSection label="背景色">
                <AdCheckbox
                  checked={bgEnabled}
                  onChange={(v) => set('color_enabled', v)}
                  label="背景色を使用"
                />
                {bgEnabled && (
                  <div style={{ marginTop: '6px' }}>
                    <AdColorPicker value={state.background_color as string} onChange={(c) => set('background_color', c)} enableAlpha />
                  </div>
                )}
              </AdSection>
              <AdSection label="位置">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <NumberDragInput
                    label="x:"
                    value={state.x as number}
                    onChange={(v) => set('x', v)}
                    onDrag={(v) => { set('x', v, { localOnly: true }); setDomStyle(object?.id, 'left', v); }}
                    relativeRange={64}
                  />
                  <NumberDragInput
                    label="y:"
                    value={state.y as number}
                    onChange={(v) => set('y', v)}
                    onDrag={(v) => { set('y', v, { localOnly: true }); setDomStyle(object?.id, 'top', v); }}
                    relativeRange={64}
                  />
                </div>
              </AdSection>
              <AdSection label="サイズ">
                <AdCheckbox
                  checked={!(state.auto_size as boolean)}
                  onChange={(v) => set('auto_size', !v)}
                  label="サイズを指定"
                />
                {!(state.auto_size as boolean) && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                    <NumberDragInput
                      label="x:"
                      value={state.width as number}
                      onChange={(v) => set('width', v)}
                      onDrag={(v) => { set('width', v, { localOnly: true }); setDomStyle(object?.id, 'width', v); }}
                      min={1}
                      max={128}
                    />
                    <NumberDragInput
                      label="y:"
                      value={state.height as number}
                      onChange={(v) => set('height', v)}
                      onDrag={(v) => { set('height', v, { localOnly: true }); setDomStyle(object?.id, 'height', v); }}
                      min={1}
                      max={128}
                    />
                  </div>
                )}
              </AdSection>
              <AdSection label="回転">
                <NumberDragInput
                  label="°"
                  value={state.rotation as number}
                  onChange={(v) => set('rotation', ((Math.round(v) % 360) + 360) % 360)}
                  onDrag={(v) => { const deg = ((Math.round(v) % 360) + 360) % 360; set('rotation', deg, { localOnly: true }); setDomRotation(object?.id, deg); }}
                  step={45}
                  shiftStep={0.5}
                  dragScale={2}
                />
              </AdSection>
              <AdSection label="ロック">
                <AdCheckbox checked={state.position_locked as boolean} onChange={(v) => set('position_locked', v)} label="位置を固定" />
                <AdCheckbox checked={state.size_locked as boolean} onChange={(v) => set('size_locked', v)} label="サイズを固定" />
              </AdSection>
            </>
          )}

          {/* foreground: 画像 + フェードイン */}
          {(state.type as string) === 'foreground' && (
            <>
              <AdSection>
                <AdToggleButtons
                  value={(ctx.activeScene?.fg_color_enabled) ? 'color' : 'image'}
                  options={[
                    { value: 'image', label: '画像' },
                    { value: 'color', label: '単色' },
                  ]}
                  onChange={(v) => {
                    if (ctx.activeScene) {
                      ctx.updateScene(ctx.activeScene.id, { fg_color_enabled: v === 'color' });
                    }
                  }}
                />
              </AdSection>
              {ctx.activeScene?.fg_color_enabled ? (
                <AdSection label="前景色">
                  <AdColorPicker value={ctx.activeScene?.fg_color ?? '#666666'} onChange={(c) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { fg_color: c }); }} enableAlpha />
                </AdSection>
              ) : (
                <>
                  <AdSection>
                    <AssetPicker
                      label="前景画像"
                      currentUrl={ctx.resolveAssetId(ctx.activeScene?.foreground_asset_id) || null}
                      onSelect={(_url, assetId) => {
                        if (ctx.activeScene) {
                          ctx.updateScene(ctx.activeScene.id, { foreground_asset_id: assetId ?? null });
                          if (assetId) ctx.updateScene(ctx.activeScene.id, { fg_color_enabled: false });
                        }
                      }}
                      autoTags={['前景']}
                    />
                  </AdSection>
                  {ctx.activeScene?.foreground_asset_id && (
                    <AdSection label="画像表示">
                      <AdToggleButtons
                        value={state.image_fit as string}
                        options={[
                          { value: 'contain', label: '全体表示' },
                          { value: 'cover', label: 'トリミング' },
                          { value: 'stretch', label: '引き伸ばし' },
                        ]}
                        onChange={(v) => set('image_fit', v)}
                      />
                    </AdSection>
                  )}
                </>
              )}

              <AdSection label="サイズ（マス数）">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <NumberDragInput
                    label="x:"
                    value={ctx.activeScene?.foreground_width ?? 48}
                    onChange={(v) => fgSet('width', v)}
                    onDrag={(v) => { fgSet('width', v); setDomStyle(object?.id, 'width', v); }}
                    min={0.01}
                    max={128}
                  />
                  <NumberDragInput
                    label="y:"
                    value={ctx.activeScene?.foreground_height ?? 27}
                    onChange={(v) => fgSet('height', v)}
                    onDrag={(v) => { fgSet('height', v); setDomStyle(object?.id, 'height', v); }}
                    min={0.01}
                    max={128}
                  />
                </div>
              </AdSection>

              <div style={{ marginBottom: '12px' }}>
                <AdCheckbox
                  label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FadeInIcon size={16} color={ctx.activeScene?.fg_transition === 'fade' ? theme.accent : theme.textMuted} />前景フェードイン</span>}
                  checked={ctx.activeScene?.fg_transition === 'fade'}
                  onChange={(v) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { fg_transition: v ? 'fade' : 'none' }); }}
                />
              </div>
              {ctx.activeScene?.fg_transition === 'fade' && (
                <div style={{ marginBottom: '12px', paddingLeft: '20px' }}>
                  <AdSlider
                    label="時間"
                    min={100} max={3000} step={100}
                    value={ctx.activeScene?.fg_transition_duration ?? 500}
                    onChange={(v) => { if (ctx.activeScene) ctx.updateScene(ctx.activeScene.id, { fg_transition_duration: v }); }}
                    suffix="ms"
                  />
                </div>
              )}
            </>
          )}

          {!isBackground && !isForeground && (
            <AdSection label="メモ">
              <AdTextArea
                expandable
                value={(state.memo as string) ?? ''}
                onChange={(e) => set('memo', e.target.value.slice(0, 2048))}
                placeholder="ホバー時に表示されるメモ（最大2048文字）"
                rows={4}
              />
              <div style={{ textAlign: 'right', fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
                {(((state.memo as string) ?? '').length)} / 2048
              </div>
            </AdSection>
          )}

        </>
      )}
    </div>
  );
}
