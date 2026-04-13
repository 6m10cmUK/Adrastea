import { useCallback } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { handleClipboardImport } from '../../hooks/usePasteHandler';
import { LayerPanel } from '../LayerPanel';

export function LayerDockPanel() {
  const ctx = useAdrasteaContext();

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      await handleClipboardImport(
        text,
        (data) => ctx.addCharacter({ ...data, owner_id: ctx.user?.uid ?? '' }),
        ctx.showToast,
        async (data) => {
          const { sort_order: _so, ...rest } = data;
          return ctx.addObject({ ...rest, scene_start_id: rest.is_global ? null : (ctx.activeScene?.id ?? null), scene_end_id: rest.is_global ? null : (ctx.activeScene?.id ?? null) });
        },
        undefined,
        undefined,
        ctx.updateObject,
        ctx.activeObjects,
        ctx.activeScene?.id ?? null,
        undefined,
        ctx.characters?.map(c => c.name),
        ctx.scenarioTexts?.map(t => t.title),
        ctx.updateScene,
      );
    } catch {
      ctx.showToast('クリップボードの読み取りに失敗しました', 'error');
    }
  }, [ctx]);

  return (
    <LayerPanel onPaste={handlePaste} />
  );
}
