import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../styles/theme';

interface TooltipProps {
  label: string;
  delay?: number;
  children: React.ReactElement<any>;
}

const GAP = 8;
const TOOLTIP_MAX_W = 200;
const TOOLTIP_MAX_H = 40;

export function Tooltip({ label, delay = 0, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, transform: '' });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mouseRef = useRef({ x: 0, y: 0 });

  const show = useCallback(
    (e: React.MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        const { x: cx, y: cy } = mouseRef.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const placeRight = cx < vw / 2;
        const placeBelow = cy < vh / 2;

        let x: number;
        let y: number;
        const parts: string[] = [];
        if (placeRight) {
          x = cx + GAP; // tooltip left edge
          x = Math.max(0, Math.min(vw - TOOLTIP_MAX_W, x));
          parts.push('translateX(0)');
        } else {
          x = cx - GAP; // tooltip right edge (with translateX(-100%))
          x = Math.max(TOOLTIP_MAX_W, Math.min(vw, x));
          parts.push('translateX(-100%)');
        }
        if (placeBelow) {
          y = cy + GAP;
          y = Math.max(0, Math.min(vh - TOOLTIP_MAX_H, y));
          parts.push('translateY(0)');
        } else {
          y = cy - GAP; // bottom of tooltip; top will be y - height via translateY(-100%)
          y = Math.max(TOOLTIP_MAX_H, Math.min(vh, y));
          parts.push('translateY(-100%)');
        }
        setPos({ x, y, transform: parts.join(' ') });
        setVisible(true);
      }, delay);
    },
    [delay],
  );

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const tooltipEl =
    visible &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: pos.transform,
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          color: theme.textPrimary,
          fontSize: '11px',
          padding: '2px 6px',
          whiteSpace: 'pre',
          zIndex: 10000,
          pointerEvents: 'none',
          boxShadow: theme.shadowSm,
        }}
      >
        {label}
      </div>,
      document.body,
    );

  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => {
          show(e);
          (children.props as any).onMouseEnter?.(e);
        },
        onMouseMove: (e: React.MouseEvent) => {
          onMouseMove(e);
          (children.props as any).onMouseMove?.(e);
        },
        onMouseLeave: (e: React.MouseEvent) => {
          hide();
          (children.props as any).onMouseLeave?.(e);
        },
      })}
      {tooltipEl}
    </>
  );
}
