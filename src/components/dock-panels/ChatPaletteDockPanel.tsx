import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { theme } from '../../styles/theme';
import { CharacterEditor, type CharacterEditorHandle } from '../CharacterEditor';
import { AdModal, Tooltip } from '../ui';
import { Pencil, Send } from 'lucide-react';
import { resolveTemplateVars } from '../utils/chatEditorUtils';

export function ChatPaletteDockPanel() {
  const { user } = useAuth();
  const ctx = useAdrasteaContext();
  const [showEditor, setShowEditor] = useState(false);
  const [truncatedSet, setTruncatedSet] = useState<Set<number>>(new Set());
  const textRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const measureTruncation = useCallback((idx: number, el: HTMLButtonElement | null) => {
    if (el) {
      textRefs.current.set(idx, el);
      const isTruncated = el.scrollWidth > el.clientWidth;
      setTruncatedSet((prev) => {
        const has = prev.has(idx);
        if (isTruncated && !has) {
          const next = new Set(prev);
          next.add(idx);
          return next;
        }
        if (!isTruncated && has) {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        }
        return prev;
      });
    } else {
      textRefs.current.delete(idx);
    }
  }, []);

  const editorRef = useRef<CharacterEditorHandle>(null);

  // アクティブなキャラを取得
  const activeCharacter = ctx.activeSpeakerCharId
    ? ctx.characters.find((c) => c.id === ctx.activeSpeakerCharId) ?? null
    : null;

  // チャットパレットを改行で分割
  const paletteItems = activeCharacter?.chat_palette
    ? activeCharacter.chat_palette.split('\n').filter((item) => item.trim())
    : [];

  const handleSendPaletteMessage = (text: string) => {
    if (!activeCharacter) return;
    const resolved = resolveTemplateVars(text, activeCharacter);
    ctx.handleSendMessage(resolved, 'chat', activeCharacter.name, activeCharacter.images[activeCharacter.active_image_index]?.asset_id ?? null);
  };

  const handleModalCloseWithSave = () => {
    editorRef.current?.save();
    setShowEditor(false);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: theme.bgSurface,
        borderLeft: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ヘッダーなし（タイトルは Dockview のタブに表示されるので不要） */}

      {/* パレット一覧 */}
      {ctx.characters.length === 0 ? (
        <div
          style={{
            flex: 1,
            padding: '12px 8px',
            color: theme.textMuted,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          キャラクターが登録されていません
        </div>
      ) : !activeCharacter ? null : paletteItems.length === 0 ? (
        <div
          style={{
            flex: 1,
            padding: '12px 8px',
            color: theme.textMuted,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          チャットパレットが登録されていません
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gridAutoRows: 'min-content',
            gap: '4px',
            minWidth: 0,
            alignContent: 'start',
          }}
        >
          {paletteItems.map((item, idx) => {
            const tile = (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: theme.bgElevated,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '3px',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <button
                  ref={(el) => measureTruncation(idx, el)}
                  className="adra-btn adra-btn--ghost"
                  onClick={() => ctx.setChatInjectText(item)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '4px 8px',
                    borderRadius: 0,
                    fontSize: '12px',
                    color: theme.textPrimary,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'left',
                    display: 'block',
                  }}
                >
                  {item}
                </button>
                <Tooltip label="送信">
                  <button
                    className="adra-btn adra-btn--ghost"
                    onClick={() => handleSendPaletteMessage(item)}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 0,
                      color: theme.accent,
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Send size={12} />
                  </button>
                </Tooltip>
              </div>
            );
            return truncatedSet.has(idx) ? (
              <Tooltip key={idx} label={item}>{tile}</Tooltip>
            ) : tile;
          })}
        </div>
      )}

      {/* 右下の編集ボタン */}
      {activeCharacter && (
        <div style={{ padding: '4px 8px', display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${theme.border}` }}>
          <Tooltip label="チャットパレットを編集">
            <button
              className="adra-btn adra-btn--ghost"
              onClick={() => setShowEditor(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 8px',
                borderRadius: 0,
                color: theme.textSecondary,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <Pencil size={11} />
              編集
            </button>
          </Tooltip>
        </div>
      )}

      {/* モーダル */}
      {showEditor && activeCharacter && (
        <AdModal
          title="チャットパレット編集"
          width="500px"
          onClose={handleModalCloseWithSave}
        >
          <CharacterEditor
            ref={editorRef}
            key={activeCharacter.id}
            character={activeCharacter}
            roomId={ctx.roomId}
            currentUserId={user?.uid ?? ''}
            initialSection="chat_palette"
            onClose={() => setShowEditor(false)}
          />
        </AdModal>
      )}
    </div>
  );
}
