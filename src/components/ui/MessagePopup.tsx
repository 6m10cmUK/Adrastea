import { useState, useEffect, useRef } from 'react';
import { theme } from '../../styles/theme';
import { parseContent } from '../ChatLogPanel';
import { resolveAssetId } from '../../hooks/useAssets';

interface MessagePopupProps {
  message: { sender_name: string; content: string; sender_avatar_asset_id?: string | null } | null;
  charColor?: string | null;
}

const FONT_SIZE = 13;
const LINE_HEIGHT = 1.4;
const VISIBLE_LINES = 3;
const TEXT_AREA_HEIGHT = Math.round(FONT_SIZE * LINE_HEIGHT * VISIBLE_LINES);
const SCROLL_SPEED_PX_PER_SEC = 25;
const PAUSE_BEFORE_SCROLL_MS = 1500;
const PAUSE_AFTER_SCROLL_MS = 2000;
const DEFAULT_DISPLAY_MS = 30000;

export function MessagePopup({ message, charColor }: MessagePopupProps) {
  const [display, setDisplay] = useState<MessagePopupProps['message']>(null);
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'visible' | 'exit'>('hidden');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [scrollDuration, setScrollDuration] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const textRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string>('');

  useEffect(() => {
    if (!message) return;

    const msgId = `${message.sender_name}:${message.content}`;
    if (msgId === prevIdRef.current) return;
    prevIdRef.current = msgId;

    // タイマー全クリア
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setScrollOffset(0);
    setScrollDuration(0);
    setDisplay(message);
    setPhase('enter');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('visible'));
    });

    const exitPopup = () => {
      setPhase('exit');
      const t = setTimeout(() => {
        setPhase('hidden');
        setDisplay(null);
      }, 500);
      timersRef.current.push(t);
    };

    // transition 完了を待ってから高さ測定 → スクロール開始
    const measureAndStart = () => {
      const el = textRef.current;
      if (!el) return;
      const overflow = el.scrollHeight - el.clientHeight;

      if (overflow > 0) {
        const duration = overflow / SCROLL_SPEED_PX_PER_SEC;
        const t1 = setTimeout(() => {
          setScrollOffset(overflow);
          setScrollDuration(duration);
        }, PAUSE_BEFORE_SCROLL_MS);
        timersRef.current.push(t1);

        const t2 = setTimeout(
          exitPopup,
          PAUSE_BEFORE_SCROLL_MS + duration * 1000 + PAUSE_AFTER_SCROLL_MS,
        );
        timersRef.current.push(t2);
      } else {
        const t = setTimeout(exitPopup, DEFAULT_DISPLAY_MS);
        timersRef.current.push(t);
      }
    };

    const mt = setTimeout(measureAndStart, 50);
    timersRef.current.push(mt);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [message]);

  if (phase === 'hidden' || !display) return null;

  const isVisible = phase === 'visible';
  const isExit = phase === 'exit';

  return (
    <div
      onClick={() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        setPhase('exit');
        const t = setTimeout(() => {
          setPhase('hidden');
          setDisplay(null);
        }, 500);
        timersRef.current.push(t);
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
        <div
          ref={textRef}
          style={{
            fontSize: `${FONT_SIZE}px`,
            lineHeight: LINE_HEIGHT,
            color: theme.textPrimary,
            wordBreak: 'break-word',
            height: `${TEXT_AREA_HEIGHT}px`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: `translateY(-${scrollOffset}px)`,
              transition: scrollDuration > 0 ? `transform ${scrollDuration}s linear` : 'none',
            }}
          >
            {parseContent(display.content)}
          </div>
        </div>
      </div>
    </div>
  );
}
