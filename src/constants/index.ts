import type { AccountType, LeaveStatus, PermissionCode, PermissionScopeKind } from '@/types';

export const statusConfig: Record<LeaveStatus, { label: string; color: string; bg: string; dot: string }> = {
  upcoming: { label: 'قادمة', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  active: { label: 'في إجازة', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  returning_soon: { label: 'تنتهي قريبًا', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  completed: { label: 'منتهية', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  cancelled: { label: 'ملغاة', color: 'text-red-600', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

export const memberStatusConfig = {
  on_leave: { label: 'في إجازة', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  at_work: { label: 'في العمل', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  on_leave_today: { label: 'تبدأ اليوم', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  returning_today: { label: 'تنتهي اليوم', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', dot: 'bg-teal-500' },
  archived: { label: 'مؤرشف', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
};

export const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'مدير النظام', color: 'text-teal-700', bg: 'bg-teal-50' },
  supervisor: { label: 'مستخدم', color: 'text-blue-700', bg: 'bg-blue-50' },
  approver: { label: 'مراجعة الإجازات', color: 'text-purple-700', bg: 'bg-purple-50' },
  viewer: { label: 'مستخدم', color: 'text-slate-600', bg: 'bg-slate-50' },
  user: { label: 'مستخدم', color: 'text-blue-700', bg: 'bg-blue-50' },
};

export const accountTypeConfig: Record<AccountType, { label: string; color: string; bg: string; description: string }> = {
  admin: { label: 'مدير النظام', color: 'text-teal-700', bg: 'bg-teal-50', description: 'صلاحية كاملة على النظام' },
  user: { label: 'مستخدم', color: 'text-blue-700', bg: 'bg-blue-50', description: 'صلاحيات مخصصة حسب النطاق' },
  approver: { label: 'مراجعة الإجازات', color: 'text-purple-700', bg: 'bg-purple-50', description: 'تدقيق وإحالة الطلبات وتسجيل العرض فقط' },
};

export const permissionDefinitions: Array<{ code: PermissionCode; label: string; group: 'leaders' | 'leaves' | 'review' | 'reports' }> = [
  { code: 'view_leaders', label: 'مشاهدة بيانات الموظفين', group: 'leaders' },
  { code: 'create_leader', label: 'إضافة موظف', group: 'leaders' },
  { code: 'edit_leader', label: 'تعديل موظف', group: 'leaders' },
  { code: 'archive_leader', label: 'أرشفة موظف', group: 'leaders' },
  { code: 'delete_leader', label: 'حذف موظف', group: 'leaders' },
  { code: 'view_leaves', label: 'مشاهدة الإجازات', group: 'leaves' },
  { code: 'create_leave', label: 'إضافة إجازة', group: 'leaves' },
  { code: 'edit_own_leave', label: 'تعديل الإجازات التي أنشأها', group: 'leaves' },
  { code: 'cancel_own_leave', label: 'إلغاء الإجازات التي أنشأها', group: 'leaves' },
  { code: 'edit_any_leave', label: 'تعديل أي إجازة', group: 'leaves' },
  { code: 'cancel_any_leave', label: 'إلغاء أي إجازة', group: 'leaves' },
  { code: 'disable_leave', label: 'تعطيل إجازة', group: 'leaves' },
  { code: 'approve_undersecretary', label: 'تدقيق وإحالة من مكتب المدير العام', group: 'review' },
  { code: 'approve_minister', label: 'تسجيل العرض من مكتب رئيس الجهة', group: 'review' },
  { code: 'return_review_pending', label: 'إعادة الطلب إلى الانتظار', group: 'review' },
  { code: 'view_reports', label: 'مشاهدة التقارير', group: 'reports' },
  { code: 'view_audit_logs', label: 'مشاهدة سجل العمليات', group: 'reports' },
];

export const permissionScopeLabels: Record<PermissionScopeKind, string> = {
  all: 'كامل البيانات',
  own: 'السجلات التي أنشأها المستخدم',
  sector: 'القطاع والموظفون التابعون له',
  department: 'إدارة عامة',
  assistant_undersecretary: 'مساعد المدير العام والموظفون التابعون له',
};

export const ranks = [
  'مدير عام',
  'مدير إدارة',
  'مساعد مدير إدارة',
  'رئيس قسم',
  'مشرف أول',
  'مشرف',
  'موظف أول',
  'موظف'
] as const;

export const rankOrderMap: Record<string, number> = {
  'مدير عام': 1,
  'مدير إدارة': 2,
  'مساعد مدير إدارة': 3,
  'رئيس قسم': 4,
  'مشرف أول': 5,
  'مشرف': 6,
  'موظف أول': 7,
  'موظف': 8,
};

export function getRankWeight(rank: string | null | undefined): number {
  if (!rank) return 99;
  return rankOrderMap[rank.trim()] ?? 90;
}

export const navItems = [
  { path: '/dashboard', label: 'الرئيسية', icon: 'LayoutDashboard' },
  { path: '/leaders', label: 'الموظفون', icon: 'Users' },
  { path: '/leaves', label: 'الإجازات', icon: 'Plane' },
  { path: '/review', label: 'المراجعة', icon: 'ClipboardCheck' },
  { path: '/today', label: 'حالة الموظفين اليوم', icon: 'CalendarCheck' },
  { path: '/calendar', label: 'التقويم', icon: 'Calendar' },
  { path: '/reports', label: 'التقارير', icon: 'BarChart3' },
];

export const adminNavItems = [
  { path: '/admin/users', label: 'المستخدمون', icon: 'UserCog' },
  { path: '/admin/sectors', label: 'الهيكل التنظيمي', icon: 'Building2' },
  { path: '/admin/leave-types', label: 'أنواع الإجازات', icon: 'Tag' },
  { path: '/admin/audit', label: 'سجل العمليات', icon: 'History' },
];
