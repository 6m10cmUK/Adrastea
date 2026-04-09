import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, SendHorizonal, Maximize2, Minimize2, CircleHelp } from 'lucide-react';
import { theme } from '../styles/theme';
import type { Character } from '../types/adrastea.types';
import { Tooltip, DropdownMenu } from './ui';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { resolveTemplateVars } from './utils/chatEditorUtils';
import { resolveAssetId } from '../hooks/useAssets';
import { getAvailableSystems, getGameSystemHelp } from '../services/diceRoller';
import ChatEditor from './ChatEditor';
import type { ChatEditorHandle } from './ChatEditor';

interface ChatInputPanelProps {
  characters?: Character[];
  onSendMessage: (content: string, messageType: 'chat' | 'dice' | 'system', characterName?: string, characterAvatarAssetId?: string | null) => void;
}

function renderHelpTextWithLinks(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    const parts = line.split(urlRegex);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('http://') || part.startsWith('https://')) {
            return (
              <a
                key={`part-${lineIndex}-${partIndex}`}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.accent, textDecoration: 'underline' }}
              >
                {part}
              </a>
            );
          }
          return (
            <React.Fragment key={`part-${lineIndex}-${partIndex}`}>
              {part}
            </React.Fragment>
          );
        })}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

const ChatInputPanel: React.FC<ChatInputPanelProps> = ({
  characters = [],
  onSendMessage,
}) => {
  const ctx = useAdrasteaContext();
  const [senderName, setSenderName] = useState(() => {
    try {
      return localStorage.getItem('adrastea-last-sender') ?? '';
    } catch {
      return '';
    }
  });
  const editorRef = useRef<ChatEditorHandle>(null);
  const modalEditorRef = useRef<ChatEditorHandle>(null);
  const [expanded, setExpanded] = useState(false);
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  const [systemHelpLoading, setSystemHelpLoading] = useState(false);
  const [systemHelpText, setSystemHelpText] = useState('');
  const [commonHelpLoading, setCommonHelpLoading] = useState(false);
  const [commonHelpText, setCommonHelpText] = useState('');
  const [activeHelpMenu, setActiveHelpMenu] = useState<'system' | 'common' | 'adrastea'>('system');
  const [systemNameMap, setSystemNameMap] = useState<Record<string, string>>({});

  const selectedCharacterForIcon = useMemo(
    () => (senderName ? (characters.find((c) => c.name === senderName) ?? null) : null),
    [characters, senderName]
  );
  const currentSystemId = ctx.room?.dice_system ?? 'DiceBot';
  const currentSystemLabel = systemNameMap[currentSystemId] ?? currentSystemId;

  // マウント時に senderName → activeSpeakerCharId を同期
  useEffect(() => {
    if (!senderName) return;
    const found = characters.find((c) => c.name === senderName) ?? null;
    ctx.setActiveSpeakerCharId(found?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters]);

  // 発言者名は入力/選択のたびに保持（送信しなくてもリロード復元できるように）
  useEffect(() => {
    try {
      if (senderName.trim()) {
        localStorage.setItem('adrastea-last-sender', senderName.trim());
      } else {
        localStorage.removeItem('adrastea-last-sender');
      }
    } catch {
      // no-op
    }
  }, [senderName]);

  // チャットパレットからのテキスト注入
  useEffect(() => {
    if (ctx.chatInjectText === null) return;
    const el = editorRef.current;
    if (!el) return;
    // 現在のテキストの末尾に追加（空なら置き換え）
    const current = el.getText();
    const newText = current ? current + '\n' + ctx.chatInjectText : ctx.chatInjectText;
    el.setText(newText);
    ctx.setChatInjectText(null);
  }, [ctx.chatInjectText, ctx.setChatInjectText]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const systems = await getAvailableSystems();
      if (!alive) return;
      const map: Record<string, string> = {};
      systems.forEach((system) => {
        map[system.id] = system.name;
      });
      setSystemNameMap(map);
    })();
    return () => {
      alive = false;
    };
  }, []);


  // expanded 開くときにテキストを同期
  const prevExpandedRef = useRef(false);
  useEffect(() => {
    if (expanded && !prevExpandedRef.current) {
      requestAnimationFrame(() => {
        const text = editorRef.current?.getText() ?? '';
        modalEditorRef.current?.setText(text);
        modalEditorRef.current?.focus();
      });
    }
    prevExpandedRef.current = expanded;
  }, [expanded]);

  // 閉じる: アンマウント前にテキストを退避してから閉じる
  const closeExpanded = useCallback(() => {
    const text = modalEditorRef.current?.getText() ?? '';
    setExpanded(false);
    requestAnimationFrame(() => {
      editorRef.current?.setText(text);
    });
  }, []);

  const handleSend = useCallback((text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const charName = senderName.trim() || 'noname';
    const charAvatarAssetId = selectedCharacterForIcon?.images[selectedCharacterForIcon.active_image_index]?.asset_id ?? null;

    const resolved = resolveTemplateVars(trimmedText, selectedCharacterForIcon);
    onSendMessage(resolved, 'chat', charName, charAvatarAssetId);

    editorRef.current?.clear();
  }, [senderName, selectedCharacterForIcon, onSendMessage]);

  const handleSendFromModal = useCallback((text: string) => {
    handleSend(text);
    modalEditorRef.current?.clear();
  }, [handleSend]);

  const handleOpenCommandHelp = useCallback(async () => {
    const systemId = currentSystemId;
    setShowCommandHelp(true);
    setActiveHelpMenu('system');
    setSystemHelpLoading(true);
    setCommonHelpLoading(true);
    const [systemHelp, commonHelp] = await Promise.all([
      getGameSystemHelp(systemId),
      getGameSystemHelp('DiceBot'),
    ]);
    setSystemHelpText(
      systemHelp ??
      [
        'コマンドヘルプを取得できませんでした。',
        '',
        'よく使う例:',
        '- 2D6',
        '- CCB<=60',
        '- 1D100<=技能値',
      ].join('\n')
    );
    setCommonHelpText(
      commonHelp ??
      [
        '共通コマンドヘルプを取得できませんでした。',
        '',
        '代表例:',
        '- choice[a,b,c]',
        '- repeat 3 1D6',
      ].join('\n')
    );
    setSystemHelpLoading(false);
    setCommonHelpLoading(false);
  }, [currentSystemId]);




  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: theme.bgSurface,
        borderLeft: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '6px 8px',
        gap: '4px',
      }}
    >
      {/* キャラクター選択エリア + 送信ボタン */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 0',
          position: 'relative',
        }}
      >
        <Tooltip label="キャラクター選択">
          <DropdownMenu
            trigger={
              <button
                className="adra-btn-icon"
                data-avatar={selectedCharacterForIcon ? 'true' : undefined}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: selectedCharacterForIcon
                    ? resolveAssetId(selectedCharacterForIcon.images[selectedCharacterForIcon.active_image_index]?.asset_id)
                      ? `url(${resolveAssetId(selectedCharacterForIcon.images[selectedCharacterForIcon.active_image_index]?.asset_id)}) top center/cover ${selectedCharacterForIcon.color}`
                      : selectedCharacterForIcon.color
                    : undefined,
                  border: `1px solid ${theme.border}`,
                  flexShrink: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  outline: 'none',
                }}
              >
                {!selectedCharacterForIcon || !resolveAssetId(selectedCharacterForIcon.images[selectedCharacterForIcon.active_image_index]?.asset_id) ? (
                  <User size={14} color={theme.textSecondary} />
                ) : null}
              </button>
            }
            align="left"
            direction="down"
            items={characters.map(c => ({
              id: c.id,
              label: c.name,
              onClick: () => {
                setSenderName(c.name);
                ctx.setActiveSpeakerCharId(c.id);
              },
            }))}
            selectedId={ctx.activeSpeakerCharId ?? undefined}
            renderItem={(item, isSelected) => {
              const char = characters.find(c => c.id === item.id);
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
            value={senderName}
            onChange={(e) => {
              const name = e.target.value;
              setSenderName(name);
              const found = characters.find((c) => c.name === name) ?? null;
              ctx.setActiveSpeakerCharId(found?.id ?? null);
            }}
            placeholder="noname"
            maxLength={128}
            style={{
              flex: 1,
              padding: '4px 6px',
              background: theme.bgBase,
              border: `1px solid ${theme.border}`,
              borderRadius: 0,
              color: theme.textPrimary,
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

        <Tooltip label="コマンドヘルプ">
          <button
            type="button"
            className="adra-btn"
            onClick={handleOpenCommandHelp}
            style={{
              width: '32px',
              height: '32px',
              minWidth: '32px',
              padding: 0,
              background: theme.bgInput,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              borderRadius: 0,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircleHelp size={16} />
          </button>
        </Tooltip>

        <Tooltip label="送信">
          <button
            className="adra-btn"
            onClick={() => {
              const text = editorRef.current?.getText() ?? '';
              handleSend(text);
            }}
            style={{
              width: '32px',
              height: '32px',
              minWidth: '32px',
              padding: 0,
              background: theme.accent,
              color: theme.textOnAccent,
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SendHorizonal size={16} />
          </button>
        </Tooltip>
      </div>

      {/* チャットエディタ */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatEditor
          ref={editorRef}
          characters={characters}
          onSend={handleSend}
          enterToSend
          channels={ctx.channels}
          activeChannelId={ctx.activeChatChannel}
          onChannelChange={ctx.setActiveChatChannel}
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
              width: '80vw', maxWidth: '800px', height: '70vh',
              background: theme.bgSurface, borderRadius: '8px', boxShadow: theme.shadowLg,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${theme.borderSubtle}` }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>チャット入力</span>
              <Tooltip label="縮小">
                <button type="button" onClick={closeExpanded} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                  <Minimize2 size={16} />
                </button>
              </Tooltip>
            </div>
            <ChatEditor
              ref={modalEditorRef}
              characters={characters}
              onSend={handleSendFromModal}
              enterToSend
              channels={ctx.channels}
              activeChannelId={ctx.activeChatChannel}
              onChannelChange={ctx.setActiveChatChannel}
            />
          </div>
        </div>,
        document.body
      )}

      {showCommandHelp && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10004, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCommandHelp(false)}
        >
          <div
            style={{
              width: 'min(90vw, 720px)',
              height: '560px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadowLg,
              display: 'flex',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '180px', borderRight: `1px solid ${theme.borderSubtle}`, background: theme.bgElevated, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.borderSubtle}`, fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                チャットコマンド
              </div>
              <button
                type="button"
                onClick={() => setActiveHelpMenu('system')}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: activeHelpMenu === 'system' ? theme.bgInput : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${theme.borderSubtle}`,
                  color: activeHelpMenu === 'system' ? theme.textPrimary : theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {currentSystemLabel}
              </button>
              <button
                type="button"
                onClick={() => setActiveHelpMenu('common')}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: activeHelpMenu === 'common' ? theme.bgInput : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${theme.borderSubtle}`,
                  color: activeHelpMenu === 'common' ? theme.textPrimary : theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                共通コマンド
              </button>
              <button
                type="button"
                onClick={() => setActiveHelpMenu('adrastea')}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: activeHelpMenu === 'adrastea' ? theme.bgInput : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${theme.borderSubtle}`,
                  color: activeHelpMenu === 'adrastea' ? theme.textPrimary : theme.textSecondary,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Adrasteaコマンド
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${theme.borderSubtle}` }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
                  {activeHelpMenu === 'system'
                    ? currentSystemLabel
                    : activeHelpMenu === 'common'
                    ? '共通コマンド'
                    : 'Adrasteaコマンド'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCommandHelp(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
                >
                  ×
                </button>
              </div>
              <div
                style={{
                  padding: '12px',
                  overflowY: 'auto',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  color: theme.textPrimary,
                }}
              >
                {renderHelpTextWithLinks(activeHelpMenu === 'system'
                  ? (systemHelpLoading ? '読み込み中...' : systemHelpText)
                  : activeHelpMenu === 'common'
                  ? (commonHelpLoading ? '読み込み中...' : commonHelpText)
                  : [
                      'Adrasteaコマンド',
                      '',
                      'テンプレート置換:',
                      '- {name} : 選択中キャラクター名',
                      '- {HP} / {STR} など : 同名のステータス/パラメータ値',
                      '',
                      'ステータス/パラメータ操作:',
                      '- :ラベル名+1',
                      '- :ラベル名-1',
                      '- :ラベル名=1',
                      '',
                      '選択中キャラクターの一致ラベルを更新します。',
                    ].join('\n'))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChatInputPanel;
