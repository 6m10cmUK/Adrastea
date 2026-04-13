import type { BgmTrack } from '../types/adrastea.types';
import { theme } from '../styles/theme';
import { AdSlider, AdCheckbox } from './ui';
import { X, Zap, Repeat } from 'lucide-react';
import { FadeInIcon } from './ui/FadeInIcon';

interface BgmEditorProps {
  track: BgmTrack;
  onUpdate: (id: string, data: Partial<BgmTrack>) => void;
  onClose: () => void;
}

export function BgmEditor({ track, onUpdate, onClose }: BgmEditorProps) {
  const isAutoPlay = track.auto_play;

  const handleAutoPlayToggle = (checked: boolean) => {
    onUpdate(track.id, { auto_play: checked });
  };

  return (
    <div style={{ background: theme.bgSurface, padding: '8px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: '8px', marginBottom: '8px', borderBottom: `1px solid ${theme.borderSubtle}`,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
            BGM設定
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: theme.textMuted, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Name (read-only) */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>名前</div>
          <div style={{ fontSize: '12px', color: theme.textPrimary }}>{track.name}</div>
        </div>

        {/* Auto play */}
        <div style={{ marginBottom: '12px' }}>
          <AdCheckbox
            label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={14} style={{ color: isAutoPlay ? theme.accent : theme.textMuted }} />シーン切替時に自動再生</span>}
            checked={isAutoPlay}
            onChange={handleAutoPlayToggle}
          />
        </div>

        {/* Loop */}
        <div style={{ marginBottom: '12px' }}>
          <AdCheckbox
            label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Repeat size={14} style={{ color: track.bgm_loop ? theme.accent : theme.textMuted }} />ループ再生</span>}
            checked={track.bgm_loop}
            onChange={(val) => onUpdate(track.id, { bgm_loop: val })}
          />
        </div>

        {/* Fade in */}
        <div style={{ marginBottom: '12px' }}>
          <AdCheckbox
            label={<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FadeInIcon size={16} color={track.fade_in ? theme.accent : theme.textMuted} />フェードイン</span>}
            checked={track.fade_in}
            onChange={(val) => onUpdate(track.id, { fade_in: val })}
          />
        </div>
        {track.fade_in && (
          <div style={{ marginBottom: '12px', paddingLeft: '20px' }}>
            <AdSlider
              label="時間"
              value={track.fade_in_duration}
              min={100} max={3000} step={100}
              onChange={(val) => onUpdate(track.id, { fade_in_duration: val })}
              suffix="ms"
            />
          </div>
        )}
    </div>
  );
}
