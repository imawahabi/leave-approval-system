import { CheckCircle2, Clock3, Building2 } from 'lucide-react';

export function PendingLeaveProgress({ workflowStatus, currentStage }: { workflowStatus?: string; currentStage?: number }) {
  const atMinister = workflowStatus === 'pending_stage_2' || (!workflowStatus && currentStage === 2);
  if (workflowStatus && !workflowStatus.startsWith('pending_stage_')) return null;
  return (
    <div dir="rtl" className="mt-3 rounded-xl border border-primary-200 bg-primary-50/50 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">طلبك الآن لدى</p>
          <p className="mt-0.5 text-sm font-semibold text-primary-900">{atMinister ? 'مكتب رئيس الجهة' : 'مكتب المدير العام'}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{atMinister ? 'بانتظار العرض على رئيس الجهة وتسجيله.' : 'بانتظار تدقيق الطلب وإحالته إلى مكتب رئيس الجهة.'}</p>
        </div>
      </div>
      <ol aria-label="حالة طلب الإجازة" className="mt-3 grid grid-cols-1 gap-2 border-t border-primary-100 pt-3 sm:grid-cols-3">
        <li className="flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />تم تقديم الطلب</li>
        <li aria-current="step" className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />{atMinister ? 'بانتظار العرض' : 'بانتظار التدقيق والإحالة'}</li>
        <li className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" aria-hidden="true" />لم يُسجّل العرض بعد</li>
      </ol>
    </div>
  );
}
