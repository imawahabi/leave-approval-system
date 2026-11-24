import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Check, RotateCcw, ShieldCheck, X, Trash2,
  Search, Filter, ChevronDown, Clock3, CheckCircle2, Archive,
  AlertCircle, LogOut, User, Calendar, ArrowUpDown, Shield,
  ArrowLeft, Send, BadgeCheck, History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatDayCount } from '@/utils/date';
import type { Sector, Department, LeadershipMember } from '@/types';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { RankInsignia } from '@/components/RankInsignia';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useBottomNavAnchor } from '@/hooks/useBottomNavAnchor';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
import { PageHeader } from '@/components/PageHeader';
import { PersonName, ResponsivePersonName } from '@/components/PersonName';
import { ExpandableOrgPath } from '@/components/ExpandableOrgPath';
import { LeaveTimelineModal } from '@/components/LeaveTimelineModal';

/* ─── types ─── */
interface ReviewRecord {
  id: string;
  member_name: string;
  member_rank: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  workflow_status?: 'pending_stage_1' | 'pending_stage_2' | 'approved' | 'rejected_stage_1' | 'rejected_stage_2';
  current_approval_stage?: 1 | 2;
  rejection_reason: string | null;
  reviewed_at: string | null;
  file_number?: string;
  civil_id?: string;
  job_title?: string;
  member_id?: string;
  sector?: Sector | null;
  department?: Department | null;
}

type ReviewMember = Pick<LeadershipMember, 'id' | 'full_name' | 'file_number' | 'job_title' | 'sector' | 'department'>;

type Decision = 'approved' | 'rejected' | 'pending' | 'rewind_stage_1';
type ReviewStage = 'undersecretary' | 'minister';

const STAGES: Array<{ value: ReviewStage; label: string; subtitle: string; icon: typeof Shield }> = [
  { value: 'undersecretary', label: 'مكتب المدير العام', subtitle: 'المرحلة الأولى: تدقيق وإحالة إلى مكتب رئيس الجهة', icon: Send },
  { value: 'minister', label: 'مكتب رئيس الجهة', subtitle: 'المرحلة الثانية: العرض على رئيس الجهة وتسجيله', icon: BadgeCheck },
];

const BASE_TABS = [
  {
    value: 'pending' as const,
    icon: Clock3,
    activeBorder: 'border-amber-400',
    activeBg: 'bg-amber-50/70',
    activeText: 'text-amber-950',
    activeRing: 'ring-amber-400/20',
    iconActive: 'bg-amber-100 text-amber-800',
    countActive: 'text-amber-900',
    accentLine: 'bg-amber-500',
  },
  {
    value: 'approved' as const,
    icon: CheckCircle2,
    activeBorder: 'border-emerald-500',
    activeBg: 'bg-emerald-50/70',
    activeText: 'text-emerald-950',
    activeRing: 'ring-emerald-500/20',
    iconActive: 'bg-emerald-100 text-emerald-800',
    countActive: 'text-emerald-900',
    accentLine: 'bg-emerald-600',
  },
  {
    value: 'rejected' as const,
    icon: Archive,
    activeBorder: 'border-slate-400',
    activeBg: 'bg-slate-50/70',
    activeText: 'text-slate-950',
    activeRing: 'ring-slate-400/20',
    iconActive: 'bg-slate-200 text-slate-700',
    countActive: 'text-slate-900',
    accentLine: 'bg-slate-500',
  },
] as const;

const QUICK_ARCHIVE_REASONS = [
  'تعارض مع متطلبات العمل والجاهزية الأمنية',
  'عدم توفر رصيد كافٍ من الإجازات',
  'عدم تحديد الموظف البديل للقيام بالمهام',
  'تزامن الإجازة مع مهام رسمية طارئة',
];

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)].sort((a, b) => String(a).localeCompare(String(b), 'ar'));
}

export function ReviewPage() {
  const { profile, canApprove, isAdmin, hasPermission, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── data ── */
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReviewRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timelineLeaveId, setTimelineLeaveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRequest = useRef(0);

  /* ── logout confirmation ── */
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  /* ── decision modals ── */
  const [target, setTarget] = useState<{ record: ReviewRecord; decision: Decision } | null>(null);
  const [reason, setReason] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<ReactNode | null>(null);

  const handleDeleteLeave = async () => {
    if (!isAdmin || !deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { data, error: deleteRequestError } = await supabase
        .from('leadership_leaves')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id')
        .maybeSingle();
      if (deleteRequestError || !data) {
        setDeleteError('تعذر حذف الإجازة. قد لا تملك صلاحية المدير أو ربما حُذفت مسبقًا؛ حدّث القائمة وحاول مجددًا.');
        return;
      }
      setDeleteTarget(null);
      setDecisionSuccess(<>تم حذف إجازة {deleteTarget.member_rank} / <ResponsivePersonName name={deleteTarget.member_name} /> نهائيًا.</>);
      await refresh();
      window.dispatchEvent(new Event('app:review-updated'));
    } catch {
      setDeleteError('تعذر الاتصال لحذف الإجازة. تحقق من الشبكة ثم حاول مجددًا.');
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── tabs / search / filters ── */
  const requestedTab = searchParams.get('state') || searchParams.get('tab') || searchParams.get('status');
  const tab: ReviewRecord['approval_status'] =
    requestedTab === 'approved' || requestedTab === 'rejected' ? requestedTab : 'pending';

  const canReviewUndersecretary = isAdmin || hasPermission('approve_undersecretary');
  const canReviewMinister = isAdmin || hasPermission('approve_minister');
  const requestedStage = searchParams.get('stage');
  const stage: ReviewStage = requestedStage === 'minister' && canReviewMinister
    ? 'minister'
    : requestedStage === 'undersecretary' && canReviewUndersecretary
      ? 'undersecretary'
      : canReviewUndersecretary
        ? 'undersecretary'
        : 'minister';
  const allowedStages = STAGES.filter((item) => item.value === 'undersecretary' ? canReviewUndersecretary : canReviewMinister);

  const [search, setSearch] = useState('');
  const [debouncedSrch, setDebouncedSrch] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'days' | 'name'>('date');
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);

  /* debounce search */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSrch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /* ── fetch queue ── */
  const refresh = useCallback(async (overrideStage?: ReviewStage) => {
    const request = ++refreshRequest.current;
    const fetchStage = overrideStage || stage;
    setLoading(true);
    const { data, error: fetchErr } = await supabase.rpc('review_queue_scoped', { p_stage: fetchStage });
    if (request !== refreshRequest.current) return;
    if (fetchErr) {
      setError('تعذر تحميل طلبات الإجازة للمراجعة');
    } else {
      const queueRecords = (data || []) as ReviewRecord[];
      const leaveIds = queueRecords.map((r) => r.id);

      if (leaveIds.length > 0) {
        const { data: leavesDetails } = await supabase
          .from('leadership_leaves')
          .select(`
            id,
            leadership_member:leadership_member_id(
              id,
              full_name,
              file_number,
              job_title,
              sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)),
              department:departments(*)
            )
          `)
          .in('id', leaveIds);
        if (request !== refreshRequest.current) return;

        const detailsMap = new Map(
          ((leavesDetails || []) as unknown as Array<{ id: string; leadership_member: ReviewMember | null }>).map((item) => [
            item.id,
            item.leadership_member,
          ])
        );

        const enrichedRecords = queueRecords.map((rec) => {
          const member = detailsMap.get(rec.id);
          return {
            ...rec,
            file_number: member?.file_number,
            job_title: member?.job_title,
            member_id: member?.id,
            sector: member?.sector,
            department: member?.department,
          };
        });

        setRecords(enrichedRecords);
      } else {
        setRecords([]);
      }
      setError(null);
    }
    setLoading(false);
  }, [stage]);

  useEffect(() => {
    if (canApprove) void refresh();
    return () => { refreshRequest.current += 1; };
  }, [canApprove, refresh]);

  /* ── dynamic stage-aware tabs ── */
  const tabs = useMemo(() => [
    {
      ...BASE_TABS[0],
      label: stage === 'undersecretary' ? 'بانتظار التدقيق والإحالة' : 'بانتظار العرض',
      labelShort: stage === 'undersecretary' ? 'بانتظار الإحالة' : 'بانتظار العرض',
      subtitle: stage === 'undersecretary' ? 'طلبات تتطلب التدقيق والإحالة إلى مكتب رئيس الجهة' : 'طلبات بانتظار العرض على رئيس الجهة وتسجيله',
    },
    {
      ...BASE_TABS[1],
      label: stage === 'undersecretary' ? 'تمت الإحالة' : 'تم العرض',
      labelShort: stage === 'undersecretary' ? 'تمت الإحالة' : 'تم العرض',
      subtitle: stage === 'undersecretary' ? 'تم تدقيقها وإحالتها إلى مكتب رئيس الجهة' : 'تم عرضها على رئيس الجهة',
    },
    {
      ...BASE_TABS[2],
      label: 'مؤرشف',
      labelShort: 'مؤرشف',
      subtitle: stage === 'undersecretary' ? 'طلبات أُرشفت في مكتب المدير العام دون عرضها' : 'طلبات أُرشفت في مكتب رئيس الجهة دون عرضها',
    },
  ], [stage]);

  /* ── derived counts ── */
  const counts = useMemo(
    () =>
      Object.fromEntries(
        tabs.map((t) => [
          t.value,
          records.filter((r) => r.approval_status === t.value && r.status !== 'cancelled').length,
        ])
      ) as Record<ReviewRecord['approval_status'], number>,
    [records, tabs]
  );

  /* ── current tab records ── */
  const byTab = useMemo(
    () => records.filter((r) => r.approval_status === tab && r.status !== 'cancelled'),
    [records, tab]
  );

  /* filter options from current tab */
  const rankOptions = useMemo(() => unique(byTab.map((r) => r.member_rank).filter(Boolean)), [byTab]);
  const typeOptions = useMemo(() => unique(byTab.map((r) => r.leave_type).filter(Boolean)), [byTab]);

  /* filtered and sorted records */
  const visible = useMemo(() => {
    let list = byTab;
    if (rankFilter) list = list.filter((r) => r.member_rank === rankFilter);
    if (typeFilter) list = list.filter((r) => r.leave_type === typeFilter);
    if (debouncedSrch.trim()) {
      list = list.filter((r) =>
        arabicSearchMatches([r.member_name, r.member_rank, r.leave_type, r.file_number, r.civil_id, r.job_title, r.sector?.name_ar, r.department?.name_ar], debouncedSrch)
      );
    }
    return list.sort((a, b) => {
      if (sortBy === 'days') return b.total_days - a.total_days;
      if (sortBy === 'name') return a.member_name.localeCompare(b.member_name, 'ar');
      return a.start_date.localeCompare(b.start_date);
    });
  }, [byTab, rankFilter, typeFilter, debouncedSrch, sortBy]);

  const hasFilters = !!rankFilter || !!typeFilter || !!search.trim();

  const clearFilters = () => {
    setSearch('');
    setRankFilter('');
    setTypeFilter('');
  };

  const switchTab = (v: ReviewRecord['approval_status']) => {
    setSearchParams({ stage, state: v });
    clearFilters();
    setShowFilters(false);
  };

  const switchStage = (nextStage: ReviewStage) => {
    if (!allowedStages.some((item) => item.value === nextStage)) return;
    setSearchParams({ stage: nextStage, state: 'pending' });
    clearFilters();
    setShowFilters(false);
  };

  const openDecision = (record: ReviewRecord, decision: Decision) => {
    setDecisionError(null);
    setReason('');
    setTarget({ record, decision });
  };

  /* ── submit decision ── */
  const submit = async () => {
    if (!target || saving) return;
    setSaving(true);
    setDecisionError(null);
    try {
      const isAdminReopen = target.decision === 'pending' && target.record.approval_status === 'rejected' && isAdmin;
      const isAdminRewind = target.decision === 'rewind_stage_1' && isAdmin;
      const isStageOneApproval = target.decision === 'approved' && target.record.current_approval_stage === 1;
      const staged = isAdminReopen || isAdminRewind
        ? await supabase.rpc('admin_reopen_leave', {
          p_leave_id: target.record.id,
          p_target_stage: isAdminRewind ? 1 : target.record.workflow_status === 'rejected_stage_2' ? 2 : 1,
          p_reason: isAdminRewind ? 'إعادة الطلب من مرحلة رئيس الجهة إلى مرحلة المدير العام بواسطة مدير النظام' : 'إعادة فتح بواسطة مدير النظام',
        })
        : await supabase.rpc('review_leave_stage', {
          p_leave_id: target.record.id,
          p_decision: target.decision,
          p_reason: target.decision === 'rejected' ? reason.trim() || null : null,
          p_confirm_forward: isStageOneApproval,
        });
      if (staged.error) {
        setDecisionError(/review_leave_stage|admin_reopen_leave|schema cache|could not find/i.test(staged.error.message || '')
          ? 'خدمة الموافقات المرحلية غير متاحة حاليًا. تواصل مع مدير النظام قبل إعادة المحاولة.'
          : 'تعذر حفظ الإجراء. ربما تغيرت حالة الطلب؛ أغلق النافذة وحدّث القائمة ثم حاول مجددًا.');
        return;
      }
      setTarget(null);
      setReason('');
      // Bug fix: after rewind to stage 1, switch UI to undersecretary+pending so the record is visible
      if (target.decision === 'rewind_stage_1') {
        setSearchParams({ stage: 'undersecretary', state: 'pending' });
        await refresh('undersecretary');
      } else {
        await refresh();
      }
      setDecisionSuccess(target.decision === 'approved'
        ? target.record.current_approval_stage === 1
          ? <>تم تدقيق إجازة <ResponsivePersonName name={target.record.member_name} /> وإحالتها إلى مكتب رئيس الجهة.</>
          : <>تم تسجيل عرض إجازة <ResponsivePersonName name={target.record.member_name} /> على رئيس الجهة.</>
        : target.decision === 'rejected'
          ? <>تمت أرشفة طلب <ResponsivePersonName name={target.record.member_name} /> كمرجع لطلب لم يُعرض. يمكن لمدير النظام إعادة فتحه عند الحاجة.</>
          : target.decision === 'rewind_stage_1'
            ? <>أُعيد طلب <ResponsivePersonName name={target.record.member_name} /> إلى مكتب المدير العام؛ ستجده في قائمة «بانتظار التدقيق والإحالة».</>
            : <>أُعيد طلب <ResponsivePersonName name={target.record.member_name} /> إلى قائمة الانتظار.</>);
      window.dispatchEvent(new Event('app:review-updated'));
    } catch {
      setDecisionError('تعذر الاتصال لحفظ الإجراء. تحقق من الشبكة ثم حاول مجددًا.');

    } finally {
      setSaving(false);
    }
  };

  const approverMode = profile?.account_type === 'approver' || profile?.role === 'approver';
  const reviewScrollRef = useRef<HTMLElement | null>(null);
  const isNavVisible = useScrollDirection(8, approverMode ? reviewScrollRef : null);
  const activeStageLabel = stage === 'undersecretary' ? 'مكتب المدير العام' : 'مكتب رئيس الجهة';
  const navRef = useBottomNavAnchor(approverMode);
  if (!canApprove) return <ErrorState message="لا تملك صلاحية مراجعة الإجازات" />;

  const ContentWrapper = approverMode ? 'main' : 'div';

  return (
    <ContentWrapper
      className={
        approverMode
          ? 'h-[100dvh] overflow-y-auto overscroll-y-contain bg-slate-50 px-4 sm:px-6 lg:px-8 pt-24 sm:pt-6 pb-28 sm:pb-12 max-w-7xl mx-auto space-y-6'
          : 'space-y-6 max-w-7xl mx-auto w-full'
      }
      dir="rtl"
      ref={approverMode ? (node) => { reviewScrollRef.current = node; } : undefined}
    >
      {approverMode && <div className="fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white px-4 flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-2 min-w-0"><img src="/entity-logo.png" alt="شعار الجهة الحكومية" className="w-9 h-9 object-contain" /><div className="min-w-0"><strong className="block text-sm text-slate-900 truncate">مراجعة الإجازات</strong><span className="block text-xs text-slate-500 truncate">نظام إدارة واعتماد الإجازات</span></div></div>
        <div className="flex items-center gap-1"><button type="button" className="p-2 rounded-lg hover:bg-slate-100" aria-label="إعدادات حسابي" onClick={() => setAccountOpen(true)}><User className="w-5 h-5" /></button><button type="button" className="p-2 rounded-lg hover:bg-red-50 text-slate-600" aria-label="تسجيل الخروج" onClick={() => setShowLogoutConfirm(true)}><LogOut className="w-5 h-5" /></button></div>
      </div>}
      {/* ── Official Page Header ── */}
      <PageHeader
        title={activeStageLabel}
        subtitle={stage === 'undersecretary' ? 'تدقيق طلبات إجازات الموظفين وإحالتها إلى مكتب رئيس الجهة' : 'عرض طلبات الإجازة على رئيس الجهة وتسجيل «تم العرض»'}
        icon={<ShieldCheck className="w-5 h-5 text-teal-700" />}
        desktopVisible={approverMode}
        actions={
          approverMode ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                title="حسابي"
                aria-label="حسابي"
                className="btn-secondary text-xs px-2.5 sm:px-3 py-1.5 h-auto inline-flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">حسابي</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="btn-secondary text-xs px-2.5 sm:px-3 py-1.5 h-auto inline-flex items-center gap-1.5 text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">خروج</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {decisionSuccess && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{decisionSuccess}</span>
          </div>
          <button type="button" onClick={() => setDecisionSuccess(null)} aria-label="إغلاق رسالة نجاح الإجراء" className="shrink-0 rounded-md p-1 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Official Approval Stage Selector (Minimal Segmented Switcher) ── */}
      {allowedStages.length > 1 && (
        <div className="p-1 rounded-2xl bg-slate-200/70 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-1.5 select-none" role="tablist" aria-label="مرحلة الطلب">
          {allowedStages.map((item) => {
            const isSelected = stage === item.value;
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                role="tab"
                type="button"
                aria-selected={isSelected}
                onClick={() => switchStage(item.value)}
                className={`rounded-xl px-4 py-2.5 text-right transition-all flex items-center justify-between gap-3 cursor-pointer ${isSelected
                  ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-medium'
                  }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isSelected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-300/60 text-slate-600'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs sm:text-sm truncate">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-slate-400 font-normal truncate">
                      {item.subtitle}
                    </span>
                  </div>
                </div>

              </button>
            );
          })}
        </div>
      )}

      {/* ── Official State Filter Tabs ── */}
      <div>
        <nav
          className="grid grid-cols-3 gap-2 sm:gap-3.5"
          aria-label="حالة المراجعة"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            const isSelected = tab === item.value;
            const count = counts[item.value] ?? 0;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => switchTab(item.value)}
                aria-current={isSelected ? 'page' : undefined}
                className={`group relative rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 text-right transition-all flex flex-col justify-between select-none cursor-pointer ${isSelected
                  ? `${item.activeBg} ${item.activeBorder} ${item.activeText} shadow-xs ring-1 ${item.activeRing}`
                  : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
              >
                {/* Top strip with Icon and Count */}
                <div className="flex items-center justify-between gap-1.5 sm:gap-3 w-full">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-colors shrink-0 ${isSelected
                      ? item.iconActive
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-700'
                      }`}
                  >
                    <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </span>

                  <strong
                    className={`text-base sm:text-2xl font-black tabular-nums transition-colors ${isSelected
                      ? item.countActive
                      : 'text-slate-800 group-hover:text-slate-900'
                      }`}
                  >
                    {count}
                  </strong>
                </div>

                {/* Bottom section with label and subtitle */}
                <div className="mt-2 sm:mt-3 flex flex-col w-full text-right">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs sm:text-sm font-bold truncate block">
                      <span className="sm:hidden">{item.labelShort}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </span>

                  </div>
                  <span className="text-[11px] text-slate-500 truncate hidden sm:block mt-0.5">
                    {item.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Official Search & Filter Toolbar ── */}
      <div className="card p-3.5 sm:p-4 space-y-3 bg-white border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Live Search */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الموظف، المسمى الوظيفي، أو نوع الإجازة…"
              className="input-field pr-10 pl-9 text-sm w-full"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="مسح نص البحث"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Leave Type Filter */}
          <div className="relative sm:w-52">
            <select
              className="input-field mobile-filter-control text-sm cursor-pointer"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">كل أنواع الإجازات</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Rank Filter Toggle button */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-secondary text-sm px-3.5 h-11 shrink-0 inline-flex items-center justify-center gap-2 cursor-pointer ${rankFilter
              ? 'border-teal-600 bg-teal-50/70 text-teal-900 font-bold'
              : ''
              }`}
            aria-expanded={showFilters}
          >
            <Filter className="w-4 h-4" />
            <span>تصفية المسمى الوظيفي</span>
            {rankFilter ? (
              <span className="w-2 h-2 rounded-full bg-teal-600" />
            ) : (
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            )}
          </button>
        </div>

        {/* Expandable Filter Row */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 animate-fade-in bg-slate-50/50 p-3 rounded-xl border border-slate-200/60">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              تصفية المسمى الوظيفي:
            </label>
            <select
              className="input-field mobile-filter-control text-xs h-10 w-full sm:max-w-xs bg-white cursor-pointer"
              value={rankFilter}
              onChange={(e) => setRankFilter(e.target.value)}
            >
              <option value="">كل المسميات الوظيفية المتوفرة ({rankOptions.length})</option>
              {rankOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        {/* Active Filter Chips */}
        {hasFilters && (
          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-400 font-medium">تصفية نشطة:</span>
            {search.trim() && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-teal-50 border border-teal-200 text-teal-800 px-2.5 py-1 rounded-lg font-medium">
                بحث: "{search.trim()}"
                <button onClick={() => setSearch('')} aria-label="إزالة البحث" className="hover:text-red-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {rankFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                المسمى الوظيفي: {rankFilter}
                <button onClick={() => setRankFilter('')} aria-label="إزالة فلتر المسمى الوظيفي" className="hover:text-red-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {typeFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                النوع: {typeFilter}
                <button onClick={() => setTypeFilter('')} aria-label="إزالة فلتر النوع" className="hover:text-red-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-red-600 hover:text-red-800 hover:underline flex items-center gap-1 mr-1.5 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> مسح الكل
            </button>
          </div>
        )}

        {/* Bottom Bar: Stats on Right & Sort on Left */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md tabular-nums">
              {visible.length} من {byTab.length} طلب
            </span>

          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>الترتيب:</span>
            </div>
            <select
              className="input-field h-8 text-xs sm:w-40 py-0 px-2.5 cursor-pointer bg-white"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'days' | 'name')}
            >
              <option value="date">تاريخ البداية</option>
              <option value="days">أطول مدة</option>
              <option value="name">أبجدياً بالاسم</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Error Callout ── */}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 p-4 text-sm flex items-center justify-between gap-3 border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => refresh()} className="btn-secondary text-xs bg-white">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── List of Records ── */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-8 sm:p-12">
          <EmptyState
            icon={<ShieldCheck className="w-8 h-8 text-slate-400" />}
            title={
              hasFilters
                ? 'لا توجد نتائج مطابقة لمعايير البحث'
                : tab === 'pending'
                  ? 'لا توجد طلبات منتظرة'
                  : tab === 'approved'
                    ? (stage === 'undersecretary' ? 'لا توجد طلبات محالة حاليًا' : 'لا توجد إجازات تم عرضها حاليًا')
                    : 'لا توجد طلبات مؤرشفة'
            }
            message={
              hasFilters
                ? 'جرّب تعديل البحث أو الفلاتر لعرض الطلبات.'
                : tab === 'pending'
                  ? 'لا توجد طلبات بانتظار الإجراء في هذا المكتب.'
                  : undefined
            }
            action={
              hasFilters ? (
                <button className="btn-secondary" onClick={clearFilters}>
                  مسح الفلاتر
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((record) => {
            const isPending = record.approval_status === 'pending';
            const isApproved = record.approval_status === 'approved';
            const isRejected = record.approval_status === 'rejected';

            return (
              <article
                key={record.id}
                className="group rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden shadow-xs"
              >
                {/* Official Card Header */}
                <div className="p-4 sm:p-5 pb-3.5">
                  {/* Keep identity full-width; the status label gets its own row on phones. */}
                  <div className="flex flex-col items-stretch gap-2.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center shadow-2xs">
                          <RankInsignia rank={record.member_rank} size="md" />
                        </div>
                        {record.file_number && (
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200/70 px-1.5 py-0.5 rounded mt-1.5 text-center" title={`رقم الملف: ${record.file_number}`}>
                            {record.file_number}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        {/* Name and Rank - clickable to leader detail */}
                        <h2 className="font-bold text-slate-900 text-sm tracking-tight leading-snug">
                          {record.member_id ? (
                            <Link
                              to={`/leaders/${record.member_id}`}
                              className="hover:text-primary-700 transition-colors hover:underline decoration-primary-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <PersonName rank={record.member_rank} name={record.member_name} size="sm" />
                            </Link>
                          ) : (
                            <PersonName rank={record.member_rank} name={record.member_name} size="sm" />
                          )}
                        </h2>

                        {/* Leader Job Title */}
                        {record.job_title && (
                          <p className="text-xs font-semibold text-slate-700 leading-snug mt-1">
                            {record.job_title}
                          </p>
                        )}

                        {/* Leader Sector / Org Path */}
                        {(record.sector?.name_ar || record.department?.name_ar) && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            <ExpandableOrgPath sector={record.sector} department={record.department} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Official Status Badge: separate from the name so long labels never squeeze it. */}
                    <div className="flex flex-wrap justify-start gap-2">
                      <Badge
                        label={
                          isPending
                            ? (stage === 'undersecretary' ? 'بانتظار التدقيق والإحالة' : 'بانتظار العرض')
                            : isApproved
                              ? (stage === 'undersecretary' ? 'تمت الإحالة' : 'تم العرض')
                              : 'مؤرشف'
                        }
                        color={
                          isPending
                            ? 'text-amber-800'
                            : isApproved
                              ? 'text-emerald-800'
                              : 'text-slate-700'
                        }
                        bg={
                          isPending
                            ? 'bg-amber-50 border-amber-300'
                            : isApproved
                              ? 'bg-emerald-50 border-emerald-300'
                              : 'bg-slate-50 border-slate-300'
                        }
                        dot={
                          isPending
                            ? 'bg-amber-500'
                            : isApproved
                              ? 'bg-emerald-500'
                              : 'bg-slate-400'
                        }
                      />
                      {stage === 'undersecretary' && isApproved && record.workflow_status === 'approved' && (
                        <Badge
                          label="تم العرض"
                          color="text-teal-800"
                          bg="bg-teal-50 border-teal-300"
                          dot="bg-teal-500"
                        />
                      )}
                    </div>
                  </div>

                  {/* Leave Details Capsule (بادج نوع الإجازة + مدة الإجازة + الفترة) */}
                  <div className="mt-3.5 rounded-xl bg-slate-50/90 border border-slate-200/70 p-3 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* بادج نوع الإجازة */}
                      <span className="font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-lg text-xs">
                        {record.leave_type}
                      </span>

                      {/* مدة الإجازة */}
                      <span className="font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs shadow-2xs">
                        المدة: {formatDayCount(record.total_days)}
                      </span>

                      {/* تاريخ الإجراء عند توفره */}
                      {record.reviewed_at && !isPending && (
                        <span className="text-slate-400 text-[11px] mr-1">
                          (الإجراء: <bdi>{formatDate(record.reviewed_at.slice(0, 10))}</bdi>)
                        </span>
                      )}
                    </div>

                    {/* الفترة */}
                    <div className="flex items-center gap-2 text-slate-700 font-medium">
                      <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        الفترة: <bdi className="font-bold text-slate-900">{formatDate(record.start_date)}</bdi>
                      </span>
                      <ArrowLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        <bdi className="font-bold text-slate-900">{formatDate(record.end_date)}</bdi>
                      </span>
                    </div>
                  </div>

                  {/* Archive reason */}
                  {isRejected && (
                    <div className="mt-3 rounded-xl bg-slate-50/80 border border-slate-200/70 p-3 text-xs text-slate-700 flex items-start gap-2.5">
                      <Archive className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-bold">سبب الأرشفة: </span>
                        <span>{record.rejection_reason || 'لم يُذكر سبب للأرشفة.'}</span>
                      </div>
                    </div>
                  )}
                </div>



                {/* Official Actions Footer */}
                <div className="px-4 sm:px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2 mt-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-secondary text-slate-700 border-slate-200 bg-white hover:bg-slate-100 text-xs h-8 w-8 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 cursor-pointer inline-flex items-center gap-1.5 font-medium"
                        aria-label="تسلسل الإجراءات"
                        title="تسلسل الإجراءات"
                        onClick={() => setTimelineLeaveId(record.id)}
                      >
                        <History className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">تسلسل الإجراءات</span>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        aria-label={`حذف إجازة ${record.member_rank} / ${record.member_name} نهائيًا`}
                        title="حذف الإجازة نهائيًا"
                        className="btn-secondary text-red-700 border-red-200 bg-white hover:bg-red-50 text-xs h-8 w-8 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 cursor-pointer inline-flex items-center gap-1.5 font-medium"
                        onClick={() => { setDeleteError(null); setDeleteTarget(record); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">حذف نهائي</span>
                      </button>
                    )}
                    {isPending && (
                      <>
                        <button
                          type="button"
                          className="btn-primary bg-teal-700 hover:bg-teal-800 text-white text-xs px-3.5 py-1.5 h-auto shadow-xs cursor-pointer inline-flex items-center gap-1.5 font-semibold"
                          onClick={() => openDecision(record, 'approved')}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {stage === 'undersecretary'
                              ? 'تدقيق وإحالة'
                              : 'تم العرض'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-slate-700 border-slate-200 bg-white hover:bg-slate-100 text-xs px-3 py-1.5 h-auto cursor-pointer inline-flex items-center gap-1.5 font-semibold"
                          onClick={() => openDecision(record, 'rejected')}
                        >
                          <Archive className="w-3.5 h-3.5 text-slate-500" />
                          <span>أرشفة الطلب</span>
                        </button>
                      </>
                    )}

                    {isApproved && stage === 'minister' && (isAdmin || hasPermission('return_review_pending')) && record.workflow_status === 'approved' && (
                      <button
                        type="button"
                        className="btn-secondary text-slate-700 hover:bg-white text-xs px-3 py-1.5 h-auto cursor-pointer inline-flex items-center gap-1.5 font-medium"
                        onClick={() => openDecision(record, 'pending')}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>إلغاء تسجيل العرض</span>
                      </button>
                    )}

                    {isRejected && isAdmin && (
                      <button
                        type="button"
                        className="btn-secondary text-slate-700 hover:bg-white text-xs px-3 py-1.5 h-auto cursor-pointer inline-flex items-center gap-1.5 font-medium"
                        onClick={() => openDecision(record, 'pending')}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        <span>إعادة فتح الطلب</span>
                      </button>
                    )}

                    {record.workflow_status === 'pending_stage_2' && isAdmin && (
                      <button
                        type="button"
                        className="btn-secondary text-indigo-700 border-indigo-200 bg-white hover:bg-indigo-50 text-xs px-3 py-1.5 h-auto cursor-pointer inline-flex items-center gap-1.5 font-medium"
                        onClick={() => openDecision(record, 'rewind_stage_1')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إعادة لمرحلة المدير العام</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Mobile Navigation Bar (Approver mode) ── */}
      <LeaveTimelineModal leaveId={timelineLeaveId} onClose={() => setTimelineLeaveId(null)} />
      {approverMode && (
        <nav
          ref={navRef}
          className={`mobile-nav sm:hidden transition-transform duration-300 ease-in-out will-change-transform ${isNavVisible ? 'shadow-lg' : 'mobile-nav--hidden pointer-events-none'
            }`}
          aria-label="تنقل مراجعة الإجازات"
        >
          <div className="mx-auto flex max-w-xl items-center justify-around px-2">
            {tabs.map((item) => {
              const Icon = item.icon;
              const isSelected = tab === item.value;
              const count = counts[item.value] ?? 0;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => switchTab(item.value)}
                  className={`mobile-nav-item relative ${isSelected ? 'mobile-nav-item-active' : ''}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="text-xs">{item.labelShort}</span>
                  {count > 0 && (
                    <span className="absolute -top-1 right-2 min-w-4 h-4 px-0.5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-bold">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Confirm Approve / Reopen Modal ── */}
      <ConfirmDialog
        open={!!target && target.decision !== 'rejected'}
        onClose={() => { setTarget(null); setDecisionError(null); }}
        onConfirm={submit}
        busy={saving}
        closeOnConfirm={false}
        error={decisionError}
        title={
          target?.decision === 'approved'
            ? target?.record.current_approval_stage === 1
              ? 'تأكيد التدقيق والإحالة'
              : 'تأكيد تسجيل العرض'
            : target?.decision === 'rewind_stage_1'
              ? 'إعادة الإجازة إلى مرحلة المدير العام'
              : target?.record.approval_status === 'rejected'
                ? 'إعادة فتح طلب الإجازة'
                : 'إلغاء تسجيل العرض'
        }
        message={
          target?.decision === 'approved'
            ? `هل تؤكد ${target?.record.current_approval_stage === 1 ? 'تدقيق الإجازة وإحالتها إلى مكتب رئيس الجهة' : 'تسجيل عرض الإجازة على رئيس الجهة'}؟${target?.record.current_approval_stage === 1 ? ' ستُحال تلقائيًا إلى مكتب رئيس الجهة لعرضها على رئيس الجهة بعد التأكيد.' : ' ستظهر الإجازة في السجلات والتقارير بعد تسجيل «تم العرض».'}`
            : target?.decision === 'rewind_stage_1'
              ? 'سيتم نقل الطلب من مرحلة رئيس الجهة إلى مرحلة المدير العام. هل تؤكد؟'
              : target?.record.approval_status === 'rejected'
                ? 'سيعاد فتح الطلب ليعود إلى حالة قيد المراجعة. هل تؤكد؟'
                : 'سيتم إلغاء تسجيل عرض الإجازة وإعادتها إلى قائمة «بانتظار العرض». هل تؤكد؟'
        }
        context={target?.record && (
          <div className="rounded-2xl border border-primary-200/70 bg-primary-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[11px] font-medium text-primary-700 mb-0.5">الموظف</span>
                <strong className="block text-sm text-primary-950 truncate">{target.record.member_rank} / <ResponsivePersonName name={target.record.member_name} /></strong>
              </div>
              <span className="shrink-0 rounded-full bg-white border border-primary-200 px-2.5 py-1 text-[11px] font-semibold text-primary-800">{target.record.leave_type}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary-800/80">
              <span>من {formatDate(target.record.start_date)}</span>
              <span>إلى {formatDate(target.record.end_date)}</span>
              <span>{formatDayCount(target.record.total_days)}</span>
            </div>
          </div>
        )}
        confirmLabel={saving ? 'جارٍ تنفيذ الإجراء...' : target?.decision === 'approved'
          ? target?.record.current_approval_stage === 1 ? 'تدقيق وإحالة' : 'تم العرض'
          : target?.decision === 'rewind_stage_1' ? 'إعادة لمرحلة المدير العام'
            : 'تأكيد'}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(null); } }}
        onConfirm={() => void handleDeleteLeave()}
        busy={deleteLoading}
        closeOnConfirm={false}
        title="حذف الإجازة نهائيًا"
        message={<>سيؤدي هذا إلى حذف طلب إجازة {deleteTarget?.member_rank ?? ''} / <ResponsivePersonName name={deleteTarget?.member_name} /> نهائيًا مع سجل مراحل المراجعة المرتبط به. سيبقى أثر الحذف في سجل العمليات. لا يمكن التراجع عن ذلك. هل تريد المتابعة؟</>}
        confirmLabel={deleteLoading ? 'جارٍ الحذف...' : 'حذف نهائي'}
        danger
        error={deleteError}
        context={deleteTarget && (
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-900">
            {deleteTarget.member_rank} / <ResponsivePersonName name={deleteTarget.member_name} /> · {deleteTarget.leave_type}
          </div>
        )}
      />

      {/* ── Archive modal with optional reasons ── */}
      <Modal
        open={!!target && target.decision === 'rejected'}
        onClose={() => {
          if (!saving) {
            setTarget(null);
            setReason('');
            setDecisionError(null);
          }
        }}
        title="أرشفة طلب الإجازة"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              className="btn-secondary h-11 w-full sm:w-48"
              disabled={saving}
              onClick={() => {
                setTarget(null);
                setReason('');
                setDecisionError(null);
              }}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn-primary h-11 w-full sm:w-48"
              disabled={saving}
              onClick={submit}
            >
              {saving ? 'جارٍ الحفظ...' : 'تأكيد الأرشفة'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {decisionError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {decisionError}
            </p>
          )}
          <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs sm:text-sm text-amber-900">
            <strong>طلب الموظف:</strong> {target?.record.member_rank} / <ResponsivePersonName name={target?.record.member_name} /> (
            {target?.record.leave_type} - {formatDayCount(target?.record.total_days ?? 0)})
          </div>

          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm text-slate-700">سيُحفظ الطلب في الأرشيف كمرجع لطلب لم يُعرض على رئيس الجهة، ولن يُدرج ضمن إحصائيات الإجازات وتقاريرها. إعادة فتحه متاحة لمدير النظام.</p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              أسباب مقترحة (اختياري):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ARCHIVE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${reason === r
                    ? 'bg-slate-200 border-slate-400 text-slate-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              سبب الأرشفة (اختياري):
            </label>
            <textarea
              className="input-field min-h-24 w-full"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="يمكنك توضيح سبب الأرشفة هنا…"
            />
            <span className="text-[11px] text-slate-400 block mt-1 text-left">
              {reason.length} / 500 حرف
            </span>
          </div>
        </div>
      </Modal>

      {/* ── Logout Confirmation Dialog ── */}
      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={signOut}
        title="تأكيد تسجيل الخروج"
        message="هل أنت متأكد من رغبتك في تسجيل الخروج من منصة مراجعة الإجازات؟"
        confirmLabel="تسجيل الخروج"
        cancelLabel="إلغاء"
        danger
      />
      <AccountSettingsModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </ContentWrapper>
  );
}
