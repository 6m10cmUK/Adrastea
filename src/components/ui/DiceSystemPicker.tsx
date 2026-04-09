import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../styles/theme';
import { calcPopupPos } from '../../utils/calcPopupPos';

export function DiceSystemPicker({
  value,
  onChange,
  systems,
}: {
  value: string;
  onChange: (id: string) => void;
  systems: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return systems.slice(0, 50);
    const lower = search.toLowerCase();
    return systems.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower),
    ).slice(0, 50);
  }, [systems, search]);

  // 検索変更時にカーソルをリセット
  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  // ハイライト行をスクロールに追従
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const selectedLabel = systems.find((s) => s.id === value)?.name ?? value;

  const select = (s: { id: string; name: string }) => {
    onChange(s.id);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (composingRef.current) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIndex]) select(filtered[highlightIndex]);
        break;
      case 'Escape':
        setOpen(false);
        setSearch('');
        break;
    }
  };

  // ドロップダウン位置計算
  const getDropdownPos = () => {
    if (!btnRef.current) return new DOMRect(0, 0, 0, 0);
    return btnRef.current.getBoundingClientRect();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <label style={{ fontSize: '12px', color: theme.textSecondary }}>ダイスシステム</label>
      <button
        className="adra-btn"
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          height: '28px',
          padding: '2px 8px',
          fontSize: '12px',
          background: theme.bgInput,
          border: `1px solid ${theme.borderInput}`,
          borderRadius: 0,
          color: theme.textPrimary,
          textAlign: 'left',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        {selectedLabel}
      </button>
      {open && (() => {
        const rect = getDropdownPos();
        const popPos = calcPopupPos(rect, rect.width, 240, 'down');
        return createPortal(
        <div
          ref={dropRef}
          className="adrastea-root"
          style={{
            position: 'fixed',
            top: popPos.top,
            left: popPos.left,
            width: rect.width,
            zIndex: 9999,
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            maxHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: theme.shadowMd,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            placeholder="システム名で検索..."
            autoFocus
            maxLength={128}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              background: theme.bgInput,
              border: 'none',
              borderBottom: `1px solid ${theme.border}`,
              color: theme.textPrimary,
              outline: 'none',
            }}
          />
          <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map((s, i) => (
              <div
                key={s.id}
                onClick={() => select(s)}
                onMouseEnter={() => setHighlightIndex(i)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  background: i === highlightIndex ? theme.accentHighlight : 'transparent',
                  color: theme.textPrimary,
                }}
              >
                {s.name}
                <span style={{ color: theme.textMuted, marginLeft: '6px', fontSize: '10px' }}>
                  {s.id}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px', fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>
                {systems.length === 0 ? '読み込み中...' : '該当なし'}
              </div>
            )}
          </div>
        </div>,
        document.body,
      );
      })()}
    </div>
  );
}
