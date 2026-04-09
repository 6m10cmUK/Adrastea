import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScenarioText } from '../types/adrastea.types';
import { theme } from '../styles/theme';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { resolveAssetId } from '../hooks/useAssets';
import ChatEditor from './ChatEditor';
import type { ChatEditorHandle } from './ChatEditor';
import { createPortal } from 'react-dom';
import { X, User, Maximize2, Minimize2 } from 'lucide-react';
import { DropdownMenu } from './ui/DropdownMenu';
import { Tooltip } from './ui';

interface ScenarioTextEditorProps {
  text: ScenarioText;
  onUpdate: (id: string, data: Partial<ScenarioText>) => void;
  onClose: () => void;
}

export function ScenarioTextEditor({ text, onUpdate, onClose }: ScenarioTextEditorProps) {
  const ctx = useAdrasteaContext();
  const [title, setTitle] = useState(text.title);
  const [expanded, setExpanded] = useState(false);
  const editorRef = useRef<ChatEditorHandle>(null);
  const modalEditorRef = useRef<ChatEditorHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textIdRef = useRef(text.id);
  const prevExpandedRef = useRef(false);

  // マウント時 + text.id 変化時に内容を同期
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current || textIdRef.current !== text.id) {
      mountedRef.current = true;
      textIdRef.current = text.id;
      setTitle(text.title);
      requestAnimationFrame(() => {
        editorRef.current?.setText(text.content);
        // setText がカーソル設定でフォーカスを奪うのを防ぐ
        (document.activeElement as HTMLElement)?.blur();
      });
    }
  }, [text.id, text.title, text.content]);

  const saveDebounced = useCallback((updates: Partial<ScenarioText>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(text.id, updates);
    }, 300);
  }, [text.id, onUpdate]);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    saveDebounced({ title: v });
  };

  // ChatEditor の内容変化を監視（input イベント）
  const handleEditorInput = useCallback(() => {
    const content = editorRef.current?.getText() ?? '';
    saveDebounced({ content });
  }, [saveDebounced]);

  // アンマウント時に保留中の save を flush
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 拡大開くときにテキストを同期
  useEffect(() => {
    if (expanded && !prevExpandedRef.current) {
      const t = editorRef.current?.getText() ?? '';
      requestAnimationFrame(() => {
        modalEditorRef.current?.setText(t);
        modalEditorRef.current?.focus();
      });
    }
    prevExpandedRef.current = expanded;
  }, [expanded]);

  // 閉じる: アンマウント前にテキストを退避してから閉じる
  const closeExpanded = useCallback(() => {
    const t = modalEditorRef.current?.getText() ?? '';
    setExpanded(false);
    requestAnimationFrame(() => {
      editorRef.current?.setText(t);
    });
    saveDebounced({ content: t });
  }, [saveDebounced]);

  const handleModalInput = useCallback(() => {
    const content = modalEditorRef.current?.getText() ?? '';
    saveDebounced({ content });
  }, [saveDebounced]);

  return (
    <div style={{ background: theme.bgSurface, padding: '8px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '8px', marginBottom: '8px', borderBottom: `1px solid ${theme.borderSubtle}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>
          テキストメモ
        </span>
        <Tooltip label="閉じる">
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: theme.textMuted, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>

      {/* タイトル */}
      <div style={{ marginBottom: '8px', flexShrink: 0 }}>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>タイトル</div>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="タイトル"
          maxLength={128}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '4px 8px',
            background: theme.bgInput, border: `1px solid ${theme.border}`,
            color: theme.textPrimary, fontSize: '12px',
            outline: 'none',
          }}
        />
      </div>

      {/* 送信名選択 */}
      <div style={{ marginBottom: '8px', flexShrink: 0 }}>
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>送信名</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tooltip label="キャラクター選択">
            <DropdownMenu
              trigger={
                <button
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: (() => {
                      const c = ctx.characters.find(ch => ch.id === text.speaker_character_id);
                      if (!c) return undefined;
                      const asset_id = resolveAssetId(c.images[c.active_image_index]?.asset_id);
                      return asset_id ? `url(${asset_id}) top center/cover ${c.color}` : c.color;
                    })(),
                    border: `1px solid ${theme.border}`, flexShrink: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, outline: 'none',
                  }}
                >
                  {!text.speaker_character_id || !resolveAssetId(ctx.characters.find(c => c.id === text.speaker_character_id)?.images[ctx.characters.find(c => c.id === text.speaker_character_id)!.active_image_index]?.asset_id) ? (
                    <User size={14} color={theme.textSecondary} />
                  ) : null}
                </button>
              }
              align="left"
              direction="down"
              items={ctx.characters.map(c => ({
                id: c.id,
                label: c.name,
                onClick: () => {
                  onUpdate(text.id, { speaker_character_id: c.id, speaker_name: c.name });
                },
              }))}
              selectedId={text.speaker_character_id ?? undefined}
              renderItem={(item, isSelected) => {
                const char = ctx.characters.find(c => c.id === item.id);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '150px', minWidth: 0 }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: char?.color ?? theme.textMuted, overflow: 'hidden', flexShrink: 0,
                    }}>
                      {char?.images[char.active_image_index]?.asset_id && (
                        <img src={resolveAssetId(char.images[char.active_image_index].asset_id) ?? undefined} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      )}
                    </div>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{item.label}</span>
                    {isSelected && <span style={{ flexShrink: 0, color: theme.accent, fontSize: '10px' }}>●</span>}
                  </div>
                );
              }}
            />
          </Tooltip>
          <input
            type="text"
            value={text.speaker_name ?? ''}
            onChange={(e) => {
              const name = e.target.value;
              const found = ctx.characters.find(c => c.name === name) ?? null;
              onUpdate(text.id, {
                speaker_name: name || null,
                speaker_character_id: found?.id ?? null,
              });
            }}
            placeholder="noname"
            maxLength={128}
            style={{
              flex: 1, padding: '4px 6px',
              background: theme.bgBase, border: `1px solid ${theme.border}`,
              color: theme.textPrimary, fontSize: '12px',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* 本文（ChatEditor） */}
      <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px', flexShrink: 0 }}>本文</div>
      <div style={{ height: '110px', position: 'relative', display: 'flex', flexDirection: 'column' }} onInput={handleEditorInput}>
        <ChatEditor
          ref={editorRef}
          characters={text.speaker_character_id ? ctx.characters.filter(c => c.id === text.speaker_character_id) : []}
          enterToSend={false}
          fillHeight
          placeholder="テキストメモの内容"
        />
        <Tooltip label="テキストエリアを拡大">
          <button
            onClick={() => setExpanded(true)}
            style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '2px', display: 'flex', opacity: 0.6 }}
          >
            <Maximize2 size={12} />
          </button>
        </Tooltip>
      </div>

      {/* 拡大モーダル */}
      {expanded && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeExpanded}
        >
          <div
            style={{
              width: '90vw', maxWidth: '900px', height: '80vh',
              background: theme.bgSurface, borderRadius: '8px', boxShadow: theme.shadowLg,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${theme.borderSubtle}` }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>テキストメモ - {text.title || '無題'}</span>
              <Tooltip label="縮小">
                <button type="button" onClick={closeExpanded} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                  <Minimize2 size={16} />
                </button>
              </Tooltip>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} onInput={handleModalInput}>
              <ChatEditor
                ref={modalEditorRef}
                characters={text.speaker_character_id ? ctx.characters.filter(c => c.id === text.speaker_character_id) : []}
                enterToSend={false}
                fillHeight
                placeholder="テキストメモの内容"
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 送信先チャンネル選択 */}
      {ctx.channels && (
        <div style={{ marginTop: '8px', flexShrink: 0 }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>送信先</div>
          <select
            value={text.channel_id ?? ''}
            onChange={(e) => onUpdate(text.id, { channel_id: e.target.value || null })}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '4px 8px',
              background: theme.bgInput, border: `1px solid ${theme.border}`,
              color: theme.textPrimary, fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value="">メイン</option>
            {ctx.channels.filter(ch => ch.channel_id !== 'main').map(ch => (
              <option key={ch.channel_id} value={ch.channel_id}>{ch.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
