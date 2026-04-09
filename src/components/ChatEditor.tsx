import React, { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Italic, Strikethrough, Heading1, ChevronDown, LockKeyhole } from 'lucide-react';
import { theme } from '../styles/theme';
import type { Character } from '../types/adrastea.types';
import { AdColorPicker } from './ui/AdComponents';
import { Tooltip, DropdownMenu } from './ui';
import { calcPopupPos } from '../utils/calcPopupPos';
import {
  highlightMarkup,
  getSelectionOffsets,
  getCursorOffset,
  setCursorOffset,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_MUTED,
} from './utils/chatEditorUtils';

export interface ChatEditorChannel {
  channel_id: string;
  label: string;
  /** プライベートチャンネル（UI 用・省略時は公開扱い） */
  is_private?: boolean;
}

export interface ChatEditorProps {
  characters?: Character[];
  onSend?: (text: string) => void;
  placeholder?: string;
  enterToSend?: boolean;
  fillHeight?: boolean;
  channels?: ChatEditorChannel[];
  activeChannelId?: string;
  onChannelChange?: (channelId: string) => void;
}

export interface ChatEditorHandle {
  getText: () => string;
  setText: (text: string) => void;
  focus: () => void;
  clear: () => void;
}

const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(
  ({ characters = [], onSend, placeholder = 'メッセージを入力...', enterToSend = true, fillHeight = false, channels, activeChannelId, onChannelChange }, ref) => {
    const [isEmpty, setIsEmpty] = useState(true);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const [suggestionPos, setSuggestionPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const [colorPickerValue, setColorPickerValue] = useState('#ff0000');

    const editorRef = useRef<HTMLDivElement>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const isComposing = useRef(false);
    const shiftHeld = useRef(false);
    const isUpdating = useRef(false);
    const compositionJustEnded = useRef(false);
    const savedSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const suggestionRef = useRef<HTMLDivElement>(null);

    const paletteItems = characters
      .flatMap((c) => c.chat_palette?.split('\n').filter((s) => s.trim()) ?? [])
      .filter((item, i, arr) => arr.indexOf(item) === i);

    const getInputText = useCallback((): string => {
      const el = editorRef.current;
      if (!el) return '';
      return el.innerText.replace(/\n$/, '');
    }, []);

    const updateSuggestions = useCallback((text: string) => {
      if (suppressSuggestionRef.current) return;
      if (!text.trim()) {
        setSuggestions([]);
        setSuggestionIndex(-1);
        return;
      }
      const lower = text.toLowerCase();
      const matched = paletteItems.filter((item) => item.toLowerCase().includes(lower));
      setSuggestions(matched);
      setSuggestionIndex(matched.length > 0 ? 0 : -1);
    }, [paletteItems]);

    const suppressSuggestionRef = useRef(false);
    const applySuggestion = useCallback((text: string) => {
      const el = editorRef.current;
      if (!el) return;
      suppressSuggestionRef.current = true;
      isUpdating.current = true;
      el.innerHTML = highlightMarkup(text) || '';
      setCursorOffset(el, text.length);
      isUpdating.current = false;
      setIsEmpty(false);
      setSuggestions([]);
      setSuggestionIndex(-1);
      // input イベントを発火（外部の onInput ハンドラに変更を通知）
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // 次の入力までサジェスト抑制を維持
      requestAnimationFrame(() => { suppressSuggestionRef.current = false; });
    }, []);

    const applyHighlight = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const text = el.innerText.replace(/\n$/, '');
      const offset = getCursorOffset(el);
      isUpdating.current = true;
      el.innerHTML = highlightMarkup(text) || '';
      setCursorOffset(el, offset);
      isUpdating.current = false;
    }, []);

    const wrapSelection = useCallback((prefix: string, suffix: string) => {
      const el = editorRef.current;
      if (!el) return;
      const offsets = getSelectionOffsets(el);
      if (!offsets) return;

      const text = el.innerText.replace(/\n$/, '');
      const { start, end } = offsets;
      const selectedText = text.slice(start, end);
      const newText = text.slice(0, start) + prefix + selectedText + suffix + text.slice(end);

      isUpdating.current = true;
      el.innerHTML = highlightMarkup(newText) || '';
      const newCursorOffset = start + prefix.length + selectedText.length;
      setCursorOffset(el, newCursorOffset);
      isUpdating.current = false;

      setIsEmpty(newText.length === 0);
    }, []);

    const toggleHeading = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const text = el.innerText.replace(/\n$/, '');
      const offset = getCursorOffset(el);

      const lines = text.split('\n');
      let charCount = 0;
      let lineIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charCount + lines[i].length;
        if (offset <= lineEnd) {
          lineIndex = i;
          break;
        }
        charCount += lines[i].length + 1;
      }

      const line = lines[lineIndex];
      let newLine: string;
      let cursorDelta: number;
      if (line.startsWith('# ')) {
        newLine = line.slice(2);
        cursorDelta = -2;
      } else if (line.startsWith('#')) {
        newLine = line.slice(1);
        cursorDelta = -1;
      } else {
        newLine = '# ' + line;
        cursorDelta = 2;
      }

      lines[lineIndex] = newLine;
      const newText = lines.join('\n');
      const newOffset = Math.max(0, offset + cursorDelta);

      isUpdating.current = true;
      el.innerHTML = highlightMarkup(newText) || '';
      setCursorOffset(el, newOffset);
      isUpdating.current = false;
      setIsEmpty(newText.length === 0);
    }, []);

    const handleInput = useCallback(() => {
      const el = editorRef.current;
      if (el) {
        const text = el.innerText.replace(/\n$/, '');
        setIsEmpty(text.length === 0);
      }
      if (isUpdating.current || isComposing.current || compositionJustEnded.current) return;
      applyHighlight();
      if (el) {
        const text = el.innerText.replace(/\n$/, '');
        if (!isComposing.current) {
          updateSuggestions(text);
        }
      }
    }, [applyHighlight, updateSuggestions]);

    const handleCompositionStart = useCallback(() => {
      isComposing.current = true;
      compositionJustEnded.current = false;
    }, []);

    const handleCompositionEnd = useCallback(() => {
      isComposing.current = false;
      compositionJustEnded.current = true;
      setTimeout(() => {
        compositionJustEnded.current = false;
        applyHighlight();
        const el = editorRef.current;
        if (el) {
          const text = el.innerText.replace(/\n$/, '');
          setIsEmpty(text.length === 0);
          updateSuggestions(text);
        }
      }, 0);
    }, [applyHighlight, updateSuggestions]);

    const handleSend = useCallback(() => {
      const text = getInputText().trim();
      if (!text) return;
      onSend?.(text);
    }, [getInputText, onSend]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        shiftHeld.current = e.shiftKey;
        // サジェストが表示されている場合のキー操作
        if (suggestions.length > 0 && !isComposing.current) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex((i) => Math.max(i - 1, -1));
            return;
          }
          if (e.key === 'Tab' || e.key === 'Enter') {
            if (suggestionIndex >= 0) {
              e.preventDefault();
              applySuggestion(suggestions[suggestionIndex]);
              return;
            }
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setSuggestions([]);
            return;
          }
        }

        if (e.key === 'Enter' && !isComposing.current) {
          if (!enterToSend || (enterToSend && !e.shiftKey)) {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift+Enter: 改行
              const sel = window.getSelection();
              if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const br = document.createElement('br');
                const sentinel = document.createElement('br');
                range.insertNode(sentinel);
                range.insertNode(br);
                range.setStartAfter(br);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              applyHighlight();
              const el = editorRef.current;
              if (el) setIsEmpty(el.innerText.replace(/\n$/, '').length === 0);
            } else if (enterToSend) {
              // Enter で送信（enterToSend=true の場合）
              handleSend();
            } else {
              // enterToSend=false の場合は改行
              const sel = window.getSelection();
              if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const br = document.createElement('br');
                const sentinel = document.createElement('br');
                range.insertNode(sentinel);
                range.insertNode(br);
                range.setStartAfter(br);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
              applyHighlight();
              const el = editorRef.current;
              if (el) setIsEmpty(el.innerText.replace(/\n$/, '').length === 0);
            }
          }
        }
      },
      [handleSend, applyHighlight, suggestions, suggestionIndex, applySuggestion, enterToSend]
    );

    const handleBeforeInput = useCallback(
      (e: React.FormEvent<HTMLDivElement>) => {
        const event = e.nativeEvent as InputEvent;
        if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
          if (isComposing.current) return;
          e.preventDefault();
          if (shiftHeld.current) {
            // Shift+Enter: 改行を手動挿入
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const br = document.createElement('br');
              const sentinel = document.createElement('br');
              range.insertNode(sentinel);
              range.insertNode(br);
              range.setStartAfter(br);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
            applyHighlight();
            const el = editorRef.current;
            if (el) setIsEmpty(el.innerText.replace(/\n$/, '').length === 0);
          } else if (enterToSend) {
            // Enter: 送信
            handleSend();
          } else {
            // Enter: 改行（enterToSend=false の場合）
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const br = document.createElement('br');
              const sentinel = document.createElement('br');
              range.insertNode(sentinel);
              range.insertNode(br);
              range.setStartAfter(br);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
            applyHighlight();
            const el = editorRef.current;
            if (el) setIsEmpty(el.innerText.replace(/\n$/, '').length === 0);
          }
        }
      },
      [handleSend, applyHighlight, enterToSend]
    );

    // サジェスト位置計算
    // サジェスト選択変更時にスクロール追従
    useEffect(() => {
      if (suggestionIndex < 0 || !suggestionRef.current) return;
      const container = suggestionRef.current;
      const item = container.children[suggestionIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }, [suggestionIndex]);

    useEffect(() => {
      if (suggestions.length === 0) {
        setSuggestionPos(null);
        return;
      }
      const containerEl = editorContainerRef.current;
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();

      // カーソル位置を取得
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const caretRect = range.getBoundingClientRect();

        // caretRect が有効な場合（高さ > 0）はカーソルを基準にする
        if (caretRect.height > 0) {
          const { top } = calcPopupPos(caretRect, containerRect.width, 160, 'down');
          setSuggestionPos({ top, left: containerRect.left, width: containerRect.width });
          return;
        }
      }

      // フォールバック: コンテナ基準
      const { top } = calcPopupPos(containerRect, containerRect.width, 160, 'down');
      setSuggestionPos({ top, left: containerRect.left, width: containerRect.width });
    }, [suggestions.length]);

    // useImperativeHandle で ref を公開
    useImperativeHandle(ref, () => ({
      getText: getInputText,
      setText: (text: string) => {
        const el = editorRef.current;
        if (!el) return;
        el.innerHTML = highlightMarkup(text) || '';
        setCursorOffset(el, text.length);
        setIsEmpty(text.length === 0);
      },
      focus: () => editorRef.current?.focus(),
      clear: () => {
        const el = editorRef.current;
        if (el) {
          el.innerHTML = '';
          setIsEmpty(true);
        }
      },
    }));

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* エディタコンテナ */}
        <div
          ref={editorContainerRef}
          style={{
            flex: 1,
            position: 'relative',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            overflow: 'auto',
            minHeight: fillHeight ? 0 : '60px',
          }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
            onBeforeInput={handleBeforeInput}
            style={{
              minHeight: fillHeight ? 0 : '60px',
              height: '100%',
              padding: '4px 6px',
              fontSize: '12px',
              lineHeight: 1.5,
              fontFamily: 'inherit',
              color: COLOR_TEXT_PRIMARY,
              outline: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              caretColor: COLOR_TEXT_PRIMARY,
            }}
          />
          {/* プレースホルダー */}
          {isEmpty && (
            <div
              style={{
                position: 'absolute',
                top: '4px',
                left: '6px',
                color: COLOR_TEXT_MUTED,
                fontSize: '12px',
                lineHeight: 1.5,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {placeholder}
            </div>
          )}
        </div>

        {/* 修飾子ツールバー */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 6px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {([
            { icon: Bold, prefix: '**', suffix: '**' },
            { icon: Italic, prefix: '*', suffix: '*' },
            { icon: Strikethrough, prefix: '~~', suffix: '~~' },
          ] as const).map(({ icon: Icon, prefix, suffix }) => (
            <Tooltip key={prefix} label={prefix === '**' ? '太字' : prefix === '*' ? '斜体' : '打消し'}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  wrapSelection(prefix, suffix);
                }}
                className="adra-btn-icon"
                style={{
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  borderRadius: 0,
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                title={prefix === '**' ? '太字' : prefix === '*' ? '斜体' : '打消し'}
              >
                <Icon size={14} />
              </button>
            </Tooltip>
          ))}
          {/* 見出しボタン */}
          <Tooltip label="見出し">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                toggleHeading();
              }}
              className="adra-btn-icon"
              style={{
                width: '28px',
                height: '28px',
                border: 'none',
                borderRadius: 0,
                color: theme.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <Heading1 size={14} />
            </button>
          </Tooltip>
          {/* 色ボタン */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip label="文字色">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <AdColorPicker
                  compact
                  enableAlpha={false}
                  value={colorPickerValue}
                  onChange={setColorPickerValue}
                  onOpen={() => {
                    const el = editorRef.current;
                    if (el) {
                      savedSelectionRef.current = getSelectionOffsets(el);
                    }
                  }}
                  onClose={(color) => {
                    const saved = savedSelectionRef.current;
                    const el = editorRef.current;
                    if (!el || !saved) return;
                    const text = el.innerText.replace(/\n$/, '');
                    const { start, end } = saved;
                    const selectedText = text.slice(start, end);
                    const prefix = `<color=${color}>`;
                    const suffix = '</color>';
                    const newText = text.slice(0, start) + prefix + selectedText + suffix + text.slice(end);
                    isUpdating.current = true;
                    el.innerHTML = highlightMarkup(newText) || '';
                    setCursorOffset(el, start + prefix.length + selectedText.length);
                    isUpdating.current = false;
                    setIsEmpty(newText.length === 0);
                    savedSelectionRef.current = null;
                  }}
                />
              </span>
            </Tooltip>
          </div>

          {/* スペーサー */}
          <div style={{ flex: 1 }} />

          {/* チャンネル選択 */}
          {channels && channels.length > 0 && (
            <DropdownMenu
              trigger={
                <Tooltip label="チャンネル選択">
                  <button
                    className="adra-btn adra-tab"
                    style={{
                      padding: '4px 8px', border: `1px solid ${theme.borderSubtle}`,
                      fontSize: '11px', cursor: 'pointer', outline: 'none',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    {channels.find(ch => ch.channel_id === activeChannelId)?.is_private && (
                      <LockKeyhole size={10} style={{ flexShrink: 0, opacity: 0.85, color: theme.textMuted }} aria-hidden />
                    )}
                    {channels.find(ch => ch.channel_id === activeChannelId)?.label ?? 'ch'}
                    <ChevronDown size={10} />
                  </button>
                </Tooltip>
              }
              direction="up"
              align="left"
              items={channels.map(ch => ({
                id: ch.channel_id,
                label: ch.label,
                icon: ch.is_private ? (
                  <LockKeyhole size={12} style={{ opacity: 0.85, color: theme.textMuted }} aria-hidden />
                ) : undefined,
                onClick: () => onChannelChange?.(ch.channel_id),
              }))}
              selectedId={activeChannelId}
            />
          )}
        </div>

        {/* サジェストポップアップ */}
        {suggestions.length > 0 && suggestionPos && createPortal(
          <div
            ref={suggestionRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: suggestionPos.top,
              left: suggestionPos.left,
              width: suggestionPos.width,
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadowMd,
              zIndex: 10010,
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {suggestions.map((item, i) => (
              <div
                key={i}
                role="option"
                aria-selected={i === suggestionIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
                style={{
                  padding: '5px 8px',
                  fontSize: '12px',
                  color: i === suggestionIndex ? theme.textOnAccent : theme.textPrimary,
                  background: i === suggestionIndex ? theme.accent : 'transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={() => setSuggestionIndex(i)}
              >
                {item}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  }
);

ChatEditor.displayName = 'ChatEditor';

export default ChatEditor;
