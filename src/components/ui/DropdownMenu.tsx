import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../styles/theme';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl+';

/** ショートカット文字列を生成（例: shortcutLabel('C') → '⌘C' or 'Ctrl+C'） */
export const shortcutLabel = (key: string) => `${MOD}${key}`;

export interface DropdownMenuItem {
  id?: string;
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children?: DropdownMenuEntry[];
}

export type DropdownMenuEntry = DropdownMenuItem | 'separator';

export interface DropdownMenuProps {
  // トリガー（mode='trigger' 時のみ使用）
  trigger?: React.ReactNode;

  // 外部制御（mode='context' 時に必要）
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  // メニュー項目
  items: DropdownMenuEntry[];

  // 選択状態
  selectedId?: string;

  // 表示制御
  align?: 'left' | 'right';          // デフォルト 'right'
  direction?: 'down' | 'up';          // デフォルト 'down'

  // コンテキストメニューモード
  mode?: 'trigger' | 'context';       // デフォルト 'trigger'
  position?: { x: number; y: number }; // mode='context' 時の表示座標

  // カスタム描画
  renderItem?: (item: DropdownMenuItem, isSelected: boolean) => React.ReactNode;

  // フッター（tips 等）
  footer?: React.ReactNode;
}

export function DropdownMenu({
  trigger,
  open: externalOpen,
  onOpenChange,
  items,
  selectedId,
  align = 'right',
  direction = 'down',
  mode = 'trigger',
  position,
  renderItem,
  footer,
}: DropdownMenuProps) {
  // --- Internal state management ---
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [menuInitialized, setMenuInitialized] = useState(false);
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const [hoveredSubmenuIndex, setHoveredSubmenuIndex] = useState<number | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuItemRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSubmenuClose = () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
    submenuCloseTimer.current = setTimeout(() => {
      setOpenSubmenuIndex(null);
      setSubmenuPos(null);
      setHoveredSubmenuIndex(null);
    }, 150);
  };
  const cancelSubmenuClose = () => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  };

  // mode='trigger' 時は内部状態、mode='context' 時は外部状態を使用
  const isOpen = mode === 'context' ? (externalOpen ?? false) : isOpenInternal;

  // --- Handle trigger click (mode='trigger' only) ---
  const handleTriggerClick = () => {
    if (mode === 'trigger') {
      const newOpen = !isOpenInternal;
      setIsOpenInternal(newOpen);
      if (newOpen) {
        calculateMenuPosition();
      } else {
        setMenuPos(null);
        setHoveredIndex(null);
        setOpenSubmenuIndex(null);
        setSubmenuPos(null);
      }
    }
  };

  // --- Calculate menu position ---
  const calculateMenuPosition = () => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();

    if (mode === 'context' && position) {
      // Context menu: use provided position
      setMenuPos({ top: position.y, left: position.x });
      setMenuInitialized(false); // Will adjust after measurement
      return;
    }

    // Trigger mode: position relative to trigger
    const marginGap = 4;
    const top = direction === 'down' ? triggerRect.bottom + marginGap : triggerRect.top - marginGap;

    let left: number;
    if (align === 'right') {
      left = triggerRect.right;
    } else {
      left = triggerRect.left;
    }

    setMenuPos({ top, left });
    setMenuInitialized(false);
  };

  // --- Adjust menu position after measurement (trigger mode, align='right' or direction='up') ---
  useEffect(() => {
    if (!isOpen || !menuPos || !menuRef.current) {
      return;
    }

    const menuWidth = menuRef.current.offsetWidth;
    const menuHeight = menuRef.current.offsetHeight;
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    let { top, left } = menuPos;

    if (mode === 'trigger' && triggerRect) {
      // 水平位置: align='right' なら右揃え
      if (align === 'right') {
        left = triggerRect.right - menuWidth;
      }

      // 垂直位置: direction='up' ならトリガーの上
      if (direction === 'up') {
        const marginGap = 4;
        top = triggerRect.top - menuHeight - marginGap;
      }

      // ビューポートはみ出し補正
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      if (top < 8) top = 8;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8);
      }
      if (left < 8) left = 8;
    } else if (mode === 'context') {
      // Adjust context menu to keep within viewport
      if (top + menuHeight > window.innerHeight - 8) top = Math.max(8, top - menuHeight);
      if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, left - menuWidth);
    }

    if (top !== menuPos.top || left !== menuPos.left) {
      setMenuPos({ top, left });
    }

    setMenuInitialized(true);
  }, [isOpen, align, direction, mode, menuPos?.top, menuPos?.left]);

  // --- Sync position to menuPos in context mode ---
  useEffect(() => {
    if (mode === 'context' && isOpen && position) {
      setMenuPos({ top: position.y, left: position.x });
      setMenuInitialized(false);
    } else if (mode === 'context' && !isOpen) {
      setMenuPos(null);
      setHoveredIndex(null);
    }
  }, [mode, isOpen, position?.x, position?.y]);

  // --- Handle click-outside (mode-dependent) ---
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const targetEl = target instanceof HTMLElement ? target : null;
      const inMenuByRole = targetEl?.closest('[role="menuitem"], [role="menu"]');

      const inMenu = menuRef.current?.contains(target) || inMenuByRole;
      const inSubmenu = submenuRef.current?.contains(target);

      if (mode === 'trigger') {
        if (triggerRef.current?.contains(target)) return;
        if (inMenu || inSubmenu) return;
        setIsOpenInternal(false);
        setMenuPos(null);
        setHoveredIndex(null);
        setOpenSubmenuIndex(null);
        setSubmenuPos(null);
      } else if (mode === 'context') {
        if (inMenu || inSubmenu) return;
        onOpenChange?.(false);
        setHoveredIndex(null);
        setOpenSubmenuIndex(null);
        setSubmenuPos(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, mode, onOpenChange]);

  // --- Handle item click ---
  const handleItemClick = (item: DropdownMenuItem) => {
    if (!item.disabled) {
      item.onClick();

      if (mode === 'trigger') {
        setIsOpenInternal(false);
        setMenuPos(null);
        setHoveredIndex(null);
        setOpenSubmenuIndex(null);
        setSubmenuPos(null);
      } else if (mode === 'context') {
        onOpenChange?.(false);
        setHoveredIndex(null);
        setOpenSubmenuIndex(null);
        setSubmenuPos(null);
      }
    }
  };

  // --- Render menu items ---
  const renderMenuItems = (depth: number = 0) => {
    return items.map((entry, index) => {
      if (entry === 'separator') {
        return (
          <div
            key={`separator-${index}`}
            style={{
              height: '1px',
              background: theme.border,
              margin: '4px 0',
            }}
          />
        );
      }

      const isDisabled = entry.disabled ?? false;
      const hasChildren = entry.children && entry.children.length > 0;
      const isHovered = hoveredIndex === index;
      const isSelected = selectedId !== undefined && entry.id === selectedId;

      // Custom render or default
      let itemContent: React.ReactNode;
      if (renderItem && depth === 0) {
        itemContent = renderItem(entry, isSelected);
      } else {
        itemContent = (
          <>
            {entry.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{entry.icon}</span>}
            <span style={{ flex: 1, textAlign: 'left' }}>{entry.label}</span>
            {entry.shortcut && <span style={{ fontSize: '10px', color: theme.textMuted, marginLeft: '16px', flexShrink: 0 }}>{entry.shortcut}</span>}
            {hasChildren && <span style={{ fontSize: '10px', color: theme.textMuted, marginLeft: '8px', flexShrink: 0 }}>▶</span>}
          </>
        );
      }

      const handleItemMouseEnter = () => {
        if (!isDisabled) {
          cancelSubmenuClose();
          setHoveredIndex(index);
          if (hasChildren) {
            setOpenSubmenuIndex(index);
            setHoveredSubmenuIndex(null);
          }
        }
      };

      const handleItemMouseLeave = () => {
        if (!hasChildren) {
          setHoveredIndex(null);
          setOpenSubmenuIndex(null);
          setSubmenuPos(null);
        } else {
          // Keep open for submenu
          setHoveredIndex(null);
        }
      };

      return (
        <button
          role="menuitem"
          key={entry.id ? `item-${entry.id}` : `item-${index}`}
          ref={(el) => {
            if (el) {
              submenuItemRef.current.set(index, el);
            }
          }}
          onClick={() => {
            if (hasChildren) {
              // Toggle submenu on click
              if (openSubmenuIndex === index) {
                setOpenSubmenuIndex(null);
                setSubmenuPos(null);
              } else {
                setOpenSubmenuIndex(index);
              }
            } else {
              handleItemClick(entry);
            }
          }}
          onMouseEnter={handleItemMouseEnter}
          onMouseLeave={handleItemMouseLeave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            color: entry.danger ? theme.danger : theme.textPrimary,
            cursor: isDisabled ? 'default' : 'pointer',
            background:
              isSelected || (isHovered && !isDisabled) ? theme.bgHover : 'transparent',
            border: 'none',
            width: '100%',
            opacity: isDisabled ? 0.4 : 1,
            pointerEvents: isDisabled ? 'none' : 'auto',
            transition: 'background-color 0.15s ease-in-out',
          }}
          disabled={isDisabled}
        >
          {itemContent}
        </button>
      );
    });
  };

  // --- Render submenu items ---
  const renderSubmenuItems = () => {
    if (openSubmenuIndex === null) return null;

    const parentEntry = items[openSubmenuIndex];
    if (parentEntry === 'separator' || !parentEntry.children || parentEntry.children.length === 0) {
      return null;
    }

    return parentEntry.children.map((subEntry, subIndex) => {
      if (subEntry === 'separator') {
        return (
          <div
            key={`sub-separator-${subIndex}`}
            style={{
              height: '1px',
              background: theme.border,
              margin: '4px 0',
            }}
          />
        );
      }

      const isDisabled = subEntry.disabled ?? false;
      const isHovered = hoveredSubmenuIndex === subIndex;
      const isSelected = selectedId !== undefined && subEntry.id === selectedId;

      const itemContent = (
        <>
          {subEntry.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{subEntry.icon}</span>}
          <span style={{ flex: 1, textAlign: 'left' }}>{subEntry.label}</span>
          {subEntry.shortcut && <span style={{ fontSize: '10px', color: theme.textMuted, marginLeft: '16px', flexShrink: 0 }}>{subEntry.shortcut}</span>}
        </>
      );

      return (
        <button
          key={subEntry.id ? `sub-item-${subEntry.id}` : `sub-item-${subIndex}`}
          onClick={() => handleItemClick(subEntry)}
          onMouseEnter={() => !isDisabled && setHoveredSubmenuIndex(subIndex)}
          onMouseLeave={() => setHoveredSubmenuIndex(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            color: subEntry.danger ? theme.danger : theme.textPrimary,
            cursor: isDisabled ? 'default' : 'pointer',
            background:
              isSelected || (isHovered && !isDisabled) ? theme.bgHover : 'transparent',
            border: 'none',
            width: '100%',
            opacity: isDisabled ? 0.4 : 1,
            pointerEvents: isDisabled ? 'none' : 'auto',
            transition: 'background-color 0.15s ease-in-out',
          }}
          disabled={isDisabled}
        >
          {itemContent}
        </button>
      );
    });
  };

  // --- Calculate submenu position ---
  useEffect(() => {
    if (openSubmenuIndex === null) {
      setSubmenuPos(null);
      return;
    }

    const parentButton = submenuItemRef.current.get(openSubmenuIndex);
    if (!parentButton) {
      setSubmenuPos(null);
      return;
    }

    const parentRect = parentButton.getBoundingClientRect();
    let subLeft = parentRect.right + 2;
    const subTop = parentRect.top;

    // Fallback to left side if right side is out of viewport
    if (subLeft + 160 > window.innerWidth - 8) {
      subLeft = parentRect.left - 160 - 2;
    }

    setSubmenuPos({ top: subTop, left: Math.max(8, subLeft) });
  }, [openSubmenuIndex]);

  // --- Menu portal ---
  const menuElement =
    isOpen && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            data-selection-panel
            data-dropdown-menu
            role="menu"
            style={{
              position: 'fixed',
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadowMd,
              borderRadius: '4px',
              zIndex: 10010,
              padding: '4px 0',
              minWidth: '160px',
              width: 'max-content',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
              visibility: menuInitialized ? 'visible' : 'hidden',
            }}
            onMouseLeave={() => {
              setHoveredIndex(null);
              scheduleSubmenuClose();
            }}
          >
            {renderMenuItems()}
            {footer && (
              <div style={{ padding: '4px 12px', fontSize: '10px', color: theme.textMuted, borderTop: `1px solid ${theme.border}`, marginTop: '4px' }}>
                {footer}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  // --- Submenu portal ---
  const submenuElement =
    isOpen && openSubmenuIndex !== null && submenuPos
      ? createPortal(
          <div
            ref={submenuRef}
            data-selection-panel
            style={{
              position: 'fixed',
              top: `${submenuPos.top}px`,
              left: `${submenuPos.left}px`,
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadowMd,
              borderRadius: '4px',
              zIndex: 10011,
              padding: '4px 0',
              minWidth: '160px',
              width: 'max-content',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }}
            onMouseEnter={cancelSubmenuClose}
            onMouseLeave={scheduleSubmenuClose}
          >
            {renderSubmenuItems()}
          </div>,
          document.body
        )
      : null;

  // --- Render based on mode ---
  if (mode === 'context') {
    // Context mode: menu + submenu only
    return (
      <>
        {menuElement}
        {submenuElement}
      </>
    );
  }

  // Trigger mode: trigger + menu + submenu
  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleTriggerClick}
        style={{ cursor: 'pointer', display: 'inline-flex' }}
      >
        {trigger}
      </div>
      {menuElement}
      {submenuElement}
    </>
  );
}
