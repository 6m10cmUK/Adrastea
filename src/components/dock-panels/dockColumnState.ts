import type { DockviewApi, DockviewGroupPanel } from 'dockview';

export function fixGroupWidth(group: DockviewGroupPanel) {
  const w = group.width;
  if (w > 50) (group.api as any).setConstraints({ maximumWidth: w });
}

export function relaxGroupWidth(group: DockviewGroupPanel) {
  (group.api as any).setConstraints({ minimumWidth: 50, maximumWidth: Number.MAX_SAFE_INTEGER });
}

export function fixAllNonBoardWidths(api: DockviewApi) {
  api.groups.forEach((g) => {
    if (g.api.location.type !== 'floating' && !g.panels.some((p) => p.id === 'board')) {
      fixGroupWidth(g);
    }
  });
}
