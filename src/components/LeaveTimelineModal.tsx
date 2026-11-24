import { useEffect, useState } from 'react';
import { History, Clock3, UserRound, AlertCircle, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/Modal';
import { ResponsivePersonName } from '@/components/PersonName';

interface TimelineEvent {
  event_id: string;
  event_at: string;
  event_code: string;
  actor_id: string | null;
  actor_name: string | null;
  from_state: string | null;
  to_state: string | null;
  details: Record<string, unknown> | null;
  source: 'recorded' | 'legacy_audit' | 'legacy_workflow' | 'legacy_step' | 'creation_record';
}

const eventLabels: Record<string, string> = {
  created: 'إنشاء الإجازة', create_leave: 'إنشاء الإجازة',
  edited: 'تعديل الإجازة', update_leave: 'تعديل الإجازة',
  forwarded_to_minister: 'تدقيق وإحالة إلى مكتب رئيس الجهة',
  forward_to_minister: 'تدقيق وإحالة إلى مكتب رئيس الجهة',
  presented_to_minister: 'تسجيل العرض على رئيس الجهة',
  approve_final: 'تسجيل العرض على رئيس الجهة', approve_leave: 'تسجيل العرض على رئيس الجهة',
  archived_at_stage: 'أرشفة الطلب', reject_stage: 'أرشفة الطلب', reject_leave: 'أرشفة الطلب',
  presentation_revoked: 'إلغاء تسجيل العرض', undo_approve_leave: 'إلغاء تسجيل العرض',
  reopened: 'إعادة فتح الطلب', reopen_rejected_leave: 'إعادة فتح الطلب',
  returned_to_undersecretary: 'إعادة الطلب إلى مكتب المدير العام',
  admin_reopen_or_rewind: 'إعادة فتح أو إرجاع الطلب بقرار المدير',
  cancelled: 'إلغاء الإجازة', cancel_leave: 'إلغاء الإجازة',
  deleted: 'حذف الإجازة', delete_leave: 'حذف الإجازة',
  workflow_changed: 'تغيير مرحلة الطلب',
  return_to_pending: 'إعادة الطلب للانتظار',
  historical_undersecretary_approved: 'حالة محفوظة: اكتملت إحالة مكتب المدير العام',
  historical_minister_approved: 'حالة محفوظة: اكتمل العرض على الوزير',
  historical_undersecretary_rejected: 'حالة محفوظة: أُرشف الطلب في مكتب المدير العام',
  historical_minister_rejected: 'حالة محفوظة: أُرشف الطلب في مكتب رئيس الجهة',
};

const fieldLabels: Record<string, string> = {
  start_date: 'بداية الإجازة', end_date: 'نهاية الإجازة',
  return_date: 'تاريخ العودة', total_days: 'عدد الأيام',
  status: 'حالة الإجازة', approval_status: 'قرار المراجعة',
  workflow_status: 'مرحلة الإجراء', current_approval_stage: 'المكتب الحالي',
  rejected_at_stage: 'مرحلة الأرشفة', leave_type_id: 'نوع الإجازة',
  rejection_reason: 'سبب الأرشفة', notes_changed: 'تعديل الملاحظات',
  attachment_changed: 'تعديل المرفق',
};

const stateLabels: Record<string, string> = {
  pending_stage_1: 'بانتظار التدقيق والإحالة',
  pending_stage_2: 'بانتظار العرض', approved: 'تم العرض',
  rejected_stage_1: 'مؤرشف في مكتب المدير العام',
  rejected_stage_2: 'مؤرشف في مكتب رئيس الجهة',
  pending: 'بانتظار الإجراء', rejected: 'مؤرشف',
  cancelled: 'ملغاة', upcoming: 'قادمة', active: 'سارية', completed: 'منتهية',
};

const timeFormat = new Intl.DateTimeFormat('ar-KW-u-nu-latn', {
  timeZone: 'Asia/Kuwait', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  const raw = String(value);
  return stateLabels[raw] ?? raw;
}

function changedFields(event: TimelineEvent) {
  const details = event.details ?? {};
  const before = event.source === 'legacy_audit' && details.before && typeof details.before === 'object'
    ? details.before as Record<string, unknown> : {};
  const after = event.source === 'legacy_audit' && details.after && typeof details.after === 'object'
    ? details.after as Record<string, unknown> : {};
  const values = event.source === 'legacy_audit'
    ? Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => before[key] !== after[key])
      .map((key) => [key, { before: before[key], after: after[key] }]))
    : event.source === 'recorded' ? details : {};
  return Object.entries(values).filter(([key, value]) =>
    key in fieldLabels && (typeof value === 'object' || value === true));
}

export function LeaveTimelineModal({ leaveId, onClose }: { leaveId: string | null; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!leaveId || !isAdmin) return;
    let active = true;
    setEvents([]);
    setError(null);
    setLoading(true);
    supabase.rpc('admin_leave_timeline', { p_leave_id: leaveId }).then(({ data, error: fetchError }) => {
      if (!active) return;
      setEvents((data ?? []) as TimelineEvent[]);
      setError(fetchError ? 'تعذر تحميل مسار الإجازة.' : null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [leaveId, isAdmin, retry]);

  if (!isAdmin) return null;
  return (
    <Modal open={!!leaveId} onClose={onClose} title="تتبع مسار الإجازة" size="lg" footer={<button type="button" className="btn-secondary" onClick={onClose}>إغلاق</button>}>
      <div dir="rtl" className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-700"><History className="h-5 w-5" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold text-slate-900">إجراءات الإجازة من الإنشاء حتى آخر إجراء</p><p className="mt-1 text-xs text-slate-500">بترتيب زمني من الأقدم إلى الأحدث · الأوقات بتوقيت الكويت</p></div>
      </div>
      {loading ? <div role="status" className="space-y-3" aria-label="جارٍ تحميل مسار الإجازة">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}</div>
        : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" className="btn-secondary mt-3" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>
          : events.length === 0 ? <p className="text-sm text-slate-600">لا توجد أحداث موثقة لهذه الإجازة.</p>
            : <div dir="rtl" className="space-y-4">
              {events.some((event) => event.source !== 'recorded') && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>
                  بعض بيانات الإجازات القديمة مأخوذة من سجلات أو حالة محفوظة قبل بدء التتبع التفصيلي. إذا غاب منفذ الإجراء أو وقت خطوة بعينها فلا يمكن إثباتهما من السجل الحالي.
                  </span>
                </p>
              )}
              <ol className="border-r-2 border-slate-200 mr-2 space-y-4">
                {events.map((event) => (
                  <li key={`${event.source}-${event.event_id}`} className="relative mr-4 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
                    <span className="absolute -right-[23px] top-5 h-3 w-3 rounded-full border-2 border-white bg-primary-700" />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong className="flex items-center gap-1.5 text-sm text-slate-900">
                        <History className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
                        {eventLabels[event.event_code] ?? 'إجراء على الإجازة'}
                      </strong>
                      <time className="flex items-center gap-1.5 text-xs leading-relaxed text-slate-500" dateTime={event.event_at}>
                        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {event.source === 'legacy_step' ? 'وقت الحالة المحفوظة: ' : ''}
                        <bdi>{timeFormat.format(new Date(event.event_at))}</bdi>
                      </time>
                    </div>
                    <p className="mt-3 flex items-start gap-1.5 break-words text-xs text-slate-700">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      نفّذها: <strong>{event.actor_name
                        ? <ResponsivePersonName name={event.actor_name} />
                        : event.actor_id ? `مستخدم برقم ${event.actor_id}` : 'غير موثق'}</strong>
                    </p>
                    {event.from_state !== event.to_state && (event.from_state || event.to_state) && (
                      <p className="mt-1 text-xs text-slate-600">
                        الحالة: {displayValue(event.from_state)} ← {displayValue(event.to_state)}
                      </p>
                    )}
                    {changedFields(event).length > 0 && (
                      <details className="mt-3 border-t border-slate-100 pt-3">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary-700"><ChevronDown className="h-4 w-4" aria-hidden="true" />تفاصيل التغيير ({changedFields(event).length})</summary>
                      <ul className="mt-3 space-y-2 text-xs text-slate-600">
                        {changedFields(event).map(([key, value]) => {
                          const change = value as { before?: unknown; after?: unknown };
                          return <li key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><p className="mb-2 font-semibold text-slate-800">{fieldLabels[key]}</p>{value !== null && typeof value === 'object'
                            ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div className="min-w-0 break-words"><span className="block text-[11px] text-slate-500">قبل الإجراء</span><bdi>{displayValue(change.before)}</bdi></div><div className="min-w-0 break-words"><span className="block text-[11px] text-slate-500">بعد الإجراء</span><bdi>{displayValue(change.after)}</bdi></div></div>
                            : 'نعم'}</li>;
                        })}
                      </ul>
                      </details>
                    )}
                    {typeof event.details?.reason === 'string' && event.details.reason && (
                      <p className="mt-2 text-xs text-slate-600">السبب: {event.details.reason}</p>
                    )}
                    {event.source !== 'recorded' && <p className="mt-2 text-[11px] text-amber-800">سجل تاريخي جزئي</p>}
                  </li>
                ))}
              </ol>
            </div>}
    </Modal>
  );
}
