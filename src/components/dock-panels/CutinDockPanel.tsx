import { useEffect } from 'react';
import { useAdrasteaContext } from '../../contexts/AdrasteaContext';
import { usePermission } from '../../hooks/usePermission';
import { CutinPanel } from '../CutinPanel';

export function CutinDockPanel() {
  const ctx = useAdrasteaContext();
  const { can } = usePermission();
  const canManage = can('cutin_manage');

  useEffect(() => {
    ctx.registerPanel('cutin');
    return () => ctx.unregisterPanel('cutin');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CutinPanel
      cutins={ctx.cutins}
      onTrigger={ctx.triggerCutin}
      onAdd={canManage ? () => { ctx.clearAllEditing(); ctx.setEditingCutin(null); } : () => {}}
      onEdit={canManage ? (cutin) => { ctx.clearAllEditing(); ctx.setEditingCutin(cutin); } : () => {}}
      onRemove={canManage ? ctx.removeCutin : () => {}}
      onReorderCutins={ctx.reorderCutins}
      onClose={() => {}}
    />
  );
}
