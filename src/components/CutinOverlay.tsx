import { useState, useEffect, useRef, useCallback } from 'react';
import type { Cutin, ActiveCutin } from '../types/adrastea.types';
import { resolveAssetId } from '../hooks/useAssets';

interface CutinOverlayProps {
  cutins: Cutin[];
  activeCutin: ActiveCutin | null;
  onCutinEnd: () => void;
}

const ANIMATIONS = {
  slide: {
    enter: 'cutinSlideIn',
    exit: 'cutinSlideOut',
  },
  fade: {
    enter: 'cutinFadeIn',
    exit: 'cutinFadeOut',
  },
  zoom: {
    enter: 'cutinZoomIn',
    exit: 'cutinZoomOut',
  },
};

// CSSアニメーションをインジェクト
const styleId = 'cutin-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes cutinSlideIn {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes cutinSlideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes cutinFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes cutinFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes cutinZoomIn {
      from { transform: scale(0.3); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes cutinZoomOut {
      from { transform: scale(1); opacity: 1; }
      to { transform: scale(1.5); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function CutinOverlay({ cutins, activeCutin, onCutinEnd }: CutinOverlayProps) {
  const [phase, setPhase] = useState<'idle' | 'enter' | 'show' | 'exit'>('idle');
  const [currentCutin, setCurrentCutin] = useState<Cutin | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastTriggeredRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activeCutin) {
      if (phase !== 'idle') {
        setPhase('exit');
        timerRef.current = window.setTimeout(() => {
          setPhase('idle');
          setCurrentCutin(null);
        }, 500);
      }
      return;
    }

    // 同じトリガーを二重処理しない
    if (activeCutin.triggered_at === lastTriggeredRef.current) return;
    lastTriggeredRef.current = activeCutin.triggered_at;

    const cutin = cutins.find((c) => c.id === activeCutin.cutin_id);
    if (!cutin) return;

    cleanup();
    setCurrentCutin(cutin);
    setPhase('enter');

    // enter → show
    timerRef.current = window.setTimeout(() => {
      setPhase('show');

      // show → exit
      timerRef.current = window.setTimeout(() => {
        setPhase('exit');

        // exit → idle + clear
        timerRef.current = window.setTimeout(() => {
          setPhase('idle');
          setCurrentCutin(null);
          onCutinEnd();
        }, 500);
      }, cutin.duration);
    }, 500);

    return cleanup;
  }, [activeCutin, cutins, cleanup, onCutinEnd]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  if (phase === 'idle' || !currentCutin) return null;

  const anim = ANIMATIONS[currentCutin.animation] ?? ANIMATIONS.slide;
  const animName = phase === 'exit' ? anim.exit : anim.enter;
  const animDuration = phase === 'enter' || phase === 'exit' ? '0.5s' : 'none';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        animation: animDuration !== 'none' ? `${animName} ${animDuration} ease-out forwards` : undefined,
      }}
    >
      <div
        style={{
          background: currentCutin.background_color,
          padding: '24px 48px',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          maxWidth: '80vw',
        }}
      >
        {currentCutin.image_asset_id && resolveAssetId(currentCutin.image_asset_id) && (
          <img
            src={resolveAssetId(currentCutin.image_asset_id) || undefined}
            alt=""
            style={{
              maxWidth: '400px',
              maxHeight: '300px',
              objectFit: 'contain',
              borderRadius: 0,
            }}
          />
        )}
        {currentCutin.text && (
          <div
            style={{
              color: currentCutin.text_color,
              fontSize: '2rem',
              fontWeight: 700,
              textAlign: 'center',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {currentCutin.text}
          </div>
        )}
      </div>
    </div>
  );
}
