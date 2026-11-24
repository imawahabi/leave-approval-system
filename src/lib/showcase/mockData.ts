/**
 * SHOWCASE-ONLY fictional seed data for the in-browser mock backend.
 *
 * This module is imported only by ./mockClient.ts, which is activated only
 * when the app runs with VITE_SHOWCASE_MOCK=1 (see ../supabase.ts and
 * ./README.md). Every person, phone number and record below is invented for
 * presentation screenshots - no real personnel data is used anywhere.
 *
 * Leave dates are generated relative to "today" so the dashboard, review
 * queues and calendars always look alive whenever the showcase is opened.
 */

export type MockRow = Record<string, unknown>;

const DAY = 86_400_000;

function dateAt(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tsAt(offsetDays: number, hour = 9): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

const CREATED = tsAt(-90, 8);
const UPDATED = tsAt(-2, 10);

/* ── people who can sign in (fictional) ─────────────────────────────── */
export const ADMIN_ID = 'u-admin';

export const profiles: MockRow[] = [
  {
    id: ADMIN_ID,
    email: 'admin@leave-system.example',
    full_name: 'منى خالد السالم',
    role: 'admin',
    account_type: 'admin',
    is_active: true,
    created_at: CREATED,
    updated_at: UPDATED,
  },
  {
    id: 'u-approver',
    email: 'approver@leave-system.example',
    full_name: 'حسن علي النجار',
    role: 'approver',
    account_type: 'approver',
    is_active: true,
    created_at: CREATED,
    updated_at: UPDATED,
  },
  {
    id: 'u-staff',
    email: 'staff@leave-system.example',
    full_name: 'ريم سامي الحداد',
    role: 'supervisor',
    account_type: 'user',
    is_active: true,
    created_at: CREATED,
    updated_at: UPDATED,
  },
  {
    id: 'u-staff-2',
    email: 'office@leave-system.example',
    full_name: 'سارة نبيل القاضي',
    role: 'viewer',
    account_type: 'user',
    is_active: true,
    created_at: CREATED,
    updated_at: UPDATED,
  },
];

/* ── organisation (mirrors the genericised reference seed) ──────────── */
export const assistantUndersecretaries: MockRow[] = [
  { id: 'au-1', legacy_sector_id: null, unit_kind: 'assistant', parent_id: null, name_ar: 'مساعد المدير العام للعمليات والخدمات الميدانية', name_en: 'Assistant Director General for Operations & Field Services', is_active: true, sort_order: 1, created_at: CREATED, updated_at: UPDATED },
  { id: 'au-2', legacy_sector_id: null, unit_kind: 'assistant', parent_id: null, name_ar: 'مساعد المدير العام للوثائق والشؤون العامة', name_en: 'Assistant Director General for Documents & General Affairs', is_active: true, sort_order: 2, created_at: CREATED, updated_at: UPDATED },
  { id: 'au-3', legacy_sector_id: null, unit_kind: 'assistant', parent_id: null, name_ar: 'مساعد المدير العام للشؤون الإدارية والطوارئ', name_en: 'Assistant Director General for Administrative Affairs & Emergencies', is_active: true, sort_order: 3, created_at: CREATED, updated_at: UPDATED },
];

const SECTORS: Array<[string, string, string, string]> = [
  // id, name_ar, name_en, assistant undersecretary id
  ['sec-ops', 'قطاع العمليات', 'Operations Sector', 'au-1'],
  ['sec-field', 'قطاع الخدمات الميدانية', 'Field Services Sector', 'au-1'],
  ['sec-docs', 'قطاع الوثائق والهوية', 'Documents & Identity Sector', 'au-2'],
  ['sec-general', 'قطاع الشؤون العامة', 'General Affairs Sector', 'au-2'],
  ['sec-emergency', 'قطاع الطوارئ', 'Emergency Sector', 'au-3'],
  ['sec-admin', 'القطاع الإداري', 'Administrative Sector', 'au-3'],
];

export const sectors: MockRow[] = SECTORS.map(([id, name_ar, name_en, au], i) => ({
  id,
  assistant_undersecretary_id: au,
  parent_sector_id: null,
  name_ar,
  name_en,
  is_active: true,
  sort_order: i + 1,
  created_at: CREATED,
  updated_at: UPDATED,
}));

const DEPARTMENTS: Array<[string, string, string, string]> = [
  // id, name_ar, name_en, sector id
  ['dep-ops', 'إدارة العمليات', 'Operations Dept', 'sec-ops'],
  ['dep-followup', 'إدارة المتابعة والتنسيق', 'Follow-up & Coordination Dept', 'sec-ops'],
  ['dep-field', 'إدارة الخدمات الميدانية', 'Field Services Dept', 'sec-field'],
  ['dep-licensing', 'إدارة التراخيص', 'Licensing Dept', 'sec-field'],
  ['dep-identity', 'إدارة الهوية', 'Identity Dept', 'sec-docs'],
  ['dep-documents', 'إدارة الوثائق', 'Documents Dept', 'sec-docs'],
  ['dep-general', 'إدارة الخدمات العامة', 'General Services Dept', 'sec-general'],
  ['dep-visitors', 'إدارة شؤون المراجعين', 'Visitors Affairs Dept', 'sec-general'],
  ['dep-emergency', 'إدارة الطوارئ المركزية', 'Central Emergency Dept', 'sec-emergency'],
  ['dep-rapid', 'إدارة الاستجابة السريعة', 'Rapid Response Dept', 'sec-emergency'],
  ['dep-hr', 'إدارة شؤون الموظفين', 'Human Resources Dept', 'sec-admin'],
  ['dep-finance', 'إدارة الشؤون المالية', 'Financial Affairs Dept', 'sec-admin'],
];

export const departments: MockRow[] = DEPARTMENTS.map(([id, name_ar, name_en, sector_id], i) => ({
  id,
  sector_id,
  name_ar,
  name_en,
  is_active: true,
  sort_order: (i % 2) + 1,
  created_at: CREATED,
  updated_at: UPDATED,
}));

export const leaveTypes: MockRow[] = [
  ['lt-annual', 'إجازة دورية', 'Annual Leave'],
  ['lt-special', 'إجازة خاصة', 'Special Leave'],
  ['lt-sick', 'إجازة مرضية', 'Sick Leave'],
  ['lt-mission', 'مهمة رسمية', 'Official Mission'],
  ['lt-other', 'إجازة أخرى', 'Other Leave'],
].map(([id, name_ar, name_en], i) => ({
  id,
  name_ar,
  name_en,
  is_active: true,
  sort_order: i + 1,
  created_at: CREATED,
  updated_at: UPDATED,
}));

/* ── leadership members (all invented) ──────────────────────────────── */
const MEMBERS: Array<[string, string, string, string, string, string, string]> = [
  // name, rank, job_title, sector, department, workplace, file_number
  ['أحمد محمد السالم', 'المدير العام', 'مساعد المدير العام', 'sec-admin', 'dep-hr', 'الديوان العام', '1001'],
  ['خالد عبدالله النجار', 'مساعد المدير العام', 'مساعد المدير العام للشؤون الأمنية', 'sec-ops', 'dep-ops', 'مكتب المدير العام', '1002'],
  ['عمر فاروق الحداد', 'مدير عام', 'مدير عام قطاع العمليات', 'sec-ops', 'dep-ops', 'الإدارة العامة', '1003'],
  ['يوسف إبراهيم القاضي', 'مساعد مدير عام', 'مساعد مدير عام العمليات', 'sec-ops', 'dep-ops', 'العمليات', '1004'],
  ['طارق زياد الحلبي', 'مدير عام', 'مدير عام قطاع الخدمات الميدانية', 'sec-field', 'dep-field', 'الإدارة العامة للخدمات الميدانية', '1005'],
  ['سامي وليد الشاذلي', 'مساعد مدير عام', 'مساعد مدير عام الخدمات الميدانية', 'sec-field', 'dep-licensing', 'إدارة التراخيص', '1006'],
  ['كريم عادل المنصوري', 'مدير إدارة', 'مدير إدارة المتابعة والتنسيق', 'sec-ops', 'dep-followup', 'المتابعة والتنسيق', '1007'],
  ['هشام نبيل السقاف', 'مدير عام', 'مدير عام قطاع الوثائق والهوية', 'sec-docs', 'dep-identity', 'إدارة الهوية', '1008'],
  ['عماد رشيد الحلواني', 'مساعد مدير عام', 'مساعد مدير عام الوثائق', 'sec-docs', 'dep-documents', 'إدارة الوثائق', '1009'],
  ['باسم فؤاد الخولي', 'مدير عام', 'مدير عام قطاع الشؤون العامة', 'sec-general', 'dep-general', 'الخدمات العامة', '1010'],
  ['أيمن سمير البرعي', 'مساعد مدير عام', 'مساعد مدير عام شؤون المراجعين', 'sec-general', 'dep-visitors', 'شؤون المراجعين', '1011'],
  ['جلال محمود السنهوري', 'مدير إدارة', 'مدير إدارة الطوارئ المركزية', 'sec-emergency', 'dep-emergency', 'الطوارئ المركزية', '1012'],
  ['ماجد حسان الرفاعي', 'مدير عام', 'مدير عام قطاع الطوارئ', 'sec-emergency', 'dep-emergency', 'الإدارة العامة للطوارئ', '1013'],
  ['وليد سامح الشامي', 'مساعد مدير عام', 'مساعد مدير عام الطوارئ', 'sec-emergency', 'dep-rapid', 'الاستجابة السريعة', '1014'],
  ['ناصر جميل الحوراني', 'مدير إدارة', 'مدير إدارة الاستجابة السريعة', 'sec-emergency', 'dep-rapid', 'الاستجابة السريعة', '1015'],
  ['حسان مروان الدليمي', 'مدير عام', 'مدير عام القطاع الإداري', 'sec-admin', 'dep-finance', 'الشؤون المالية', '1016'],
  ['فادي رامي الكيلاني', 'مساعد مدير عام', 'مساعد مدير عام الشؤون المالية', 'sec-admin', 'dep-finance', 'الشؤون المالية', '1017'],
  ['رامي سهيل النابلسي', 'مساعد مدير إدارة', 'مدير إدارة شؤون الموظفين', 'sec-admin', 'dep-hr', 'شؤون الموظفين', '1018'],
  ['زياد عماد الفرا', 'مساعد مدير إدارة', 'مدير إدارة التراخيص', 'sec-field', 'dep-licensing', 'التراخيص', '1019'],
  ['بلال هاني الشريف', 'رئيس قسم', 'مدير إدارة الهوية', 'sec-docs', 'dep-identity', 'الهوية', '1020'],
  ['سليم وائل حمادة', 'رئيس قسم', 'مدير إدارة الوثائق', 'sec-docs', 'dep-documents', 'الوثائق', '1021'],
  ['إياد نزار الخطيب', 'موظف', 'مدير إدارة الخدمات العامة', 'sec-general', 'dep-general', 'الخدمات العامة', '1022'],
];

export const leadershipMembers: MockRow[] = MEMBERS.map(([full_name, rank, job_title, sector_id, department_id, workplace, file_number], i) => ({
  id: `m-${String(i + 1).padStart(2, '0')}`,
  full_name,
  file_number,
  rank,
  job_title,
  sector_id,
  department_id,
  workplace,
  phone_number: `+965 9000 00${String(11 + i)}`,
  notes: null,
  is_active: true,
  created_at: CREATED,
  updated_at: UPDATED,
  created_by: ADMIN_ID,
  updated_by: ADMIN_ID,
}));

/* ── leaves, generated relative to today ────────────────────────────── */
type LeaveSpec = {
  member: number; // 1-based index into MEMBERS
  type: string;
  start: number; // day offset
  end: number; // day offset
  status: string;
  approval: 'pending' | 'approved' | 'rejected';
  workflow: string;
  stage?: 1 | 2;
  created: number; // day offset
  reviewed?: number; // day offset
  reason?: string;
  notes?: string;
  creator?: string;
  substitute?: number;
};

const LEAVE_SPECS: LeaveSpec[] = [
  // approved, currently on leave
  { member: 3, type: 'lt-annual', start: -4, end: 9, status: 'active', approval: 'approved', workflow: 'approved', created: -20, reviewed: -15, notes: 'إجازة دورية سنوية مجدولة', substitute: 4 },
  { member: 8, type: 'lt-special', start: -2, end: 3, status: 'active', approval: 'approved', workflow: 'approved', created: -12, reviewed: -9, notes: 'ظروف عائلية خاصة', substitute: 9 },
  { member: 13, type: 'lt-sick', start: -1, end: 1, status: 'active', approval: 'approved', workflow: 'approved', created: -3, reviewed: -2, notes: 'إجازة مرضية بموجب تقرير طبي' },
  // approved, upcoming
  { member: 5, type: 'lt-annual', start: 3, end: 16, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -10, reviewed: -6, substitute: 6 },
  { member: 10, type: 'lt-annual', start: 6, end: 19, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -14, reviewed: -11, substitute: 11 },
  { member: 19, type: 'lt-special', start: 12, end: 14, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -5, reviewed: -3 },
  { member: 1, type: 'lt-annual', start: 20, end: 33, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -8, reviewed: -4, substitute: 2 },
  { member: 18, type: 'lt-annual', start: 2, end: 15, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -9, reviewed: -5, substitute: 1 },
  { member: 3, type: 'lt-annual', start: 30, end: 43, status: 'upcoming', approval: 'approved', workflow: 'approved', created: -2, reviewed: -1, notes: 'إجازة مجدولة مسبقًا', substitute: 4 },
  // approved, completed in the past
  { member: 17, type: 'lt-mission', start: -10, end: -2, status: 'completed', approval: 'approved', workflow: 'approved', created: -30, reviewed: -25, notes: 'مهمة رسمية خارجية' },
  { member: 7, type: 'lt-annual', start: -40, end: -26, status: 'completed', approval: 'approved', workflow: 'approved', created: -60, reviewed: -55 },
  { member: 15, type: 'lt-mission', start: -25, end: -21, status: 'completed', approval: 'approved', workflow: 'approved', created: -40, reviewed: -36, notes: 'مشاركة في اجتماع تنسيقي' },
  { member: 21, type: 'lt-sick', start: -15, end: -12, status: 'completed', approval: 'approved', workflow: 'approved', created: -18, reviewed: -16 },
  { member: 5, type: 'lt-sick', start: -8, end: -6, status: 'completed', approval: 'approved', workflow: 'approved', created: -12, reviewed: -10 },
  { member: 16, type: 'lt-special', start: -50, end: -44, status: 'completed', approval: 'approved', workflow: 'approved', created: -70, reviewed: -65 },
  { member: 3, type: 'lt-special', start: -70, end: -63, status: 'completed', approval: 'approved', workflow: 'approved', created: -85, reviewed: -80 },
  // pending - stage 1 (مدير عام office review)
  { member: 2, type: 'lt-annual', start: 5, end: 18, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_1', stage: 1, created: -1, substitute: 3 },
  { member: 11, type: 'lt-special', start: 9, end: 11, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_1', stage: 1, created: -2, notes: 'طلب إجازة خاصة عاجلة' },
  { member: 20, type: 'lt-annual', start: 15, end: 28, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_1', stage: 1, created: 0 },
  { member: 6, type: 'lt-mission', start: 7, end: 9, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_1', stage: 1, created: -3, notes: 'مهمة رسمية - وفد الجهة' },
  // pending - stage 2 (رئيس الجهة office)
  { member: 4, type: 'lt-annual', start: 4, end: 17, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_2', stage: 2, created: -5, reviewed: -2, substitute: 3 },
  { member: 14, type: 'lt-annual', start: 10, end: 23, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_2', stage: 2, created: -4, reviewed: -1 },
  { member: 22, type: 'lt-special', start: 8, end: 10, status: 'upcoming', approval: 'pending', workflow: 'pending_stage_2', stage: 2, created: -6, reviewed: -3 },
  // rejected / archived
  { member: 9, type: 'lt-annual', start: 6, end: 19, status: 'upcoming', approval: 'rejected', workflow: 'rejected_stage_1', stage: 1, created: -7, reviewed: -4, reason: 'تزامن الإجازة مع مهام رسمية طارئة' },
  { member: 16, type: 'lt-annual', start: 3, end: 16, status: 'upcoming', approval: 'rejected', workflow: 'rejected_stage_2', stage: 2, created: -11, reviewed: -6, reason: 'تعارض مع متطلبات العمل والجاهزية' },
  // cancelled
  { member: 12, type: 'lt-annual', start: 14, end: 27, status: 'cancelled', approval: 'approved', workflow: 'approved', created: -16, reviewed: -12, notes: 'ألغيت بطلب من الموظف' },
];

export const leadershipLeaves: MockRow[] = LEAVE_SPECS.map((s, i) => ({
  id: `lv-${String(i + 1).padStart(2, '0')}`,
  leadership_member_id: `m-${String(s.member).padStart(2, '0')}`,
  leave_type_id: s.type,
  start_date: dateAt(s.start),
  end_date: dateAt(s.end),
  return_date: dateAt(s.end + 1),
  total_days: s.end - s.start + 1,
  status: s.status,
  approval_status: s.approval,
  workflow_status: s.workflow,
  current_approval_stage: s.approval === 'pending' ? s.stage ?? null : null,
  reviewed_by: s.reviewed !== undefined ? ADMIN_ID : null,
  reviewed_at: s.reviewed !== undefined ? tsAt(s.reviewed, 11) : null,
  rejection_reason: s.reason ?? null,
  notes: s.notes ?? null,
  substitute_member_id: s.substitute ? `m-${String(s.substitute).padStart(2, '0')}` : null,
  attachment_url: null,
  created_at: tsAt(s.created, 9),
  updated_at: tsAt(s.reviewed ?? s.created, 11),
  created_by: s.creator ?? ADMIN_ID,
  updated_by: ADMIN_ID,
}));

/* ── workflow notifications for the signed-in admin ─────────────────── */
export const leaveNotifications: MockRow[] = [
  { id: 'nt-1', recipient_id: ADMIN_ID, leave_id: 'lv-17', event_code: 'submitted', created_at: tsAt(-1, 10), read_at: null },
  { id: 'nt-2', recipient_id: ADMIN_ID, leave_id: 'lv-21', event_code: 'forwarded', created_at: tsAt(-1, 12), read_at: null },
  { id: 'nt-3', recipient_id: ADMIN_ID, leave_id: 'lv-20', event_code: 'submitted', created_at: tsAt(0, 8), read_at: null },
  { id: 'nt-4', recipient_id: ADMIN_ID, leave_id: 'lv-01', event_code: 'displayed', created_at: tsAt(-15, 13), read_at: tsAt(-14, 9) },
  { id: 'nt-5', recipient_id: ADMIN_ID, leave_id: 'lv-24', event_code: 'archived', created_at: tsAt(-4, 14), read_at: tsAt(-3, 9) },
];

/* ── audit trail ────────────────────────────────────────────────────── */
const AUDIT_SPECS: Array<[string, string, string, number]> = [
  // action, entity_type, entity_id, created offset
  ['create_leave', 'leadership_leaves', 'lv-20', 0],
  ['create_leave', 'leadership_leaves', 'lv-17', -1],
  ['forward_to_minister', 'leadership_leaves', 'lv-21', -1],
  ['approve_leave', 'leadership_leaves', 'lv-09', -1],
  ['create_leave', 'leadership_leaves', 'lv-18', -2],
  ['reject_leave', 'leadership_leaves', 'lv-24', -4],
  ['update_leave', 'leadership_leaves', 'lv-05', -5],
  ['create_member', 'leadership_members', 'm-22', -9],
  ['approve_leave', 'leadership_leaves', 'lv-01', -15],
  ['create_leave', 'leadership_leaves', 'lv-01', -20],
];

export const auditLogs: MockRow[] = AUDIT_SPECS.map(([action, entity_type, entity_id, offset], i) => ({
  id: `al-${String(i + 1).padStart(2, '0')}`,
  user_id: ADMIN_ID,
  action,
  entity_type,
  entity_id,
  old_values: null,
  new_values: null,
  created_at: tsAt(offset, 10 + (i % 6)),
}));

/** The full mock database. mockClient clones from these tables. */
export function createMockTables(): Record<string, MockRow[]> {
  return {
    profiles: structuredClone(profiles),
    assistant_undersecretaries: structuredClone(assistantUndersecretaries),
    sectors: structuredClone(sectors),
    departments: structuredClone(departments),
    leave_types: structuredClone(leaveTypes),
    leadership_members: structuredClone(leadershipMembers),
    leadership_leaves: structuredClone(leadershipLeaves),
    leave_notifications: structuredClone(leaveNotifications),
    audit_logs: structuredClone(auditLogs),
  };
}
