import { useState, useRef, useCallback, useEffect } from 'react';
import { theme } from '../../styles/theme';

interface NumberDragInputProps {
  value: number;
  /** 確定時に呼ばれる（テキスト入力確定、ドラッグ終了時） */
  onChange: (value: number) => void;
  /** ドラッグ中に毎フレーム呼ばれる（省略時は onChange が使われる） */
  onDrag?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** ドラッグ範囲を現在値からの相対値で制限（例: 50 → 現在値 ±50） */
  relativeRange?: number;
  label?: string;
  width?: string;
}

export function NumberDragInput({
  value,
  onChange,
  onDrag,
  min,
  max,
  step = 1,
  relativeRange,
  label,
  width = '52px',
}: NumberDragInputProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; startValue: number } | null>(null);
  const movedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  const clamp = useCallback(
    (v: number) => {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    },
    [min, max]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editing) return;
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, startValue: value };
      movedRef.current = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = moveEvent.clientX - dragStartRef.current.x;
        if (Math.abs(dx) > 2) movedRef.current = true;
        if (movedRef.current) {
          const fine = moveEvent.shiftKey;
          const effectiveStep = fine ? step * 0.01 : step;
          let newValue = fine
            ? Math.round((dragStartRef.current.startValue + dx * effectiveStep) * 100) / 100
            : Math.round(dragStartRef.current.startValue + dx * effectiveStep);
          if (relativeRange !== undefined) {
            const lo = dragStartRef.current.startValue - relativeRange;
            const hi = dragStartRef.current.startValue + relativeRange;
            newValue = Math.max(lo, Math.min(hi, newValue));
          }
          pendingValueRef.current = clamp(newValue);
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              if (pendingValueRef.current !== null) {
                // ドラッグ中: onDrag（ローカルのみ）、なければ onChange
                (onDragRef.current ?? onChangeRef.current)(pendingValueRef.current);
              }
            });
          }
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // rAF 保留があればキャンセル
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (movedRef.current) {
          // ドラッグ終了: onChange で確定（通信トリガー）
          const finalValue = pendingValueRef.current ?? value;
          onChangeRef.current(finalValue);
          pendingValueRef.current = null;
        }
        if (!movedRef.current) {
          setEditing(true);
          setEditText(String(value));
          requestAnimationFrame(() => inputRef.current?.select());
        }
        dragStartRef.current = null;
      };

      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [editing, value, onChange, clamp, step]
  );

  const handleEditConfirm = useCallback(() => {
    const parsed = Number(editText);
    if (!isNaN(parsed)) {
      onChange(clamp(Math.round(parsed)));
    }
    setEditing(false);
  }, [editText, onChange, clamp]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditConfirm();
      } else if (e.key === 'Escape') {
        setEditing(false);
      }
    },
    [handleEditConfirm]
  );

  // editing に入ったら focus
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  };

  const inputStyle: React.CSSProperties = {
    width,
    padding: '3px 6px',
    fontSize: '11px',
    background: theme.bgInput,
    border: `1px solid ${theme.borderInput}`,
    borderRadius: 0,
    color: theme.textPrimary,
    outline: 'none',
    textAlign: 'right',
    cursor: editing ? 'text' : 'ew-resize',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle}>
      {label && (
        <span style={{ fontSize: '11px', color: theme.textMuted }}>
          {label}
        </span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleEditConfirm}
          onKeyDown={handleEditKeyDown}
          style={inputStyle}
        />
      ) : (
        <div onMouseDown={handleMouseDown} style={inputStyle}>
          {value}
        </div>
      )}
    </div>
  );
}
