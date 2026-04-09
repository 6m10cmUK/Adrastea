import React, { useState } from 'react';
import type { Cutin } from '../types/adrastea.types';
import { AssetPicker } from './AssetPicker';
import { theme } from '../styles/theme';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { AdInput, AdButton, AdSection, AdSlider, AdColorPicker, AdToggleButtons } from './ui';

interface CutinEditorProps {
  cutin?: Cutin | null;
  roomId: string;
  onSave: (data: Partial<Cutin>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function CutinEditor({ cutin, roomId: _roomId, onSave, onDelete, onClose }: CutinEditorProps) {
  const ctx = useAdrasteaContext();
  const [name, setName] = useState(cutin?.name ?? '');
  const [imageAssetId, setImageAssetId] = useState(cutin?.image_asset_id ?? '');
  const [text, setText] = useState(cutin?.text ?? '');
  const [animation, setAnimation] = useState<Cutin['animation']>(cutin?.animation ?? 'slide');
  const [duration, setDuration] = useState(cutin?.duration ?? 3000);
  const [textColor, setTextColor] = useState(cutin?.text_color ?? '#ffffff');
  const [backgroundColor, setBackgroundColor] = useState(cutin?.background_color ?? 'rgba(0,0,0,0.8)');

  const handleSave = () => {
    onSave({
      name: name.trim() || '無題',
      image_asset_id: imageAssetId || null,
      text,
      animation,
      duration,
      text_color: textColor,
      background_color: backgroundColor,
    });
  };

  const panelStyle: React.CSSProperties = {
    background: theme.bgSurface,
    padding: '8px',
    color: theme.textPrimary,
    boxSizing: 'border-box',
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: '12px', fontWeight: 600, margin: '0 0 8px' }}>
        {cutin ? 'カットイン編集' : '新規カットイン'}
      </h3>

      <AdSection label="名前">
        <AdInput value={name} onChange={(e) => setName(e.target.value)} placeholder="カットイン名" />
      </AdSection>

      <AdSection>
        <AssetPicker
          label="演出画像"
          currentUrl={ctx.resolveAssetId(imageAssetId) || null}
          onSelect={(_url, assetId) => setImageAssetId(assetId || '')}
          autoTags={['カットイン']}
        />
      </AdSection>

      <AdSection label="テキスト">
        <AdInput value={text} onChange={(e) => setText(e.target.value)} placeholder="表示テキスト" />
      </AdSection>

      <AdSection label="アニメーション">
        <AdToggleButtons
          value={animation}
          onChange={(v) => setAnimation(v as Cutin['animation'])}
          options={[
            { value: 'slide', label: 'スライド' },
            { value: 'fade', label: 'フェード' },
            { value: 'zoom', label: 'ズーム' },
          ]}
        />
      </AdSection>

      <AdSection label="表示時間">
        <AdSlider
          min={1000}
          max={10000}
          step={500}
          value={duration}
          onChange={setDuration}
          displayValue={`${duration / 1000}秒`}
        />
      </AdSection>

      <AdSection label="テキスト色">
        <AdColorPicker value={textColor} onChange={setTextColor} />
      </AdSection>

      <AdSection label="背景色">
        <AdInput
          value={backgroundColor}
          onChange={(e) => setBackgroundColor(e.target.value)}
          placeholder="rgba(0,0,0,0.8)"
        />
      </AdSection>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {cutin && onDelete && (
          <AdButton variant="danger" onClick={() => { onDelete(); onClose(); }} style={{ marginRight: 'auto' }}>削除</AdButton>
        )}
        <AdButton variant="primary" onClick={handleSave}>保存</AdButton>
      </div>
    </div>
  );
}
