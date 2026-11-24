import type { PermissionCode } from '@/types';

export function getWorkspaceAccess(
  isAdmin: boolean,
  hasPermission: (permission: PermissionCode) => boolean,
) {
  const any = (...permissions: PermissionCode[]) => isAdmin || permissions.some(hasPermission);
  return {
    workspace: any('view_leaders', 'create_leader', 'create_leave', 'view_leaves', 'view_reports'),
    today: any('view_leaders', 'view_leaves', 'create_leave'),
    leaders: any('view_leaders', 'create_leader', 'create_leave'),
    leaves: any('view_leaves', 'create_leave', 'edit_own_leave', 'cancel_own_leave', 'edit_any_leave', 'cancel_any_leave'),
    calendar: any('view_leaves'),
    reports: any('view_reports'),
  };
}
