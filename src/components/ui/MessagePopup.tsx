import { useState, useEffect, useRef } from 'react';
import { theme } from '../../styles/theme';
import { parseContent } from '../ChatLogPanel';
import { resolveAssetId } from '../../hooks/useAssets';

interface MessagePopupProps {
  message: { sender_name: string; content: string; sender_avatar_asset_id?: string | null } | null;
  charColor?: string | null;
}

export function MessagePopup({ message, charColor }: MessagePopupProps) {
  const [display, setDisplay] = useState<{ sender_name: string; content: string; sender_avatar_asset_id?: string | null } | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'visible' | 'exit'>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIdRef = useRef<string>('');

  useEffect(() => {
    if (!message) return;

    // メッセージの同一性チェック（sender_name + content で簡易判定）
    const msgId = `${message.sender_name}:${message.content}`;
    if (msgId === prevIdRef.current) return;
    prevIdRef.current = msgId;

    // タイマークリア
    if (timerRef.current) clearTimeout(timerRef.current);

    setDisplay(message);
    setPhase('enter');

    // enter → visible（アニメーション完了後）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPhase('visible');
      });
    });

    // 30秒後にフェードアウト
    timerRef.current = setTimeout(() => {
      setPhase('exit');
      // フェードアウト完了後に非表示
      setTimeout(() => {
        setPhase('hidden');
        setDisplay(null);
      }, 500);
    }, 30000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message]);

  if (phase === 'hidden' || !display) return null;

  const isVisible = phase === 'visible';
  const isExit = phase === 'exit';

  return (
    <div
      onClick={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setPhase('exit');
        setTimeout(() => {
          setPhase('hidden');
          setDisplay(null);
        }, 500);
      }}
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        width: 'clamp(400px, 80%, 600px)',
        transform: `translateX(-50%) translateY(${isVisible ? '0' : isExit ? '0' : '20px'})`,
        opacity: isExit ? 0 : isVisible ? 1 : 0,
        transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
        zIndex: 99,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '8px 16px',
          boxShadow: theme.shadowMd,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          height: '91px',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {display.sender_avatar_asset_id ? (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: charColor ?? undefined, flexShrink: 0, overflow: 'hidden' }}>
              <img src={resolveAssetId(display.sender_avatar_asset_id) ?? undefined} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            </div>
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: charColor || theme.bgInput, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: '11px', fontWeight: 600, color: charColor || theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {display.sender_name}
          </span>
        </div>
        <span style={{
          fontSize: '13px',
          color: theme.textPrimary,
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {parseContent(display.content)}
        </span>
      </div>
    </div>
  );
}
