import { useState, useCallback, useEffect, useRef } from 'react';
import { MIN_SCALE, MAX_SCALE } from './Board';
import { theme } from '../styles/theme';
import { Maximize } from 'lucide-react';
import { Tooltip } from './ui';

/** 対数スライダー: スケール値 → スライダー位置 (0–1) */
function scaleToSlider(scale: number): number {
  return (Math.log(scale) - Math.log(MIN_SCALE)) / (Math.log(MAX_SCALE) - Math.log(MIN_SCALE));
}

/** 対数スライダー: スライダー位置 (0–1) → スケール値 */
function sliderToScale(t: number): number {
  return Math.exp(Math.log(MIN_SCALE) + t * (Math.log(MAX_SCALE) - Math.log(MIN_SCALE)));
}

interface ZoomBarProps {
  boardRef: React.RefObject<{ getScale: () => number; setScale: (s: number) => void; fitToScreen: () => void } | null>;
}

export function ZoomBar({ boardRef }: ZoomBarProps) {
  const [scale, setScale] = useState(1);
  const rafRef = useRef(0);

  useEffect(() => {
    const sync = () => {
      const s = boardRef.current?.getScale();
      if (s !== undefined) setScale(s);
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafRef.current);
  }, [boardRef]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    const newScale = sliderToScale(t);
    boardRef.current?.setScale(newScale);
    setScale(newScale);
  }, [boardRef]);

  const handleReset = useCallback(() => {
    boardRef.current?.setScale(1);
    setScale(1);
  }, [boardRef]);

  const pct = Math.round(scale * 100);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: '0.7rem', color: theme.textSecondary, userSelect: 'none',
        marginRight: 4,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min={0} max={1} step={0.001}
        value={scaleToSlider(scale)}
        onChange={handleSliderChange}
        style={{ width: 80, accentColor: theme.textPrimary, height: 12 }}
      />
      <Tooltip label="100%にリセット">
        <button
          onClick={handleReset}
          style={{
            background: 'transparent', border: `1px solid ${theme.border}`,
            color: theme.textSecondary, padding: '0 4px',
            fontSize: '0.65rem', cursor: 'pointer', minWidth: 36, textAlign: 'center',
            lineHeight: '16px',
          }}
        >
          {pct}%
        </button>
      </Tooltip>
      <Tooltip label="全体表示">
        <button
          onClick={() => boardRef.current?.fitToScreen()}
          style={{
            background: 'transparent', border: 'none',
            color: theme.textSecondary, cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: 0,
          }}
        >
          <Maximize size={12} />
        </button>
      </Tooltip>
    </div>
  );
}
