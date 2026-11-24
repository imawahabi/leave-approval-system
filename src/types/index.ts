export type UserRole = 'admin' | 'supervisor' | 'approver' | 'viewer';
export type AccountType = 'admin' | 'user' | 'approver';
export type PermissionScopeKind = 'all' | 'own' | 'sector' | 'department' | 'assistant_undersecretary';
export type PermissionCode =
  | 'view_leaders'
  | 'create_leader'
  | 'edit_leader'
  | 'archive_leader'
  | 'delete_leader'
  | 'view_leaves'
  | 'create_leave'
  | 'edit_own_leave'
  | 'cancel_own_leave'
  | 'edit_any_leave'
  | 'cancel_any_leave'
  | 'disable_leave'
  | 'approve_undersecretary'
  | 'approve_minister'
  | 'return_review_pending'
  | 'view_reports'
  | 'view_audit_logs'
  | 'manage_users'
  | 'manage_organization'
  | 'manage_leave_types';

export interface PermissionGrant {
  account_type: AccountType;
  permission_code: PermissionCode;
  scope_kind: PermissionScopeKind;
  scope_id: string | null;
}

export interface PermissionGrantDraft {
  permission_code: PermissionCode;
  scope_kind: PermissionScopeKind;
  scope_id: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  account_type?: AccountType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sector {
  id: string;
  assistant_undersecretary_id: string | null;
  parent_sector_id: string | null;
  name_ar: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  assistant_undersecretary?: AssistantUndersecretary | null;
}

export interface AssistantUndersecretary {
  id: string;
  legacy_sector_id: string | null;
  unit_kind: 'undersecretary' | 'assistant';
  parent_id: string | null;
  name_ar: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  sector_id: string | null;
  name_ar: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  sector?: Sector | null;
}

export interface LeaveType {
  id: string;
  name_ar: string;
  name_en: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeadershipMember {
  id: string;
  full_name: string;
  file_number: string;
  rank: string;
  job_title: string;
  sector_id: string | null;
  department_id: string | null;
  workplace: string | null;
  phone_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  sector?: Sector | null;
  department?: Department | null;
}

export type LeaveStatus = 'upcoming' | 'active' | 'returning_soon' | 'completed' | 'cancelled';

export interface LeadershipLeave {
  id: string;
  leadership_member_id: string;
  leave_type_id: string | null;
  start_date: string;
  end_date: string;
  return_date: string | null;
  total_days: number;
  status: LeaveStatus;
  approval_status: 'pending' | 'approved' | 'rejected';
  workflow_status?: 'pending_stage_1' | 'pending_stage_2' | 'approved' | 'rejected_stage_1' | 'rejected_stage_2';
  current_approval_stage?: 1 | 2;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  substitute_member_id: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  leave_type?: LeaveType | null;
  leadership_member?: LeadershipMember | null;
  substitute_member?: { id: string; full_name: string } | null;
  creator?: { id: string; full_name: string | null; email: string } | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}

export interface LeadershipCurrentStatus {
  id: string;
  full_name: string;
  file_number: string;
  rank: string;
  job_title: string;
  sector_id: string | null;
  sector_name: string | null;
  department_id: string | null;
  department_name: string | null;
  workplace: string | null;
  is_active: boolean;
  current_leave_id: string | null;
  leave_type_id: string | null;
  current_leave_type: string | null;
  current_leave_start: string | null;
  current_leave_end: string | null;
  current_leave_return: string | null;
  current_leave_days: number | null;
  leave_status: LeaveStatus | null;
  current_leave_notes: string | null;
}
