import { CalendarDays, Clock3, History, Pencil } from 'lucide-react';
import { Modal } from './Modal';
import { ResponsivePersonName } from './PersonName';
import { formatDate } from '@/utils/date';
import type { LeadershipLeave } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  leaves: LeadershipLeave[];
  loading: boolean;
  error: string | null;
  onEdit: (leave: LeadershipLeave) => void;
  canEdit: (leave: LeadershipLeave) => boolean;
}

function stageLabel(leave: LeadershipLeave) {
  if (leave.status === 'cancelled') return 'أُلغيت الإجازة';
  if (leave.approval_status === 'approved') return 'تم عرض الإجازة';
  if (leave.approval_status === 'rejected') return 'أُرشف الطلب';
  if (leave.workflow_status === 'pending_stage_2' || leave.current_approval_stage === 2)
    return 'الطلب الآن لدى مكتب رئيس الجهة · بانتظار العرض';
  return 'الطلب الآن لدى مكتب المدير العام · بانتظار التدقيق والإحالة';
}

function LeaveRow({ leave, onEdit, canEdit }: { leave: LeadershipLeave; onEdit: Props['onEdit']; canEdit: Props['canEdit'] }) {
  const pending = leave.approval_status === 'pending' && leave.status !== 'cancelled';
  return <article className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-sm font-bold text-slate-900 leading-6">
          {leave.leadership_member?.rank ? `${leave.leadership_member.rank} / ` : ''}<ResponsivePersonName name={leave.leadership_member?.full_name ?? 'الموظف'} />
        </h4>
        <p className="text-xs text-slate-500">{leave.leave_type?.name_ar ?? 'إجازة'} · {formatDate(leave.start_date)} إلى {formatDate(leave.end_date)}</p>
      </div>
      <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${pending ? 'border-amber-200 bg-amber-50 text-amber-800' : leave.approval_status === 'approved' && leave.status !== 'cancelled' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
        {pending ? 'لم تُعرض بعد' : leave.status === 'cancelled' ? 'ملغاة' : leave.approval_status === 'approved' ? 'تم العرض' : 'مؤرشف'}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5 text-xs">
      <span className="inline-flex items-center gap-1.5 text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> أُنشئ الطلب: <bdi className="text-slate-700">{formatDate(leave.created_at)}</bdi></span>
      {pending && canEdit(leave) && <button type="button" onClick={() => onEdit(leave)} className="inline-flex items-center gap-1 text-primary-700 hover:underline"><Pencil className="h-3.5 w-3.5" /> تعديل الطلب</button>}
    </div>
    <p className={`mt-2 text-xs leading-5 ${pending ? 'text-amber-800' : 'text-slate-600'}`}>{stageLabel(leave)}</p>
    {leave.approval_status === 'rejected' && leave.rejection_reason && <p className="mt-1 text-xs text-slate-600">سبب الأرشفة: {leave.rejection_reason}</p>}
  </article>;
}

export function LeaveTrackingModal({ open, onClose, leaves, loading, error, onEdit, canEdit }: Props) {
  const sorted = [...leaves].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const awaiting = sorted.filter(leave => leave.approval_status === 'pending' && leave.status !== 'cancelled');
  const history = sorted.filter(leave => leave.approval_status !== 'pending' || leave.status === 'cancelled');
  return <Modal open={open} onClose={onClose} title="تتبع طلبات إجازات الموظفين" size="lg">
    <div dir="rtl" className="space-y-5">
      <p className="text-sm text-slate-600">حالة إجازات الموظفين ضمن نطاق صلاحياتك، من تاريخ تقديمها حتى تسجيل العرض.</p>
      {loading && <p role="status" className="text-sm text-slate-500">جارٍ تحديث حالات الطلبات...</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">تعذر تحميل حالات الطلبات. أغلق النافذة وحاول مرة أخرى.</p>}
      <section aria-label="طلبات لم تُعرض بعد">
        <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-900"><Clock3 className="h-4 w-4 text-amber-700" /> لم تُعرض بعد <span className="font-normal text-slate-500">({awaiting.length})</span></h3>
        {awaiting.length ? <div className="space-y-2">{awaiting.map(leave => <LeaveRow key={leave.id} leave={leave} onEdit={onEdit} canEdit={canEdit} />)}</div> : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">لا توجد طلبات بانتظار العرض.</p>}
      </section>
      <section aria-label="السجل السابق" className="border-t border-slate-100 pt-4">
        <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-slate-600" /> السجل السابق <span className="font-normal text-slate-500">({history.length})</span></h3>
        {history.length ? <div className="space-y-2">{history.map(leave => <LeaveRow key={leave.id} leave={leave} onEdit={onEdit} canEdit={canEdit} />)}</div> : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">لم تُسجل إجازات سابقة بعد.</p>}
      </section>
    </div>
  </Modal>;
}
