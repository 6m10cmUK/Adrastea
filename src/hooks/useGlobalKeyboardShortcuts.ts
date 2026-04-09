import { useEffect } from 'react';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';

/**
 * グローバルキーボードショートカット + 選択解除
 *
 * - panelSelection に応じて Ctrl+C/D/Delete をディスパッチ
 * - 選択管理パネル（data-selection-panel）の外をクリックしたら選択解除
 */
export function useGlobalKeyboardShortcuts(): void {
  const { keyboardActionsRef, panelSelection, setPanelSelection } = useAdrasteaContext();

  // Ctrl+C / Ctrl+D / Delete
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true')) return;

      const actions = keyboardActionsRef.current;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (window.getSelection()?.toString()) return;
        if (actions.copy) { e.preventDefault(); actions.copy(); }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        if (actions.duplicate) { e.preventDefault(); actions.duplicate(); }
      } else if (e.key === 'Delete') {
        if (actions.delete) { e.preventDefault(); actions.delete(); }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [keyboardActionsRef]);

  // 選択管理パネル外クリックで選択解除
  useEffect(() => {
    if (!panelSelection) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-selection-panel]')) return;
      setPanelSelection(null);
      keyboardActionsRef.current = {};
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [panelSelection, setPanelSelection, keyboardActionsRef]);
}
