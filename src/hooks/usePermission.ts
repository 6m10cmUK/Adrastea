import { useCallback } from 'react';
import { useAdrasteaContext } from '../contexts/AdrasteaContext';
import { checkPermission, type PermissionKey } from '../config/permissions';

export function usePermission() {
  const { roomRole } = useAdrasteaContext();

  const can = useCallback(
    (permission: PermissionKey): boolean => checkPermission(roomRole, permission),
    [roomRole],
  );

  return { can, roomRole };
}
