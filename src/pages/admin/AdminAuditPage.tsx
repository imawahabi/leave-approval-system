import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import { History, ChevronDown, ChevronUp, UserRound, Database, Clock3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { LeaveTimelineModal } from '@/components/LeaveTimelineModal';
import { ResponsivePersonName } from '@/components/PersonName';
import type { AuditLog } from '@/types';

type AuditEntry = Pick<AuditLog, 'id' | 'user_id' | 'action' | 'entity_type' | 'entity_id' | 'old_values' | 'new_values' | 'created_at' | 'profiles'>;

const actionLabels: Record<string, string> = {
  create_member: 'إضافة موظف',
  update_member: 'تعديل موظف',
  archive_member: 'أرشفة موظف',
  delete_member: 'حذف موظف',
  create_leave: 'تسجيل إجازة',
  update_leave: 'تعديل إجازة',
  cancel_leave: 'إلغاء إجازة',
  delete_leave: 'حذف إجازة',
  approve_leave: 'تسجيل العرض على رئيس الجهة',
  reject_leave: 'أرشفة طلب إجازة',
  undo_approve_leave: 'إلغاء تسجيل العرض',
  reopen_rejected_leave: 'إعادة فتح طلب إجازة مؤرشف',
  create_sector: 'إضافة قطاع',
  update_sector: 'تعديل قطاع',
  delete_sector: 'حذف قطاع',
  assign_sector_undersecretary: 'تغيير مساعد المدير العام للقطاع',
  assign_sector_parent: 'تغيير تبعية القطاع',
  assign_assistant_parent: 'تغيير تبعية المستوى التنظيمي',
  create_assistant_undersecretary: 'إضافة وكيل مساعد',
  update_assistant_undersecretary: 'تعديل وكيل مساعد',
  delete_assistant_undersecretary: 'حذف وكيل مساعد',
  create_department: 'إضافة إدارة',
  update_department: 'تعديل إدارة',
  delete_department: 'حذف إدارة',
  create_leave_type: 'إضافة نوع إجازة',
  update_leave_type: 'تعديل نوع إجازة',
  delete_leave_type: 'حذف نوع إجازة',
  update_user_profile: 'تعديل بيانات مستخدم',
  admin_quick_create_user: 'إنشاء مستخدم سريع',
  register_invited_user: 'تسجيل مستخدم بدعوة',
  change_own_pin: 'تغيير رمز الدخول',
};

const auditTime = new Intl.DateTimeFormat('ar-KW-u-nu-latn', {
  timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const fieldLabels: Record<string, string> = {
  full_name: 'الاسم', name_ar: 'الاسم بالعربية', name_en: 'الاسم بالإنجليزية',
  rank: 'المسمى الوظيفي', job_title: 'المسمى الوظيفي', file_number: 'رقم الملف',
  start_date: 'بداية الإجازة', end_date: 'نهاية الإجازة', return_date: 'تاريخ العودة', total_days: 'عدد الأيام',
  status: 'الحالة', approval_status: 'حالة الطلب', workflow_status: 'مرحلة سير العمل',
  current_approval_stage: 'مرحلة الطلب الحالية', notes: 'ملاحظات', attachment_url: 'المرفق',
  sector_id: 'القطاع', department_id: 'الإدارة', is_active: 'نشط', rejection_reason: 'سبب الأرشفة',
};

const hiddenFields = new Set(['id', 'entity_id', 'user_id', 'created_by', 'updated_by', 'reviewed_by', 'leave_type_id', 'leadership_member_id', 'sector_id', 'department_id', 'substitute_member_id', 'approval_route_id']);
const visibleFields = new Set(Object.keys(fieldLabels).filter((key) => !hiddenFields.has(key)));
const valueLabels: Record<string, string> = {
  upcoming: 'قادمة', active: 'سارية', returning_soon: 'توشك على الانتهاء', completed: 'منتهية', cancelled: 'ملغاة',
  pending: 'بانتظار الإجراء', approved: 'تم العرض', rejected: 'مؤرشف', pending_stage_1: 'بانتظار التدقيق والإحالة', pending_stage_2: 'بانتظار العرض',
  rejected_stage_1: 'مؤرشف في مكتب المدير العام', rejected_stage_2: 'مؤرشف في مكتب رئيس الجهة',
};

function entityLabel(type: string) {
  return ({ leadership_members: 'موظف', leadership_leaves: 'إجازة', assistant_undersecretaries: 'وكيل مساعد', departments: 'إدارة', sectors: 'قطاع', leave_types: 'نوع إجازة', profiles: 'مستخدم' } as Record<string, string>)[type] ?? type;
}

function actionLabel(log: AuditEntry): string {
  if (log.entity_type === 'leadership_leaves' && log.action === 'update_leave') {
    const before = log.old_values;
    const after = log.new_values;
    if (after?.workflow_status === 'pending_stage_2' && before?.workflow_status === 'pending_stage_1') {
      return 'تدقيق وإحالة إلى مكتب رئيس الجهة';
    }
    // Existing audit records may store stage transitions as a generic update.
    if (before?.approval_status !== after?.approval_status) {
      if (after?.approval_status === 'approved') return actionLabels.approve_leave;
      if (after?.approval_status === 'rejected') return actionLabels.reject_leave;
      if (after?.approval_status === 'pending' && before?.approval_status === 'approved') return actionLabels.undo_approve_leave;
      if (after?.approval_status === 'pending' && before?.approval_status === 'rejected') return actionLabels.reopen_rejected_leave;
    }
  }
  return actionLabels[log.action] ?? log.action;
}

function displayValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'current_approval_stage') return String(value) === '1' ? 'مكتب المدير العام' : String(value) === '2' ? 'مكتب رئيس الجهة' : String(value);
  if (key && (key.endsWith('_date') || key === 'created_at' || key === 'updated_at')) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('ar-KW-u-nu-latn', { timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }
  if (typeof value === 'string' && valueLabels[value]) return valueLabels[value];
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changeKeys(log: AuditEntry) {
  return [...new Set([...Object.keys(log.old_values ?? {}), ...Object.keys(log.new_values ?? {})])]
    .filter((key) => visibleFields.has(key));
}

function changeSummary(log: AuditEntry) {
  const keys = changeKeys(log);
  const statusKey = keys.find((key) => key === 'status' || key === 'approval_status' || key === 'workflow_status');
  if (statusKey) return `${fieldLabels[statusKey]}: ${displayValue(log.new_values?.[statusKey], statusKey)}`;
  if (keys.length) return `${keys.length} ${keys.length === 1 ? 'حقل متغير' : 'حقول متغيرة'}`;
  return 'بدون تفاصيل إضافية';
}

function ChangeDetails({ log }: { log: AuditEntry }) {
  const keys = changeKeys(log);
  if (!keys.length) return <p className="text-xs text-slate-500">تم تسجيل العملية بنجاح. لا توجد بيانات إضافية لعرضها.</p>;
  return (
    <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200/80 p-3 sm:p-4 space-y-3">
      {keys.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-right text-slate-500"><th className="pb-2 font-semibold">الحقل</th><th className="pb-2 font-semibold">قبل العملية</th><th className="pb-2 font-semibold">بعد العملية</th></tr></thead>
            <tbody className="divide-y divide-slate-200/80">
              {keys.map((key) => <tr key={key}><td className="py-2 font-semibold text-slate-700 whitespace-nowrap">{fieldLabels[key] ?? key}</td><td className="py-2 text-slate-500 max-w-[220px] break-words">{key === 'full_name' && typeof log.old_values?.[key] === 'string' ? <ResponsivePersonName name={log.old_values[key] as string} /> : displayValue(log.old_values?.[key], key)}</td><td className="py-2 text-slate-700 max-w-[220px] break-words">{key === 'full_name' && typeof log.new_values?.[key] === 'string' ? <ResponsivePersonName name={log.new_values[key] as string} /> : displayValue(log.new_values?.[key], key)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminAuditPage() {
  const { isAdmin, hasPermission } = useAuth();
  const canViewAudit = isAdmin || hasPermission('view_audit_logs');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [leaveSearch, setLeaveSearch] = useState('');
  const [leaveSearchResults, setLeaveSearchResults] = useState<Array<{ id: string; name: string; start_date: string; end_date: string }>>([]);
  const [leaveSearchError, setLeaveSearchError] = useState<string | null>(null);
  const [leaveSearchDone, setLeaveSearchDone] = useState(false);
  const [leaveSearching, setLeaveSearching] = useState(false);
  const [timelineLeaveId, setTimelineLeaveId] = useState<string | null>(null);
  const pageSize = 20;

  const findLeaves = async () => {
    if (!isAdmin || !leaveSearch.trim()) return;
    const query = leaveSearch.trim();
    setLeaveSearchError(null);
    setLeaveSearchResults([]);
    setLeaveSearchDone(false);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
      setTimelineLeaveId(query);
      return;
    }
    setLeaveSearching(true);
    const { data: member, error: memberError } = await supabase
      .from('leadership_members').select('id,full_name').eq('file_number', query).maybeSingle();
    if (memberError) {
      setLeaveSearchError('تعذر البحث عن رقم الملف.');
    } else if (member) {
      const { data: leaves, error: leavesError } = await supabase
        .from('leadership_leaves').select('id,start_date,end_date')
        .eq('leadership_member_id', member.id).order('created_at', { ascending: false });
      if (leavesError) setLeaveSearchError('تعذر تحميل إجازات هذا الموظف.');
      else setLeaveSearchResults((leaves ?? []).map((leave) => ({ ...leave, name: member.full_name })));
    }
    setLeaveSearching(false);
    setLeaveSearchDone(true);
  };

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id,user_id,action,entity_type,entity_id,old_values,new_values,created_at')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) { setError(error.message); setLoading(false); return; }
    const logs = (data as AuditEntry[]) ?? [];
    const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);
      const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
      setLogs(logs.map((log) => ({ ...log, profiles: log.user_id ? profileMap.get(log.user_id) ?? null : null })));
    } else {
      setLogs(logs);
    }
    setLoading(false);
  }, [page]);

  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const actionOptions = useMemo(() => [...new Set(logs.map((log) => log.action))], [logs]);
  const entityOptions = useMemo(() => [...new Set(logs.map((log) => log.entity_type))], [logs]);
  const actorOptions = useMemo(() => [...new Map(logs.filter((log) => log.user_id).map((log) => [log.user_id!, log.profiles?.full_name ?? log.profiles?.email ?? 'مستخدم']))], [logs]);
  const visibleLogs = useMemo(() => logs.filter((log) => (
    (!actionFilter || log.action === actionFilter) &&
    (!entityFilter || log.entity_type === entityFilter) &&
    (!actorFilter || log.user_id === actorFilter)
  )), [logs, actionFilter, entityFilter, actorFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  if (!canViewAudit) return <ErrorState message="لا تملك صلاحية عرض سجل العمليات" />;
  if (error) return <ErrorState message={error} onRetry={fetch} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="سجل العمليات" subtitle="سجل العمليات على النظام" icon={<History className="w-5 h-5" />} />

      {isAdmin && (
        <div className="card p-4 mb-4 space-y-3" dir="rtl">
          <div>
            <h2 className="text-sm font-bold text-slate-900">تتبع مسار الإجازة</h2>
            <p className="text-xs text-slate-500 mt-1">للمدير فقط: ابحث برقم ملف الموظف أو بمعرّف الإجازة.</p>
          </div>
          <form className="flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); void findLeaves(); }}>
            <input className="input-field flex-1" value={leaveSearch} onChange={(event) => { setLeaveSearch(event.target.value); setLeaveSearchDone(false); setLeaveSearchResults([]); }} placeholder="رقم الملف أو معرّف الإجازة" aria-label="رقم الملف أو معرّف الإجازة" />
            <button type="submit" className="btn-primary" disabled={leaveSearching || !leaveSearch.trim()}>{leaveSearching ? 'جارٍ البحث…' : 'بحث'}</button>
          </form>
          {leaveSearchError && <p role="alert" className="text-xs text-red-700">{leaveSearchError}</p>}
          {leaveSearchResults.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {leaveSearchResults.map((leave) => (
                <li key={leave.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                  <span className="text-slate-700"><ResponsivePersonName name={leave.name} /> · <bdi>{leave.start_date}</bdi> إلى <bdi>{leave.end_date}</bdi></span>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setTimelineLeaveId(leave.id)}>تتبع</button>
                </li>
              ))}
            </ul>
          )}
          {leaveSearchDone && !leaveSearchError && leaveSearchResults.length === 0 && (
            <p className="text-xs text-slate-500">لا توجد إجازات لهذا الرقم.</p>
          )}
        </div>
      )}
      <LeaveTimelineModal leaveId={timelineLeaveId} onClose={() => setTimelineLeaveId(null)} />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : logs.length === 0 ? (
        <div className="card"><EmptyState icon={<History className="w-7 h-7" />} title="لا توجد عمليات مسجلة" /></div>
      ) : (
        <>
          <div className="card p-3 mb-4">
            <div className="flex items-center justify-between gap-2 mb-3"><span className="text-sm font-semibold text-slate-700">تصفية السجل</span><button type="button" className="btn-secondary lg:hidden text-xs py-2" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>{showFilters ? 'إخفاء الفلاتر' : 'عرض الفلاتر'}</button></div>
            <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row gap-3`}>
            <select className="input-field" aria-label="نوع العملية" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">كل العمليات</option>
              {actionOptions.map((action) => <option key={action} value={action}>{actionLabels[action] ?? action}</option>)}
            </select>
            <select className="input-field" aria-label="نوع السجل" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">كل السجلات</option>
              {entityOptions.map((entity) => <option key={entity} value={entity}>{entityLabel(entity)}</option>)}
            </select>
            <select className="input-field" aria-label="منفذ العملية" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="">كل المستخدمين</option>
              {actorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            </div>
          </div>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">العملية</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">نفّذها</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">السجل المتأثر</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">ملخص التغيير</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">وقت التنفيذ</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleLogs.map((log) => (
                    <Fragment key={log.id}>
                    <tr className="hover:bg-slate-50 align-middle">
                      <td className="px-4 py-3"><div className="flex items-center gap-2 text-right"><span className="p-1.5 rounded-lg bg-primary-50 text-primary-700"><History className="w-4 h-4" /></span><Badge label={actionLabel(log)} color="text-slate-700" bg="bg-slate-50 border-slate-200" /></div></td>
                      <td className="px-4 py-3 text-sm text-slate-600"><span className="flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-slate-400" /><ResponsivePersonName name={log.profiles?.full_name ?? log.profiles?.email ?? 'النظام'} /></span></td>
                      <td className="px-4 py-3 text-sm text-slate-500"><span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-slate-400" />{entityLabel(log.entity_type)}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{changeSummary(log)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500"><span className="flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-slate-400" /><bdi>{auditTime.format(new Date(log.created_at))}</bdi></span></td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(log.id)}
                          aria-expanded={expanded.has(log.id)}
                          aria-label={expanded.has(log.id) ? 'إخفاء تفاصيل العملية' : 'عرض تفاصيل العملية'}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
                        >
                          {expanded.has(log.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                    {expanded.has(log.id) && <tr><td colSpan={6} className="px-4 pb-4"><ChangeDetails log={log} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {visibleLogs.map((log) => (
              <div key={log.id} className="card p-3.5">
                <button type="button" onClick={() => toggleExpanded(log.id)} className="w-full text-right">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2"><span className="p-1.5 rounded-lg bg-primary-50 text-primary-700">{expanded.has(log.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span><Badge label={actionLabel(log)} color="text-slate-700" bg="bg-slate-50 border-slate-200" /></span>
                    <span className="text-xs text-slate-400"><bdi>{auditTime.format(new Date(log.created_at))}</bdi></span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate"><ResponsivePersonName name={log.profiles?.full_name ?? log.profiles?.email ?? 'النظام'} /></span>
                    <span className="shrink-0">{entityLabel(log.entity_type)}</span>
                  </div>
                </button>
                {expanded.has(log.id) && <ChangeDetails log={log} />}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4">
            <button className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</button>
            <span className="text-sm text-slate-500">صفحة {page + 1}</span>
            <button className="btn-secondary" disabled={logs.length < pageSize} onClick={() => setPage(page + 1)}>التالي</button>
          </div>
        </>
      )}
    </div>
  );
}
