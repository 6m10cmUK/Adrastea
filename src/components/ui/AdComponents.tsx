import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { RgbaColorPicker } from 'react-colorful';
import { theme } from '../../styles/theme';
import { X, Palette, Maximize2 } from 'lucide-react';
import { calcPopupPos } from '../../utils/calcPopupPos';
import { DropdownMenu } from './DropdownMenu';
import { Tooltip } from './Tooltip';

// ── Shared compact styles ──
const FONT_SIZE = '12px';
const HEIGHT = '24px';
const PADDING = '2px 6px';
const GAP = '4px';

// ── AdInput ──
interface AdInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  fullWidth?: boolean;
  inputWidth?: string;
}

export function AdInput({ label, fullWidth = true, inputWidth, style, id, ...props }: AdInputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && <label htmlFor={inputId} style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>}
      <input
        id={inputId}
        maxLength={128}
        {...props}
        style={{
          height: HEIGHT,
          padding: PADDING,
          fontSize: FONT_SIZE,
          background: theme.bgInput,
          border: `1px solid ${theme.borderInput}`,
          borderRadius: 0,
          color: theme.textPrimary,
          outline: 'none',
          boxSizing: 'border-box',
          width: inputWidth ?? (fullWidth ? '100%' : undefined),
          ...style,
        }}
      />
    </div>
  );
}

// ── AdTextArea ──
interface AdTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  expandable?: boolean;
}

export function AdTextArea({ label, style, expandable, ...props }: AdTextAreaProps) {
  const autoId = useId();
  const textareaId = props.id || autoId;
  const [expanded, setExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(String(props.value ?? ''));

  // props.value が外部から変わったら同期
  useEffect(() => { setLocalValue(String(props.value ?? '')); }, [props.value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && <label htmlFor={textareaId} style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <textarea
          id={textareaId}
          {...props}
          style={{
            padding: PADDING,
            fontSize: FONT_SIZE,
            background: theme.bgInput,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: 0,
            color: theme.textPrimary,
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
            minHeight: '60px',
            resize: 'vertical',
            ...style,
          }}
        />
        {expandable && (
          <Tooltip label="テキストエリアを拡大">
            <button
              type="button"
              onClick={() => { setLocalValue(String(props.value ?? '')); setExpanded(true); }}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.textMuted,
                padding: '2px',
              display: 'flex',
              opacity: 0.6,
            }}
          >
            <Maximize2 size={12} />
            </button>
          </Tooltip>
        )}
      </div>
      {expanded && createPortal(
        <div
          onClick={() => {
            // 枠外クリックで閉じて反映
            props.onChange?.({ target: { value: localValue } } as React.ChangeEvent<HTMLTextAreaElement>);
            setExpanded(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 10003,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '80vw', maxWidth: '700px', height: '60vh',
              background: theme.bgSurface, borderRadius: '8px',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: theme.shadowLg,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${theme.borderSubtle}` }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{label ?? 'テキスト編集'}</span>
              <button
                type="button"
                onClick={() => {
                  props.onChange?.({ target: { value: localValue } } as React.ChangeEvent<HTMLTextAreaElement>);
                  setExpanded(false);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              maxLength={props.maxLength}
              placeholder={props.placeholder}
              style={{
                flex: 1, padding: '12px', fontSize: '13px', lineHeight: 1.6,
                background: theme.bgInput, color: theme.textPrimary,
                border: 'none', outline: 'none', resize: 'none',
                fontFamily: 'monospace',
              }}
              autoFocus
            />
            {props.maxLength && (
              <div style={{ textAlign: 'right', fontSize: '10px', color: theme.textMuted, padding: '4px 12px', borderTop: `1px solid ${theme.borderSubtle}` }}>
                {localValue.length} / {props.maxLength}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── AdButton ──
interface AdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'danger';
  fullWidth?: boolean;
}

export function AdButton({ variant = 'default', fullWidth, children, style, className, ...props }: AdButtonProps) {
  const isGhost = variant === 'default';
  const bg = variant === 'primary' ? theme.accent
    : variant === 'danger' ? theme.dangerBgSubtle
    : undefined;
  const color = variant === 'primary' ? theme.textOnAccent
    : variant === 'danger' ? theme.danger
    : theme.textPrimary;
  const border = 'none';

  return (
    <button
      {...props}
      className={`adra-btn ${isGhost ? 'adra-btn--ghost' : ''} ${className ?? ''}`.trim()}
      style={{
        height: HEIGHT,
        padding: isGhost ? '8px 12px' : '0 10px',
        minWidth: isGhost ? undefined : 0,
        fontSize: FONT_SIZE,
        fontWeight: variant === 'primary' ? 600 : 400,
        background: bg,
        color,
        border,
        borderRadius: 0,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: GAP,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── AdSelect ──
interface AdSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  label?: string;
  options: { value: string; label: string }[];
}

export function AdSelect({ label, options, ...props }: AdSelectProps) {
  const autoId = useId();
  const selectId = props.id || autoId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && <label htmlFor={selectId} style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>}
      <select
        id={selectId}
        {...props}
        style={{
          height: HEIGHT,
          padding: PADDING,
          fontSize: FONT_SIZE,
          background: theme.bgInput,
          border: `1px solid ${theme.borderInput}`,
          borderRadius: 0,
          color: theme.textPrimary,
          outline: 'none',
          boxSizing: 'border-box',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── AdCheckbox ──
interface AdCheckboxProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function AdCheckbox({ label, checked, onChange, disabled }: AdCheckboxProps) {
  return (
    <label
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        fontSize: FONT_SIZE,
        color: theme.textSecondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.55 : 1,
      }}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <input type="checkbox" checked={checked} readOnly style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} />
      {label}
      <div
        style={{
          position: 'relative',
          width: 28,
          height: 16,
          borderRadius: 8,
          backgroundColor: checked ? theme.accent : theme.bgInput,
          border: `1px solid ${checked ? 'transparent' : theme.borderSubtle}`,
          boxSizing: 'border-box',
          transition: 'background-color 0.15s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: checked ? theme.textOnAccent : theme.textPrimary,
            transition: 'left 0.15s',
          }}
        />
      </div>
    </label>
  );
}

// ── AdSlider ──
interface AdSliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  suffix?: string;
  onChange: (value: number) => void;
}

export function AdSlider({ label, value, min, max, step = 1, displayValue, suffix, onChange }: AdSliderProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>
        <span style={{ fontSize: '11px', color: theme.textMuted }}>{displayValue ?? value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: '14px' }}
      />
    </div>
  );
}

// ── AdSection ──
interface AdSectionProps {
  title?: string;
  label?: string;
  children: React.ReactNode;
}

export function AdSection({ title, label, children }: AdSectionProps) {
  const heading = title ?? label;
  return (
    <div style={{ marginBottom: GAP }}>
      {heading && (
        <div style={{
          padding: '2px 0',
          borderBottom: `1px solid ${theme.border}`,
          color: theme.textPrimary,
          fontSize: FONT_SIZE,
          fontWeight: 600,
        }}>
          {heading}
        </div>
      )}
      <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: GAP }}>
        {children}
      </div>
    </div>
  );
}

// ── AdColorPicker ──
interface AdColorPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  enableAlpha?: boolean;
  compact?: boolean;
  onOpen?: () => void;
  onClose?: (value: string) => void;
}

type RgbaColor = { r: number; g: number; b: number; a: number };

const PALETTE_KEY = 'adrastea-color-palette';

function loadPalette(): string[] {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function savePalette(colors: string[]) {
  localStorage.setItem(PALETTE_KEY, JSON.stringify(colors.slice(0, 16)));
}

const DEFAULT_PALETTE = [
  '#ffffff', '#c0c0c0', '#808080', '#404040', '#000000',
  '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00',
  '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff',
  '#ff00ff', '#ff0080',
  '#1e1e2e', '#313244', '#45475a', '#585b70',
  '#ffffff80', '#00000080',
];

function cssToRgba(value: string): RgbaColor {
  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]), g: Number(rgbaMatch[2]), b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    };
  }
  if (value.match(/^#[0-9a-fA-F]{6,8}$/)) {
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);
    const a = value.length === 9 ? parseInt(value.slice(7, 9), 16) / 255 : 1;
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function rgbaToCss(c: RgbaColor): string {
  const hex = '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
  if (c.a >= 1) return hex;
  const alpha = Math.round(c.a * 255);
  return hex + alpha.toString(16).padStart(2, '0');
}

function rgbaToDisplayBg(c: RgbaColor): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}

export function AdColorPicker({ label, value, onChange, enableAlpha, compact, onOpen, onClose }: AdColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(loadPalette);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number | null>(null);
  const [textInput, setTextInput] = useState(value);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const rgba = cssToRgba(value);

  // ドラッグ中の色をローカルで保持
  const [localRgba, setLocalRgba] = useState<RgbaColor>(rgba);
  const localRgbaRef = useRef(localRgba);
  localRgbaRef.current = localRgba;

  // value が変わったら textInput を同期
  useEffect(() => {
    setTextInput(value);
  }, [value]);

  // ポップオーバーを開く時にローカルカラーを初期化
  useEffect(() => {
    if (open) {
      setLocalRgba(cssToRgba(value));
    }
  }, [open, value]);

  // ポップオーバー位置計算（レンダー後に実測）
  useEffect(() => {
    if (!open || !btnRef.current) {
      setPopPos(null);
      return;
    }
    // 次フレームで popRef の実サイズを取得して位置決定
    const raf = requestAnimationFrame(() => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const pop = popRef.current;
      const popW = pop ? pop.offsetWidth : 210;
      const popH = pop ? pop.offsetHeight : 300;
      const pos = calcPopupPos(rect, popW, popH, 'down');
      setPopPos({ top: pos.top, left: pos.left });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
        setContextMenuOpen(false);
        // ローカルカラーを親に反映
        const finalColor = rgbaToCss(localRgbaRef.current);
        onChange(finalColor);
        onClose?.(finalColor);
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open, onChange, onClose]);

  const handleChange = useCallback((c: RgbaColor) => {
    // ドラッグ中はローカルのみ更新。親への反映はポップオーバー閉じる時
    setLocalRgba(enableAlpha ? c : { ...c, a: 1 });
  }, [enableAlpha]);

  const handleSaveToPalette = useCallback(() => {
    // ポップオーバー内から呼ばれるので localRgba を保存
    const colorToSave = enableAlpha ? localRgbaRef.current : { ...localRgbaRef.current, a: 1 };
    const css = rgbaToCss(colorToSave);
    const next = [css, ...palette.filter(c => c !== css)].slice(0, 16);
    setPalette(next);
    savePalette(next);
  }, [palette, enableAlpha]);

  const handleRemoveFromPalette = useCallback((index: number) => {
    const next = palette.filter((_, i) => i !== index);
    setPalette(next);
    savePalette(next);
    setContextMenuOpen(false);
  }, [palette]);

  const checkerBg = `linear-gradient(45deg, #808080 25%, transparent 25%, transparent 75%, #808080 75%),
    linear-gradient(45deg, #808080 25%, transparent 25%, transparent 75%, #808080 75%)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && !compact && <label style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>}
      <div style={{ display: 'flex', gap: GAP, alignItems: 'center' }}>
        {compact ? (
          <Tooltip label="カラー">
            <button
              ref={btnRef}
              className="adra-btn-icon"
              onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}
              style={{
                width: '24px', height: '24px',
                border: 'none',
                borderRadius: 0,
                color: theme.textSecondary,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              <Palette size={14} />
            </button>
          </Tooltip>
        ) : (
          <>
            <button
              ref={btnRef}
              onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}
              style={{
                width: '24px', height: '22px', border: `1px solid ${theme.border}`,
                background: checkerBg,
                backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px',
                cursor: 'pointer', padding: 0, position: 'relative', flexShrink: 0,
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: rgbaToDisplayBg(open ? localRgba : rgba) }} />
            </button>
            <input
              type="text"
              maxLength={128}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onBlur={() => {
                const v = textInput.trim();
                const isValid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)
                  || /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(v);
                if (isValid) {
                  // enableAlpha=false なら透明度を除去して6桁hexに強制
                  const parsed = cssToRgba(v);
                  const normalized = !enableAlpha && parsed.a < 1
                    ? rgbaToCss({ ...parsed, a: 1 })
                    : v;
                  onChange(normalized);
                  setTextInput(normalized);
                } else {
                  setTextInput(value);
                }
              }}
              style={{
                flex: 1, height: HEIGHT, padding: PADDING, fontSize: FONT_SIZE,
                background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
                borderRadius: 0, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </>
        )}
      </div>

      {/* ポップオーバー（Portal） */}
      {open && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: popPos?.top ?? -9999, left: popPos?.left ?? -9999,
            visibility: popPos ? 'visible' : 'hidden',
            zIndex: 10010,
            background: theme.bgElevated, border: `1px solid ${theme.border}`,
            padding: '8px', display: 'flex', flexDirection: 'row', gap: '8px',
            boxShadow: theme.shadowMd,
          }}
        >
          {/* 左: カラーピッカー */}
          <div className="adra-color-picker-popover" data-hide-alpha={!enableAlpha ? "true" : undefined}>
            <RgbaColorPicker
              color={enableAlpha ? localRgba : { ...localRgba, a: 1 }}
              onChange={handleChange}
            />
          </div>

          {/* 右: パレット */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* デフォルトパレット（削除不可） */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 16px)', gap: '3px',
            }}>
              {DEFAULT_PALETTE.filter(c => enableAlpha ? true : c.length <= 7).map((c, i) => (
                <button
                  key={`d-${i}`}
                  onClick={() => {
                    // パレットクリックは即反映
                    setLocalRgba(cssToRgba(c));
                    onChange(c);
                  }}
                  title={c}
                  style={{
                    width: '16px', height: '16px', border: `1px solid ${theme.border}`,
                    background: checkerBg,
                    backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px',
                    cursor: 'pointer', padding: 0, position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0, background: c }} />
                </button>
              ))}
            </div>

            {/* ユーザー保存パレット */}
            <div style={{
              borderTop: `1px solid ${theme.border}`, paddingTop: '6px',
              display: 'grid', gridTemplateColumns: 'repeat(5, 16px)', gap: '3px',
            }}>
              {/* 現在色を保存するボタン */}
              <Tooltip label="現在の色を保存">
                <button
                  onClick={handleSaveToPalette}
                  style={{
                    width: '16px', height: '16px', border: `1px dashed ${theme.border}`,
                    background: 'transparent', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: theme.textSecondary, fontSize: '14px', lineHeight: 1,
                  }}
                >
                  +
                </button>
              </Tooltip>
              {palette.filter(c => enableAlpha ? true : cssToRgba(c).a >= 1).map((c, i) => (
                <button
                  key={`u-${i}`}
                  onClick={() => {
                    // パレットクリックは即反映
                    setLocalRgba(cssToRgba(c));
                    onChange(c);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuPos({ x: e.clientX, y: e.clientY });
                    setSelectedPaletteIndex(i);
                    setContextMenuOpen(true);
                  }}
                  title={c}
                  style={{
                    width: '16px', height: '16px', border: `1px solid ${theme.border}`,
                    background: checkerBg,
                    backgroundSize: '6px 6px', backgroundPosition: '0 0, 3px 3px',
                    cursor: 'pointer', padding: 0, position: 'relative',
                  }}
                >
                    <div style={{ position: 'absolute', inset: 0, background: c }} />
                  </button>
                ))}
              </div>
          </div>
        </div>,
        document.body,
      )}

      {/* パレット右クリックメニュー（DropdownMenu） */}
      {contextMenuPos && (
        <DropdownMenu
          mode="context"
          open={contextMenuOpen}
          onOpenChange={setContextMenuOpen}
          position={contextMenuPos}
          items={[
            {
              id: 'remove',
              label: 'パレットから削除',
              onClick: () => {
                if (selectedPaletteIndex !== null) {
                  handleRemoveFromPalette(selectedPaletteIndex);
                  setSelectedPaletteIndex(null);
                }
              },
            },
          ]}
          renderItem={(item, _isSelected) => (
            <span style={{ color: theme.danger }}>
              {item.label}
            </span>
          )}
        />
      )}
    </div>
  );
}

// ── AdModal ──
interface AdModalProps {
  title: string;
  width?: string;
  maxHeight?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AdModal({ title, width = '600px', maxHeight = '80vh', onClose, children, footer }: AdModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape キーで閉じる
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // フォーカストラップ
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.bgOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        ref={modalRef}
        style={{
          background: theme.bgElevated,
          border: `1px solid ${theme.border}`,
          borderRadius: 0,
          boxShadow: theme.shadowLg,
          padding: '12px',
          width,
          maxHeight,
          color: theme.textPrimary,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <span style={{ fontSize: FONT_SIZE, fontWeight: 600 }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            display: 'flex',
            gap: GAP,
            justifyContent: 'flex-end',
            paddingTop: '8px',
            borderTop: `1px solid ${theme.border}`,
            marginTop: '8px',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── ConfirmModal ── (window.confirm の代替)
interface ConfirmModalProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  message, confirmLabel = '実行', cancelLabel = 'キャンセル',
  onConfirm, onCancel, danger = false,
}: ConfirmModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onConfirm]);

  return (
    <AdModal title="確認" width="360px" onClose={onCancel} footer={
      <>
        <button
          onClick={onCancel}
          style={{
            background: theme.bgInput, border: `1px solid ${theme.border}`,
            color: theme.textPrimary, cursor: 'pointer',
            padding: '6px 16px', fontSize: FONT_SIZE,
          }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          style={{
            background: danger ? theme.danger : theme.accent,
            border: 'none', color: '#fff', cursor: 'pointer',
            padding: '6px 16px', fontSize: FONT_SIZE, fontWeight: 600,
          }}
        >
          {confirmLabel}
        </button>
      </>
    }>
      <p style={{ fontSize: FONT_SIZE, margin: '8px 0', lineHeight: 1.5 }}>{message}</p>
    </AdModal>
  );
}

// ── AdToggleButtons ── (ボタン群トグル、BGMタイプ選択等に使用)
interface AdToggleButtonsProps<T extends string | null> {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

// ── AdComboBox（単一値 or 複数値のコンボボックス） ──
// カテゴリ付きサジェスト
export type ComboSuggestionItem = string | { label: string; category: string };
export type ComboTagItem = string | { label: string; category: string };
export type CategoryConfig = Record<string, { displayName: string; chipBg: string; chipBorder: string; showWhenEmpty?: boolean }>;

interface AdComboBoxMultiProps {
  mode: 'multi';
  tags: ComboTagItem[] | string[];
  onChange: (tags: ComboTagItem[] | string[]) => void;
  suggestions?: ComboSuggestionItem[];
  placeholder?: string;
  categoryConfig?: CategoryConfig;
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  label?: string;
  hideAddButton?: boolean;
}

interface AdComboBoxSingleProps {
  mode: 'single';
  value: string;
  onChange: (value: string) => void;
  suggestions?: ComboSuggestionItem[];
  placeholder?: string;
  style?: React.CSSProperties;
  categoryConfig?: CategoryConfig;
}

type AdComboBoxProps = AdComboBoxMultiProps | AdComboBoxSingleProps;

export function AdComboBox(props: AdComboBoxProps) {
  const [input, setInput] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropOpen, setDropOpen] = useState(false);

  const isSingleMode = props.mode === 'single';

  // ヘルパー関数
  const normalizeItem = (item: ComboSuggestionItem): { label: string; category?: string } =>
    typeof item === 'string' ? { label: item } : item;

  // suggestions フィルタリング＆正規化
  const effectiveInput = (!isSingleMode && (props as AdComboBoxMultiProps).searchText !== undefined)
    ? (props as AdComboBoxMultiProps).searchText! : input;
  const normalizedSuggestions = React.useMemo(() => {
    const allSuggestions = (props.suggestions ?? []).map(normalizeItem);
    const q = effectiveInput.trim().toLowerCase();
    const limit = 20;
    if (isSingleMode) {
      if (!q) return allSuggestions.slice(0, limit);
      return allSuggestions.filter((s) => s.label.toLowerCase().includes(q)).slice(0, limit);
    } else {
      const multiProps = props as AdComboBoxMultiProps;
      const getTagLabel = (t: ComboTagItem): string => typeof t === 'string' ? t : t.label;
      const excludedLabels = new Set(multiProps.tags.map(getTagLabel));
      const available = allSuggestions.filter((s) => !excludedLabels.has(s.label));
      if (!q) {
        // 未入力時: showWhenEmpty なカテゴリだけ表示（categoryConfig 未指定なら全表示）
        if (multiProps.categoryConfig) {
          const emptyVisible = available.filter((s) =>
            s.category && multiProps.categoryConfig![s.category]?.showWhenEmpty);
          return emptyVisible.slice(0, limit);
        }
        return available.slice(0, limit);
      }
      return available.filter((s) => s.label.toLowerCase().includes(q)).slice(0, limit);
    }
  }, [props.suggestions, props.mode, effectiveInput, isSingleMode, ...(isSingleMode ? [] : [(props as AdComboBoxMultiProps).tags])]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [input]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const handleSelect = (item: { label: string; category?: string }) => {
    if (isSingleMode) {
      const singleProps = props as AdComboBoxSingleProps;
      singleProps.onChange(item.label);
      setInput('');
      setDropOpen(false);
    } else {
      const multiProps = props as AdComboBoxMultiProps;
      const v = item.label.trim();
      if (!v) return;
      const getTagLabel = (t: ComboTagItem): string => typeof t === 'string' ? t : t.label;
      const existingLabels = new Set(multiProps.tags.map(getTagLabel));
      if (!existingLabels.has(v)) {
        const newTag: ComboTagItem = item.category ? { label: v, category: item.category } : v;
        multiProps.onChange([...multiProps.tags, newTag]);
      }
      setInput('');
      setDropOpen(false);
    }
  };

  const getDropPos = () => {
    if (!wrapRef.current) return { top: 0, left: 0, width: 0 };
    const rect = wrapRef.current.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left, width: rect.width };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (composingRef.current) return;
    if (dropOpen && normalizedSuggestions.length > 0) {
      // 横並びタグ表示なので左右矢印
      const prevKey = 'ArrowLeft';
      const nextKey = 'ArrowRight';
      switch (e.key) {
        case nextKey:
          e.preventDefault();
          setHighlightIndex((i) => Math.min(i + 1, normalizedSuggestions.length - 1));
          return;
        case prevKey:
          e.preventDefault();
          setHighlightIndex((i) => Math.max(i - 1, 0));
          return;
        case 'Enter':
          e.preventDefault();
          handleSelect(normalizedSuggestions[highlightIndex]);
          return;
        case 'Escape':
          setDropOpen(false);
          return;
      }
    }
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      handleSelect({ label: input.trim() });
    }
  };

  if (isSingleMode) {
    const singleProps = props as AdComboBoxSingleProps;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...singleProps.style }}>
        <div ref={wrapRef} style={{ display: 'flex', gap: '4px' }}>
          <input
            ref={inputRef}
            type="text"
            maxLength={128}
            value={singleProps.value}
            onChange={(e) => {
              singleProps.onChange(e.target.value);
              setInput(e.target.value);
              setDropOpen(true);
            }}
            onFocus={() => setDropOpen(true)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={handleKeyDown}
            placeholder={singleProps.placeholder}
            style={{
              flex: 1,
              height: HEIGHT,
              padding: PADDING,
              fontSize: FONT_SIZE,
              background: theme.bgInput,
              border: `1px solid ${theme.borderInput}`,
              borderRadius: 0,
              color: theme.textPrimary,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {dropOpen && normalizedSuggestions.length > 0 && createPortal(
          <div
            ref={dropRef}
            className="adrastea-root"
            style={{
              position: 'fixed',
              top: calcPopupPos(new DOMRect(getDropPos().left, getDropPos().top, getDropPos().width, 0), getDropPos().width, 150, 'down').top,
              left: getDropPos().left,
              width: getDropPos().width,
              zIndex: 9999,
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              maxHeight: '150px',
              overflowY: 'auto',
              boxShadow: theme.shadowMd,
            }}
          >
            <div ref={listRef} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px' }}>
              {normalizedSuggestions.map((item, i) => (
                <div
                  key={`${item.category ?? ''}-${item.label}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  style={{
                    padding: '2px 8px',
                    fontSize: FONT_SIZE,
                    cursor: 'pointer',
                    background: i === highlightIndex
                      ? theme.accentHighlight
                      : ((props as AdComboBoxSingleProps).categoryConfig?.[item.category ?? '']?.chipBg ?? theme.accentBgSubtle),
                    color: theme.textPrimary,
                    borderRadius: '2px',
                    border: `1px solid ${i === highlightIndex
                      ? theme.accent
                      : ((props as AdComboBoxSingleProps).categoryConfig?.[item.category ?? '']?.chipBorder ?? theme.accentBorderSubtle)}`,
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  // multi モード
  const multiProps = props as AdComboBoxMultiProps;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {(multiProps.label ?? 'タグ') && (
        <label style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{multiProps.label ?? 'タグ'}</label>
      )}
      {multiProps.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {multiProps.tags.map((tag) => {
            const label = typeof tag === 'string' ? tag : tag.label;
            const category = typeof tag === 'string' ? undefined : tag.category;
            const cc = category ? multiProps.categoryConfig?.[category] : undefined;
            return (
              <span
                key={label}
                data-testid="tag-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  background: cc?.chipBg ?? theme.accentBgSubtle,
                  color: theme.accent,
                  border: `1px solid ${cc?.chipBorder ?? theme.accentBorderSubtle}`,
                }}
              >
                {label}
                <button
                  type="button"
                  onClick={() => {
                    const getLabel = (t: ComboTagItem): string => typeof t === 'string' ? t : t.label;
                    multiProps.onChange(multiProps.tags.filter((t) => getLabel(t) !== label));
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: theme.textMuted,
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div ref={wrapRef} style={{ display: 'flex', gap: '4px' }}>
        <input
          ref={inputRef}
          type="text"
          maxLength={128}
          value={multiProps.searchText !== undefined ? multiProps.searchText : input}
          onChange={(e) => {
            if (multiProps.searchText !== undefined) {
              multiProps.onSearchTextChange?.(e.target.value);
            } else {
              setInput(e.target.value);
            }
            setDropOpen(true);
          }}
          onFocus={() => setDropOpen(true)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={handleKeyDown}
          placeholder={multiProps.placeholder ?? 'タグを入力'}
          style={{
            flex: 1,
            height: HEIGHT,
            padding: PADDING,
            fontSize: FONT_SIZE,
            background: theme.bgInput,
            border: `1px solid ${theme.borderInput}`,
            borderRadius: 0,
            color: theme.textPrimary,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {!multiProps.hideAddButton && (
          <button
            className="adra-btn"
            type="button"
            onClick={() => {
              const currentInput = multiProps.searchText !== undefined ? multiProps.searchText : input;
              if (currentInput.trim()) handleSelect({ label: currentInput });
            }}
            disabled={!(multiProps.searchText !== undefined ? multiProps.searchText : input).trim()}
            style={{
              height: HEIGHT,
              padding: '0 8px',
              fontSize: FONT_SIZE,
              background: (multiProps.searchText !== undefined ? multiProps.searchText : input).trim() ? theme.accent : theme.bgInput,
              color: (multiProps.searchText !== undefined ? multiProps.searchText : input).trim() ? theme.textOnAccent : theme.textMuted,
              border: 'none',
              borderRadius: 0,
              cursor: (multiProps.searchText !== undefined ? multiProps.searchText : input).trim() ? 'pointer' : 'not-allowed',
            }}
          >
            追加
          </button>
        )}
      </div>
      {dropOpen && normalizedSuggestions.length > 0 && createPortal(
        <div
          ref={dropRef}
          className="adrastea-root"
          style={{
            position: 'fixed',
            top: calcPopupPos(new DOMRect(getDropPos().left, getDropPos().top, getDropPos().width, 0), getDropPos().width, 150, 'down').top,
            left: getDropPos().left,
            width: getDropPos().width,
            zIndex: 9999,
            background: theme.bgElevated,
            border: `1px solid ${theme.border}`,
            maxHeight: '150px',
            overflowY: 'auto',
            boxShadow: theme.shadowMd,
          }}
        >
          <div ref={listRef} data-testid="tag-suggestions" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px' }}>
            {normalizedSuggestions.map((item, i) => (
              <div
                key={`${item.category ?? ''}-${item.label}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightIndex(i)}
                style={{
                  padding: '2px 8px',
                  fontSize: FONT_SIZE,
                  cursor: 'pointer',
                  background: i === highlightIndex
                    ? theme.accentHighlight
                    : (multiProps.categoryConfig?.[item.category ?? '']?.chipBg ?? theme.accentBgSubtle),
                  color: theme.textPrimary,
                  borderRadius: '2px',
                  border: `1px solid ${i === highlightIndex
                    ? theme.accent
                    : (multiProps.categoryConfig?.[item.category ?? '']?.chipBorder ?? theme.accentBorderSubtle)}`,
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── AdTagInput（後方互換ラッパー、非推奨） ──
interface AdTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  existingTags?: string[];
}

export function AdTagInput({ tags, onChange, existingTags = [] }: AdTagInputProps) {
  const handleChange = (newTags: ComboTagItem[] | string[]) => {
    // ComboTagItem[] からラベルのみを抽出して string[] に変換
    const stringTags = newTags.map(t => typeof t === 'string' ? t : t.label);
    onChange(stringTags);
  };

  return (
    <AdComboBox
      mode="multi"
      tags={tags}
      onChange={handleChange}
      suggestions={existingTags}
      placeholder="タグを入力"
    />
  );
}

export function AdToggleButtons<T extends string | null>({ label, value, options, onChange }: AdToggleButtonsProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {label && <label style={{ fontSize: FONT_SIZE, color: theme.textSecondary }}>{label}</label>}
      <div style={{ display: 'flex', gap: '2px' }}>
        {options.map((opt) => (
          <button
            className="adra-btn"
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            style={{
              height: HEIGHT,
              padding: '0 8px',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              background: value === opt.value ? theme.accent : theme.bgInput,
              color: value === opt.value ? theme.textOnAccent : theme.textPrimary,
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
