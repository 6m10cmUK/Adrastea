import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CharacterStatus } from '../../types/adrastea.types';

interface EditableStatusBarProps {
  charId: string;
  statusIndex: number;
  status: { label: string; value: number; max: number | null; color?: string };
  canEdit: boolean;
  patchCharacterStatus: (charId: string, statusIndex: number, recipe: (s: CharacterStatus) => CharacterStatus) => void;
}

export function EditableStatusBar({
  charId,
  statusIndex,
  status,
  canEdit,
  patchCharacterStatus,
}: EditableStatusBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging && localValue !== null && status.value === localValue) {
      setLocalValue(null);
    }
  }, [status.value, localValue, isDragging]);

  const displayValue = localValue !== null ? localValue : status.value;
  const hasMax = status.max != null && status.max > 0;
  /** バー塗りだけ 0〜最大に収める（実値は max 超・負もあり得る） */
  const barFillRatio = hasMax ? Math.max(0, Math.min(1, displayValue / status.max!)) : 0;
  const barColor = hasMax && barFillRatio <= 4 / 5 ? '#d9534f' : 'rgba(255,255,255,0.7)';

  const handleBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;

    setIsDragging(true);
    const barEl = e.currentTarget;
    const rect = barEl.getBoundingClientRect();

    const calcValue = (clientX: number) => {
      if (!hasMax) return displayValue;
      const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
      const r = (clampedX - rect.left) / rect.width;
      return Math.round(r * status.max!);
    };

    const onMouseMove = (moveE: MouseEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setLocalValue(calcValue(moveE.clientX));
      });
    };

    const onMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsDragging(false);
      setLocalValue((prev) => {
        if (prev !== null) {
          patchCharacterStatus(charId, statusIndex, (s) => ({ ...s, value: prev }));
        }
        return prev;
      });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const initVal = calcValue(e.clientX);
    setLocalValue(initVal);
  };

  return (
    <div
      style={{
        position: 'relative',
        height: 16,
        background: hasMax ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
        cursor: canEdit && hasMax ? 'ew-resize' : 'default',
      }}
      onMouseDown={hasMax ? handleBarMouseDown : undefined}
    >
      <div
        style={{
          height: '100%',
          width: hasMax ? `${barFillRatio * 100}%` : '100%',
          background: hasMax ? barColor : 'rgba(255,255,255,0.7)',
          transition: isDragging ? 'none' : 'width 0.2s ease',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 12,
          color: '#000',
          fontWeight: 700,
          pointerEvents: 'none',
          textShadow: '0 0 4px #fff, 0 0 4px #fff',
        }}
      >
        {status.label}
      </span>
      <span
        style={{
          position: 'absolute',
          right: canEdit ? 28 : 6,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 12,
          color: '#000',
          fontWeight: 600,
          pointerEvents: 'none',
          textShadow: '0 0 4px #fff, 0 0 4px #fff',
        }}
      >
        {hasMax ? `${displayValue}/${status.max}` : displayValue}
      </span>
      {canEdit && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'row',
            zIndex: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            style={{
              width: 13,
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="ステータスを増やす"
            onClick={(e) => {
              e.stopPropagation();
              patchCharacterStatus(charId, statusIndex, (s) => ({ ...s, value: s.value + 1 }));
            }}
          >
            <ChevronUp
              size={11}
              strokeWidth={3}
              style={{ filter: 'drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #fff)' }}
            />
          </button>
          <button
            type="button"
            style={{
              width: 13,
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="ステータスを減らす"
            onClick={(e) => {
              e.stopPropagation();
              patchCharacterStatus(charId, statusIndex, (s) => ({ ...s, value: s.value - 1 }));
            }}
          >
            <ChevronDown
              size={11}
              strokeWidth={3}
              style={{ filter: 'drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #fff)' }}
            />
          </button>
        </div>
      )}
    </div>
  );
}
