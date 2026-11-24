import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plane, Search, Filter, Plus, Ban, Pencil, Trash2,
  History, X, RotateCcw, ChevronDown, ChevronUp,
  Layers, UserCheck, CalendarClock, CheckCircle2, ArrowUpDown,
} from 'lucide-react';
import { useAllLeaves, useSectors, useLeaveTypes, useAssistantUndersecretaries } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LeaveFormModal } from '@/components/LeaveFormModal';
import { LeaveTimelineModal } from '@/components/LeaveTimelineModal';
import { LeaveTrackingModal } from '@/components/LeaveTrackingModal';
import { PrintReportHeader, PrintReportFooter } from '@/components/PrintReportHeader';
import { PersonName, ResponsivePersonName } from '@/components/PersonName';
import { RankInsignia } from '@/components/RankInsignia';
import { statusConfig } from '@/constants';
import { formatDate, formatDayCount, getLeaveStatus, getRemainingLabel, isCurrentlyOnLeave } from '@/utils/date';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import type { LeadershipLeave } from '@/types';
import { formatSectorOption, sectorInUnit } from '@/utils/organization';
import { permissionCoversMember } from '@/utils/permissions';
import { ExpandableOrgPath } from '@/components/ExpandableOrgPath';

export function LeavesPage() {
  const { isAdmin, permissions, hasPermission, user } = useAuth();
  const canCreateLeave = isAdmin || hasPermission('create_leave');
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const requestedState = searchParams.get('state');
  const statusFilter = ['active', 'upcoming', 'completed', 'cancelled'].includes(requestedState ?? '')
    ? requestedState!
    : 'all';
  const sectorFilter = searchParams.get('sector') ?? '';
  const undersecretaryFilter = searchParams.get('undersecretary') ?? '';
  const leaveTypeFilter = searchParams.get('type') ?? '';
  const requestedSort = searchParams.get('sort');
  const sortBy = requestedSort === 'latest' || requestedSort === 'name' || requestedSort === 'days' || requestedSort === 'end' ? requestedSort : 'soon';
  const sortDirection = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [trackingOpen, setTrackingOpen] = useState(false);
  useEffect(() => { if (searchParams.get('tracking') === '1') setTrackingOpen(true); }, [searchParams]);
  const closeTracking = () => {
    setTrackingOpen(false);
    if (searchParams.has('tracking')) {
      const next = new URLSearchParams(searchParams);
      next.delete('tracking');
      setSearchParams(next, { replace: true });
    }
  };
  const [formOpen, setFormOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeadershipLeave | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeadershipLeave | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadershipLeave | null>(null);
  const [timelineLeaveId, setTimelineLeaveId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  const { sectors } = useSectors();
  const { undersecretaries } = useAssistantUndersecretaries();
  const canEditLeave = (leave: LeadershipLeave) => {
    const member = leave.leadership_member;
    if (!member) return false;
    return isAdmin || (
      (leave.created_by === user?.id && permissionCoversMember(permissions, 'edit_own_leave', member, sectors, undersecretaries)) ||
      permissionCoversMember(permissions, 'edit_any_leave', member, sectors, undersecretaries)
    );
  };
  const canCancelLeave = (leave: LeadershipLeave) => {
    const member = leave.leadership_member;
    if (!member) return false;
    return isAdmin || (
      (leave.created_by === user?.id && permissionCoversMember(permissions, 'cancel_own_leave', member, sectors, undersecretaries)) ||
      permissionCoversMember(permissions, 'cancel_any_leave', member, sectors, undersecretaries)
    );
  };
  const { leaveTypes } = useLeaveTypes();
  const { leaves, loading, error, refetch } = useAllLeaves({ approval: 'approved' });
  const { leaves: trackedLeaves, loading: trackingLoading, error: trackingError, refetch: refetchAllRequests } = useAllLeaves();
  const pendingSubmittedCount = trackedLeaves.filter(leave => leave.approval_status === 'pending' && leave.status !== 'cancelled').length;
  useEffect(() => { if (trackingOpen) void refetchAllRequests(); }, [trackingOpen, refetchAllRequests]);

  const setFilter = (key: 'state' | 'sector' | 'undersecretary' | 'type', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || (key === 'state' && value === 'all')) next.delete(key);
    else next.set(key, value);
    if (key === 'undersecretary') next.delete('sector');
    setSearchParams(next, { replace: key !== 'state' });
  };

  const toggleSort = (key: 'name' | 'latest' | 'end' | 'days') => {
    const next = new URLSearchParams(searchParams);
    const direction = sortBy === key
      ? (sortDirection === 'asc' ? 'desc' : 'asc')
      : (key === 'latest' || key === 'days' ? 'desc' : 'asc');
    next.set('sort', key);
    if (direction === 'asc') next.delete('dir');
    else next.set('dir', direction);
    setSearchParams(next, { replace: true });
  };

  const chooseSort = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'soon') next.delete('sort');
    else next.set('sort', key);
    if (key === 'latest' || key === 'days') next.set('dir', 'desc');
    else next.delete('dir');
    setSearchParams(next, { replace: true });
  };

  const sortIndicator = (key: 'name' | 'latest' | 'end' | 'days') => sortBy !== key
    ? <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
    : sortDirection === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5" />
      : <ChevronDown className="w-3.5 h-3.5" />;

  const clearAllFilters = () => {
    setSearch('');
    const next = new URLSearchParams(searchParams);
    next.delete('sector');
    next.delete('undersecretary');
    next.delete('type');
    next.delete('state');
    setSearchParams(next);
  };

  const leaveState = (leave: LeadershipLeave) => {
    const state = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
    return state === 'returning_soon' ? 'active' : state;
  };

  /* Filter by sector, leave type, and live search */
  const scoped = useMemo(() => {
    return leaves.filter((leave) => {
      const matchesSector =
        !sectorFilter ||
        leave.leadership_member?.sector_id === sectorFilter ||
        leave.leadership_member?.sector?.id === sectorFilter;
      const matchesUndersecretary = !undersecretaryFilter ||
        sectorInUnit(leave.leadership_member?.sector, undersecretaryFilter, undersecretaries);

      const matchesType =
        !leaveTypeFilter ||
        leave.leave_type_id === leaveTypeFilter ||
        leave.leave_type?.id === leaveTypeFilter;

      const matchesSearch =
        !search.trim() ||
        arabicSearchMatches(
          [
            leave.leadership_member?.full_name,
            leave.leadership_member?.rank,
            leave.leadership_member?.job_title,
            leave.leadership_member?.file_number,
            leave.leave_type?.name_ar,
            leave.leadership_member?.sector?.name_ar,
            leave.leadership_member?.sector?.assistant_undersecretary?.name_ar,
            leave.leadership_member?.department?.name_ar,
          ],
          search.trim()
        );

      return matchesSector && matchesUndersecretary && matchesType && matchesSearch;
    });
  }, [leaves, sectorFilter, undersecretaryFilter, undersecretaries, leaveTypeFilter, search]);

  /* State tabs with real counts & visual metadata */
  const stateTabs = [
    {
      value: 'all',
      label: 'الكل',
      description: 'جميع الإجازات',
      count: scoped.length,
      icon: Layers,
      activeColor: 'text-teal-900 border-teal-600 bg-teal-50/70',
      badgeBg: 'bg-slate-100 text-slate-700',
    },
    {
      value: 'active',
      label: 'في إجازة',
      description: 'تباشر حالياً',
      count: scoped.filter((l) => leaveState(l) === 'active').length,
      icon: UserCheck,
      activeColor: 'text-emerald-900 border-emerald-600 bg-emerald-50/70',
      badgeBg: 'bg-emerald-100 text-emerald-800',
    },
    {
      value: 'upcoming',
      label: 'القادمة',
      description: 'مجدولة مستقبلاً',
      count: scoped.filter((l) => leaveState(l) === 'upcoming').length,
      icon: CalendarClock,
      activeColor: 'text-blue-900 border-blue-600 bg-blue-50/70',
      badgeBg: 'bg-blue-100 text-blue-800',
    },
    {
      value: 'completed',
      label: 'المنتهية',
      description: 'اكتملت وانتهت',
      count: scoped.filter((l) => leaveState(l) === 'completed').length,
      icon: CheckCircle2,
      activeColor: 'text-slate-900 border-slate-500 bg-slate-100',
      badgeBg: 'bg-slate-200 text-slate-800',
    },
    {
      value: 'cancelled',
      label: 'الملغاة',
      description: 'طلبات تم إلغاؤها',
      count: scoped.filter((l) => leaveState(l) === 'cancelled').length,
      icon: Ban,
      activeColor: 'text-red-900 border-red-500 bg-red-50/70',
      badgeBg: 'bg-red-100 text-red-800',
    },
  ] as const;

  /* Split into: Current (Active/Upcoming/Cancelled) and Completed (Expired) */
  const currentLeaves = useMemo(() => {
    if (statusFilter === 'completed') return [];
    let list: LeadershipLeave[] = [];
    if (statusFilter === 'all') {
      list = scoped.filter((l) => leaveState(l) !== 'completed');
    } else {
      list = scoped.filter((l) => leaveState(l) === statusFilter);
    }
    const order: Record<string, number> = { active: 0, upcoming: 1, cancelled: 2 };
    return list.sort((a, b) => {
      const aState = leaveState(a);
      const bState = leaveState(b);
      if (order[aState] !== order[bState]) return (order[aState] ?? 99) - (order[bState] ?? 99);
      let compared = 0;
      if (sortBy === 'name') compared = (a.leadership_member?.full_name ?? '').localeCompare(b.leadership_member?.full_name ?? '', 'ar');
      else if (sortBy === 'latest') compared = a.start_date.localeCompare(b.start_date);
      else if (sortBy === 'end') compared = a.end_date.localeCompare(b.end_date);
      else if (sortBy === 'days') compared = a.total_days - b.total_days;
      else if (aState === 'active') compared = a.end_date.localeCompare(b.end_date);
      else if (aState === 'upcoming') compared = a.start_date.localeCompare(b.start_date);
      else compared = a.start_date.localeCompare(b.start_date);
      return compared * (sortDirection === 'asc' ? 1 : -1);
    });
  }, [scoped, statusFilter, sortBy, sortDirection]);

  const completedLeaves = useMemo(() => {
    if (statusFilter !== 'all' && statusFilter !== 'completed') return [];
    return scoped
      .filter((l) => leaveState(l) === 'completed')
      .sort((a, b) => {
        const compared = sortBy === 'name'
          ? (a.leadership_member?.full_name ?? '').localeCompare(b.leadership_member?.full_name ?? '', 'ar')
          : sortBy === 'days' ? a.total_days - b.total_days
            : sortBy === 'latest' ? a.start_date.localeCompare(b.start_date)
              : a.end_date.localeCompare(b.end_date);
        return compared * (sortDirection === 'asc' ? 1 : -1);
      });
  }, [scoped, statusFilter, sortBy, sortDirection]);

  /* All visible leaves (for print) */
  const allVisible = useMemo(() => {
    if (statusFilter === 'completed') return completedLeaves;
    if (statusFilter === 'all') return [...currentLeaves, ...completedLeaves];
    return currentLeaves;
  }, [statusFilter, currentLeaves, completedLeaves]);

  const refreshLeaves = () => {
    void refetch();
    void refetchAllRequests();
  };

  const hasFilterChips = !!sectorFilter || !!undersecretaryFilter || !!leaveTypeFilter || !!search.trim() || statusFilter !== 'all';

  const printScope = [
    undersecretaryFilter ? undersecretaries.find((u) => u.id === undersecretaryFilter)?.name_ar : null,
    sectorFilter
      ? (sectors.find((s) => s.id === sectorFilter) ? formatSectorOption(sectors.find((s) => s.id === sectorFilter)!) : null)
      : 'كل القطاعات',
    leaveTypeFilter
      ? leaveTypes.find((t) => t.id === leaveTypeFilter)?.name_ar
      : 'كل أنواع الإجازات',
    statusFilter !== 'all'
      ? stateTabs.find((item) => item.value === statusFilter)?.label
      : 'كل الحالات',
    search.trim() ? `بحث: ${search.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCancel = async () => {
    if (!cancelTarget || !user) return;
    setCancelLoading(true);
    setMutationError(null);
    const { data, error: cancelError } = await supabase
      .from('leadership_leaves')
      .update({ status: 'cancelled', updated_by: user.id })
      .eq('id', cancelTarget.id)
      .select('id')
      .maybeSingle();

    if (cancelError || !data) {
      setMutationError('لم يتم إلغاء الإجازة. قد لا تملك صلاحية الإلغاء لهذا السجل أو ربما تغيرت حالته؛ حدّث الصفحة أو تواصل مع مدير النظام.');
      setCancelLoading(false);
      return;
    }

    setCancelTarget(null);
    setMutationSuccess('تم إلغاء الإجازة.');
    refreshLeaves();
    setCancelLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    setDeleteLoading(true);
    setMutationError(null);
    try {
      const { data: deletedLeave, error: delError } = await supabase
        .from('leadership_leaves')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id')
        .maybeSingle();

      if (delError) throw delError;
      if (!deletedLeave) throw new Error('لم يتم حذف الإجازة. قد لا تملك صلاحية الحذف لهذا السجل أو ربما تغيرت حالته؛ حدّث الصفحة أو تواصل مع مدير النظام.');

      setDeleteTarget(null);
      setMutationSuccess('تم حذف الإجازة.');
      refreshLeaves();
    } catch (err) {
      console.error('Failed to delete leave:', err);
      setMutationError(err instanceof Error && err.message.startsWith('لم يتم حذف الإجازة.')
        ? err.message
        : 'لم يتم حذف الإجازة. قد لا تملك صلاحية الحذف لهذا السجل أو ربما تغيرت حالته؛ حدّث الصفحة أو تواصل مع مدير النظام.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="الإجازات" subtitle="جميع الإجازات المسجلة" icon={<Plane className="w-5 h-5" />} />
        <div className="card p-6"><TableSkeleton rows={6} cols={5} /></div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="animate-fade-in pb-12">
      <PrintReportHeader
        title="تقرير الإجازات"
        subtitle={printScope}
        itemCount={allVisible.length}
        totalDays={allVisible.reduce((sum, leave) => sum + leave.total_days, 0)}
      />

      <div className="no-print space-y-4">
        {/* Header */}
        <PageHeader
          title="الإجازات"
          subtitle="سجل إجازات الموظفين الحالية والسابقة"
          icon={<Plane className="w-5 h-5" />}
          actions={(
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary px-3 sm:px-4 inline-flex items-center gap-1.5" onClick={() => setTrackingOpen(true)}>
                <History className="w-4 h-4" />
                <span className="md:hidden">تتبع</span>
                <span className="hidden md:inline">تتبع الطلبات</span>
                {pendingSubmittedCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-800">{pendingSubmittedCount}</span>}
              </button>
              {canCreateLeave && <>
                <button
                  className="btn-primary px-3 sm:px-4"
                  onClick={() => { setEditingLeave(null); setFormOpen(true); }}
                  title="طلب إجازة"
                  aria-label="طلب إجازة"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">طلب إجازة</span>
                </button>
              </>}
            </div>
          )}
        />

        <LeaveTrackingModal
          open={trackingOpen}
          onClose={closeTracking}
          leaves={trackedLeaves}
          loading={trackingLoading}
          error={trackingError}
          canEdit={canEditLeave}
          onEdit={leave => {
            closeTracking();
            setEditingLeave(leave);
            setFormOpen(true);
          }}
        />

        {/* State Tabs: Responsive Design (Sleek Segmented Bar on Mobile, Smart Cards Grid on Tablets/Desktop) */}
        <div>
          {/* Mobile View (< sm): Compact horizontal filter cards */}
          <nav
            className="sm:hidden flex items-center gap-2 overflow-x-auto pb-1.5 -mx-3 px-3 no-scrollbar"
            aria-label="حالات الإجازات للموبايل"
          >
            {stateTabs.map((item) => {
              const Icon = item.icon;
              const isSelected = statusFilter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter('state', item.value)}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`min-w-[116px] h-12 shrink-0 rounded-xl border px-3 text-right transition-colors flex items-center justify-between gap-2 select-none cursor-pointer ${isSelected
                    ? item.value === 'all'
                      ? 'bg-teal-800 text-white border-teal-800 shadow-sm'
                      : item.value === 'active'
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                        : item.value === 'upcoming'
                          ? 'bg-blue-800 text-white border-blue-800 shadow-sm'
                          : item.value === 'completed'
                            ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                            : 'bg-red-800 text-white border-red-800 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 shadow-sm active:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                      {item.label}
                    </span>
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white/85' : 'text-slate-400'}`} />
                  </div>
                  <strong className={`text-base font-bold tabular-nums shrink-0 ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                    {item.count}
                  </strong>
                </button>
              );
            })}
          </nav>

          {/* Desktop & Tablet View (>= sm): Clean, Simple & Flat Tabs Bar */}
          <nav
            className="hidden sm:grid sm:grid-cols-5 gap-2.5"
            aria-label="حالات الإجازات"
          >
            {stateTabs.map((item) => {
              const Icon = item.icon;
              const isSelected = statusFilter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter('state', item.value)}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`group rounded-xl border px-3.5 py-3 text-right transition-all flex items-center justify-between gap-2.5 cursor-pointer select-none ${isSelected
                    ? 'bg-teal-50/80 border-teal-600 text-teal-950 shadow-xs'
                    : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${isSelected ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                    />
                    <span
                      className={`text-sm font-semibold truncate ${isSelected ? 'text-teal-950 font-bold' : 'text-slate-700'
                        }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-lg text-xs font-bold tabular-nums shrink-0 transition-colors ${isSelected
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/70'
                      }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Search & Filters Card */}
        <div className="card p-3.5 sm:p-4 space-y-3 bg-white border border-slate-200/90 shadow-xs">
          {/* Search and filter toggle, matching the Leaders page */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Live Search Input */}
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="leave-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الموظف، المسمى الوظيفي، رقم الملف أو القطاع…"
                className="input-field pr-10 pl-9 text-sm w-full"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="مسح نص البحث"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              className={`btn-secondary sm:w-auto flex items-center gap-1.5 ${showFilters || sectorFilter || undersecretaryFilter || leaveTypeFilter
                ? 'border-primary-300 bg-primary-50 text-primary-800 font-semibold'
                : ''
                }`}
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
            >
              <Filter className="w-4 h-4" />
              <span>الفلاتر</span>
              {(sectorFilter || undersecretaryFilter || leaveTypeFilter) && <span className="w-2 h-2 rounded-full bg-primary-600" />}
            </button>
          </div>

          {/* Expandable filters */}
          {showFilters && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="leave-undersecretary-filter">
                  المستوى التنظيمي (مساعد المدير العام):
                </label>
                <select
                  id="leave-undersecretary-filter"
                  className="input-field mobile-filter-control w-full"
                  value={undersecretaryFilter}
                  onChange={(e) => setFilter('undersecretary', e.target.value)}
                >
                  <option value="">كل المستويات التنظيمية</option>
                  {undersecretaries.map((u) => (
                    <option key={u.id} value={u.id}>{u.name_ar}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="leave-sector-filter">
                  القطاع المعني:
                </label>
                <select
                  id="leave-sector-filter"
                  className="input-field mobile-filter-control w-full"
                  value={sectorFilter}
                  onChange={(e) => setFilter('sector', e.target.value)}
                >
                  <option value="">كل القطاعات</option>
                  {sectors
                    .filter((s) => !undersecretaryFilter || sectorInUnit(s, undersecretaryFilter, undersecretaries))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{formatSectorOption(s)}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="leave-type-filter">نوع الإجازة</label>
                <select
                  id="leave-type-filter"
                  className="input-field mobile-filter-control w-full"
                  value={leaveTypeFilter}
                  onChange={(e) => setFilter('type', e.target.value)}
                >
                  <option value="">كل أنواع الإجازات</option>
                  {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Active Filter Chips */}
          {hasFilterChips && (
            <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-medium">تصفية نشطة:</span>
              {search.trim() && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary-50 border border-primary-200 text-primary-800 px-2.5 py-1 rounded-full font-medium">
                  بحث: "{search.trim()}"
                  <button type="button" onClick={() => setSearch('')} aria-label="إزالة البحث" className="hover:text-red-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {sectorFilter && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                  القطاع: {sectors.find((s) => s.id === sectorFilter) ? formatSectorOption(sectors.find((s) => s.id === sectorFilter)!) : sectorFilter}
                  <button type="button" onClick={() => setFilter('sector', '')} aria-label="إزالة فلتر القطاع" className="hover:text-red-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {undersecretaryFilter && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                  المستوى التنظيمي: {undersecretaries.find((u) => u.id === undersecretaryFilter)?.name_ar ?? undersecretaryFilter}
                  <button type="button" onClick={() => setFilter('undersecretary', '')} aria-label="إزالة فلتر المستوى التنظيمي" className="hover:text-red-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {leaveTypeFilter && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                  النوع: {leaveTypes.find((t) => t.id === leaveTypeFilter)?.name_ar ?? leaveTypeFilter}
                  <button type="button" onClick={() => setFilter('type', '')} aria-label="إزالة فلتر نوع الإجازة" className="hover:text-red-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-medium">
                  الحالة: {stateTabs.find((item) => item.value === statusFilter)?.label}
                  <button type="button" onClick={() => setFilter('state', 'all')} aria-label="إزالة فلتر الحالة" className="hover:text-red-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-red-600 hover:text-red-800 hover:underline flex items-center gap-1 mr-1.5 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> مسح الكل
              </button>
            </div>
          )}

          {/* Bottom Bar: Stats on Right & Sort on Left */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md tabular-nums">
                {allVisible.length} إجازة مطابقة
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 self-center">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">الترتيب:</span>
              </div>
              <select
                id="leave-sort"
                className="input-field mobile-filter-control h-8 text-xs w-32 sm:w-36 py-0 px-2 cursor-pointer bg-white"
                value={sortBy}
                onChange={(event) => chooseSort(event.target.value)}
              >
                <option value="soon">الأقرب أولًا</option>
                <option value="latest">الأحدث أولًا</option>
                <option value="name">حسب الاسم</option>
                <option value="end">حسب تاريخ النهاية</option>
                <option value="days">الأطول مدة</option>
              </select>
            </div>
          </div>
        </div>

        {mutationError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {mutationError}
          </p>
        )}
        {mutationSuccess && <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span>{mutationSuccess}</span><button type="button" onClick={() => setMutationSuccess(null)} aria-label="إغلاق رسالة النجاح" className="rounded p-1 hover:bg-emerald-100"><X className="h-4 w-4" /></button></div>}

        {/* ════════════════════════════════════════════════════
            TABLE 1: CURRENT / ACTIVE & UPCOMING LEAVES
        ════════════════════════════════════════════════════ */}
        {statusFilter !== 'completed' && (
          <section className="space-y-3" aria-label="الإجازات الحالية والقادمة">
            {statusFilter === 'all' && (
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <h2 className="font-bold text-slate-900 text-base">
                    الإجازات الجارية والقادمة
                  </h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {currentLeaves.length}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {formatDayCount(currentLeaves.reduce((sum, l) => sum + l.total_days, 0))}
                </span>
              </div>
            )}

            {currentLeaves.length === 0 ? (
              <div className="card p-6">
                <EmptyState
                  icon={<Plane className="w-7 h-7 text-slate-400" />}
                  title={hasFilterChips ? 'لا توجد نتائج مطابقة' : 'لا توجد إجازات جارية أو قادمة'}
                  message={hasFilterChips ? 'جرّب تعديل معايير البحث أو تصفية القطاع والنوع.' : undefined}
                  action={hasFilterChips ? <button type="button" className="btn-secondary" onClick={clearAllFilters}>مسح البحث والفلاتر</button> : undefined}
                />
              </div>
            ) : (
              <>
                {/* Desktop Table for Current Leaves */}
                <div className="card-elevated overflow-hidden hidden xl:block bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50/90 border-b-2 border-slate-200">
                          <th className="table-header w-12 text-center">م</th>
                          <th className="table-header"><button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-primary-700">المسمى الوظيفي / الاسم{sortIndicator('name')}</button></th>
                          <th className="table-header">نوع الإجازة</th>
                          <th className="table-header"><button type="button" onClick={() => toggleSort('latest')} className="inline-flex items-center gap-1 hover:text-primary-700">تاريخ البداية{sortIndicator('latest')}</button></th>
                          <th className="table-header"><button type="button" onClick={() => toggleSort('end')} className="inline-flex items-center gap-1 hover:text-primary-700">تاريخ النهاية{sortIndicator('end')}</button></th>
                          <th className="table-header"><button type="button" onClick={() => toggleSort('days')} className="inline-flex items-center gap-1 hover:text-primary-700">المدة{sortIndicator('days')}</button></th>
                          <th className="table-header">الحالة</th>
                          {currentLeaves.some((leave) => canEditLeave(leave) || canCancelLeave(leave) || isAdmin) && <th className="table-header w-28 text-center">إجراءات</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentLeaves.map((leave, idx) => {
                          const status = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
                          const sc = statusConfig[status];
                          const isActive = status === 'active' || status === 'returning_soon';
                          return (
                            <tr
                              key={leave.id}
                              className={`transition-colors ${isActive ? 'bg-teal-50/30 hover:bg-teal-50/60' : 'hover:bg-slate-50'
                                }`}
                            >
                              <td className="table-cell text-center text-slate-400 text-xs font-mono">{idx + 1}</td>
                              <td className="table-cell">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex flex-col items-center shrink-0">
                                    <RankInsignia rank={leave.leadership_member?.rank} size="sm" />
                                    {leave.leadership_member?.file_number && (
                                      <span className="text-[10px] font-semibold text-slate-500 mt-0.5 text-center" title={`رقم الملف: ${leave.leadership_member.file_number}`}>
                                        {leave.leadership_member.file_number}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <PersonName
                                      rank={leave.leadership_member?.rank}
                                      name={leave.leadership_member?.full_name ?? '-'}
                                    />
                                    <div className="text-xs text-slate-400 mt-0.5 max-w-sm">
                                      <span>{leave.leadership_member?.job_title ?? ''}</span>
                                      {leave.leadership_member?.sector && (
                                        <>
                                          <span className="mx-1">·</span>
                                          <ExpandableOrgPath sector={leave.leadership_member.sector} department={leave.leadership_member.department} />
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="table-cell font-medium text-slate-700">{leave.leave_type?.name_ar ?? '-'}</td>
                              <td className="table-cell text-slate-700">{formatDate(leave.start_date)}</td>
                              <td className="table-cell text-slate-700">{formatDate(leave.end_date)}</td>
                              <td className="table-cell font-semibold text-slate-900">
                                {formatDayCount(leave.total_days)}
                              </td>
                              <td className="table-cell">
                                <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                              </td>
                              {(canEditLeave(leave) || canCancelLeave(leave) || isAdmin) && (
                                <td className="table-cell">
                                  <div className="flex items-center justify-center gap-1">
                                    {canEditLeave(leave) && <button
                                      onClick={() => { setEditingLeave(leave); setFormOpen(true); }}
                                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                                      title="تعديل"
                                      aria-label={`تعديل إجازة ${leave.leadership_member?.full_name ?? ''}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>}
                                    {canCancelLeave(leave) && status !== 'cancelled' && (
                                      <button
                                        onClick={() => setCancelTarget(leave)}
                                        className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                                        title="إلغاء الإجازة"
                                        aria-label={`إلغاء إجازة ${leave.leadership_member?.full_name ?? ''}`}
                                      >
                                        <Ban className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isAdmin && <button type="button" onClick={() => setTimelineLeaveId(leave.id)} className="p-1.5 rounded-lg hover:bg-primary-50 text-slate-500 hover:text-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" title="تتبع مسار الإجازة" aria-label="تتبع مسار الإجازة"><History className="w-4 h-4" aria-hidden="true" /></button>}
                                    {isAdmin && (
                                      <button
                                        onClick={() => setDeleteTarget(leave)}
                                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                        title="حذف الإجازة نهائيًا"
                                        aria-label={`حذف إجازة ${leave.leadership_member?.rank ?? ''} / ${leave.leadership_member?.full_name ?? ''}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Cards for Current Leaves */}
                <div className="xl:hidden space-y-3">
                  {currentLeaves.map((leave) => {
                    const status = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
                    const sc = statusConfig[status];
                    const isActive = status === 'active' || status === 'returning_soon';
                    return (
                      <div
                        key={leave.id}
                        className={`card p-4 bg-white border-slate-200 shadow-sm transition-shadow ${isActive ? 'border-slate-200 ring-1 ring-teal-100/80' : 'hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex flex-col items-center shrink-0">
                              <RankInsignia rank={leave.leadership_member?.rank} size="sm" />
                              {leave.leadership_member?.file_number && (
                                <span className="text-[10px] font-semibold text-slate-500 mt-0.5 text-center" title={`رقم الملف: ${leave.leadership_member.file_number}`}>
                                  {leave.leadership_member.file_number}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <PersonName
                                rank={leave.leadership_member?.rank}
                                name={leave.leadership_member?.full_name ?? '-'}
                              />
                              <div className="mt-1">
                                <span className="inline-flex max-w-full rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                  {leave.leave_type?.name_ar}
                                </span>
                              </div>
                              {leave.leadership_member?.job_title && (
                                <div className="mt-1 text-xs text-slate-500">
                                  <span className="font-medium text-slate-400">المنصب: </span>
                                  <ExpandableOrgPath customPath={leave.leadership_member.job_title} label="المسمى الوظيفي" className="text-slate-600" />
                                </div>
                              )}
                              {(leave.leadership_member?.sector?.name_ar || leave.leadership_member?.department?.name_ar) && (
                                <div className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[11px] text-slate-500">
                                  <span className="shrink-0 font-medium text-slate-400">القطاع / الإدارة:</span>
                                  <ExpandableOrgPath sector={leave.leadership_member.sector} department={leave.leadership_member.department} className="min-w-0 w-full flex-1 text-[11px] text-slate-500" />
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-xs text-slate-600">
                          <span>البداية: <strong>{formatDate(leave.start_date)}</strong></span>
                          <span>النهاية: <strong>{formatDate(leave.end_date)}</strong></span>
                          <span>المدة: <strong>{formatDayCount(leave.total_days)}</strong></span>
                          {isCurrentlyOnLeave(leave.start_date, leave.end_date, leave.status) && (
                            <span className="text-amber-700 font-medium">{getRemainingLabel(leave.end_date)}</span>
                          )}
                        </div>
                        {(canEditLeave(leave) || canCancelLeave(leave) || isAdmin) && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                            {canEditLeave(leave) && <button
                              onClick={() => { setEditingLeave(leave); setFormOpen(true); }}
                              className="btn-secondary text-xs flex-1"
                            >
                              <Pencil className="w-3.5 h-3.5" /> تعديل
                            </button>}
                            {canCancelLeave(leave) && status !== 'cancelled' && (
                              <button
                                onClick={() => setCancelTarget(leave)}
                                className="h-11 px-3 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs flex items-center justify-center gap-1 font-medium transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" /> إلغاء
                              </button>
                            )}
                            {isAdmin && <button type="button" onClick={() => setTimelineLeaveId(leave.id)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-auto sm:w-auto sm:rounded-lg sm:border-transparent sm:bg-transparent sm:p-1.5 sm:shadow-none" title="تتبع مسار الإجازة" aria-label="تتبع مسار الإجازة"><History className="h-4 w-4" aria-hidden="true" /></button>}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(leave)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 shadow-xs transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                title="حذف الإجازة نهائيًا"
                                aria-label={`حذف إجازة ${leave.leadership_member?.rank ?? ''} / ${leave.leadership_member?.full_name ?? ''}`}
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* ════════════════════════════════════════════════════
            TABLE 2: EXPIRED / COMPLETED LEAVES (SEPARATE & MUTED GRAY)
        ════════════════════════════════════════════════════ */}
        {(statusFilter === 'all' || statusFilter === 'completed') && (
          <section
            className={`space-y-3 pt-4 ${statusFilter === 'all' ? 'mt-8 border-t-2 border-dashed border-slate-200' : ''
              }`}
            aria-label="سجل الإجازات المنتهية"
          >
            {/* Section Header with Gray Aesthetic */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 sm:p-4 rounded-xl bg-slate-100/70 border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200/80 text-slate-600 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-slate-800 text-base">
                      سجل الإجازات المنتهية
                    </h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {completedLeaves.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الإجازات السابقة التي انتهت فترتها الرسمية
                  </p>
                </div>
              </div>
            </div>

            {completedLeaves.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center">
                <p className="text-sm text-slate-400">لا توجد إجازات منتهية في العرض الحالي</p>
              </div>
            ) : (
              <>
                {/* Desktop Table for Completed Leaves (Muted Gray Aesthetic) */}
                <div className="rounded-xl border border-slate-200 overflow-hidden hidden xl:block bg-slate-50/50 shadow-none">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500">
                          <th className="table-header w-12 text-center text-slate-500 font-medium">م</th>
                          <th className="table-header text-slate-600 font-medium"><button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-primary-700">المسمى الوظيفي / الاسم{sortIndicator('name')}</button></th>
                          <th className="table-header text-slate-600 font-medium">نوع الإجازة</th>
                          <th className="table-header text-slate-600 font-medium"><button type="button" onClick={() => toggleSort('latest')} className="inline-flex items-center gap-1 hover:text-primary-700">تاريخ البداية{sortIndicator('latest')}</button></th>
                          <th className="table-header text-slate-600 font-medium"><button type="button" onClick={() => toggleSort('end')} className="inline-flex items-center gap-1 hover:text-primary-700">تاريخ النهاية{sortIndicator('end')}</button></th>
                          <th className="table-header text-slate-600 font-medium"><button type="button" onClick={() => toggleSort('days')} className="inline-flex items-center gap-1 hover:text-primary-700">المدة{sortIndicator('days')}</button></th>
                          <th className="table-header text-slate-600 font-medium">الحالة</th>
                          {completedLeaves.some((leave) => canEditLeave(leave) || isAdmin) && <th className="table-header w-24 text-center text-slate-500 font-medium">إجراءات</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 text-slate-600">
                        {completedLeaves.map((leave, idx) => (
                          <tr
                            key={leave.id}
                            className="hover:bg-slate-100/60 transition-colors"
                          >
                            <td className="table-cell text-center text-slate-400 text-xs font-mono">{idx + 1}</td>
                            <td className="table-cell">
                              <div className="flex items-center gap-2.5 opacity-90">
                                <div className="flex flex-col items-center shrink-0">
                                  <RankInsignia rank={leave.leadership_member?.rank} size="sm" />
                                  {leave.leadership_member?.file_number && (
                                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5 text-center" title={`رقم الملف: ${leave.leadership_member.file_number}`}>
                                      {leave.leadership_member.file_number}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <PersonName
                                    rank={leave.leadership_member?.rank}
                                    name={leave.leadership_member?.full_name ?? '-'}
                                  />
                                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                                    {leave.leadership_member?.job_title ?? ''}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="table-cell text-slate-600">{leave.leave_type?.name_ar ?? '-'}</td>
                            <td className="table-cell text-slate-500 text-xs">{formatDate(leave.start_date)}</td>
                            <td className="table-cell text-slate-500 text-xs">{formatDate(leave.end_date)}</td>
                            <td className="table-cell font-medium text-slate-700">
                              {formatDayCount(leave.total_days)}
                            </td>
                            <td className="table-cell">
                              <Badge
                                label="منتهية"
                                color="text-slate-600"
                                bg="bg-slate-200/70 border-slate-300"
                              />
                            </td>
                            {(canEditLeave(leave) || isAdmin) && (
                              <td className="table-cell">
                                <div className="flex items-center justify-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                                  {canEditLeave(leave) && <button
                                    onClick={() => { setEditingLeave(leave); setFormOpen(true); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                                    title="تعديل السجل"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>}
                                  {isAdmin && <button type="button" onClick={() => setTimelineLeaveId(leave.id)} className="p-1.5 rounded-lg hover:bg-primary-50 text-slate-500 hover:text-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" title="تتبع مسار الإجازة" aria-label="تتبع مسار الإجازة"><History className="w-4 h-4" aria-hidden="true" /></button>}
                                  {isAdmin && (
                                    <button
                                      onClick={() => setDeleteTarget(leave)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                      title="حذف الإجازة المنتهية"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Cards for Completed Leaves (Muted Gray) */}
                <div className="xl:hidden space-y-2.5">
                  {completedLeaves.map((leave) => (
                    <div
                      key={leave.id}
                      className="rounded-xl border border-slate-200 bg-white shadow-sm p-3.5 text-slate-600"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 opacity-90">
                          <div className="flex flex-col items-center shrink-0">
                            <RankInsignia rank={leave.leadership_member?.rank} size="sm" />
                            {leave.leadership_member?.file_number && (
                              <span className="text-[10px] font-semibold text-slate-500 mt-0.5 text-center" title={`رقم الملف: ${leave.leadership_member.file_number}`}>
                                {leave.leadership_member.file_number}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <PersonName
                              rank={leave.leadership_member?.rank}
                              name={leave.leadership_member?.full_name ?? '-'}
                            />
                            <div className="mt-1">
                              <span className="inline-flex max-w-full rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                {leave.leave_type?.name_ar}
                              </span>
                            </div>
                            {leave.leadership_member?.job_title && (
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-400">المنصب: </span>
                                <ExpandableOrgPath customPath={leave.leadership_member.job_title} label="المسمى الوظيفي" className="text-slate-600" />
                              </div>
                            )}
                            {(leave.leadership_member?.sector?.name_ar || leave.leadership_member?.department?.name_ar) && (
                              <div className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[11px] text-slate-500">
                                <span className="shrink-0 font-medium text-slate-400">القطاع / الإدارة:</span>
                                <ExpandableOrgPath sector={leave.leadership_member.sector} department={leave.leadership_member.department} className="min-w-0 w-full flex-1 text-[11px] text-slate-500" />
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge
                          label="منتهية"
                          color="text-slate-600"
                          bg="bg-slate-200/70 border-slate-300"
                        />
                      </div>
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200 grid grid-cols-2 gap-1.5 text-xs text-slate-500">
                        <span>البداية: {formatDate(leave.start_date)}</span>
                        <span>النهاية: {formatDate(leave.end_date)}</span>
                        <span>المدة: {formatDayCount(leave.total_days)}</span>
                      </div>
                      {(canEditLeave(leave) || isAdmin) && (
                        <div className="flex flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-slate-200/70">
                          {canEditLeave(leave) && <button
                            onClick={() => { setEditingLeave(leave); setFormOpen(true); }}
                            className="btn-secondary text-xs flex-1 py-1"
                          >
                            <Pencil className="w-3 h-3" /> تعديل السجل
                          </button>}
                          {isAdmin && <button type="button" onClick={() => setTimelineLeaveId(leave.id)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-auto sm:w-auto sm:rounded-lg sm:border-transparent sm:bg-transparent sm:p-1.5 sm:shadow-none" title="تتبع مسار الإجازة" aria-label="تتبع مسار الإجازة"><History className="h-4 w-4" aria-hidden="true" /></button>}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(leave)}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-xs transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                title="حذف الإجازة المنتهية"
                                aria-label={`حذف إجازة ${leave.leadership_member?.rank ?? ''} / ${leave.leadership_member?.full_name ?? ''}`}
                              >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Modal: Add/Edit Leave */}
        <LeaveTimelineModal leaveId={timelineLeaveId} onClose={() => setTimelineLeaveId(null)} />
        {formOpen && (
          <LeaveFormModal
            open={formOpen}
            onClose={() => { setFormOpen(false); setEditingLeave(null); }}
            onSaved={() => { refreshLeaves(); setMutationSuccess(editingLeave ? 'تم تعديل الطلب وإرساله للمراجعة.' : 'تم إرسال طلب الإجازة للمراجعة.'); }}
            editingLeave={editingLeave}
          />
        )}

        {/* Dialog: Cancel Confirmation */}
        <ConfirmDialog
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancel}
          busy={cancelLoading}
          closeOnConfirm={false}
          title="إلغاء الإجازة"
          message="هل أنت متأكد من إلغاء هذه الإجازة؟"
          confirmLabel={cancelLoading ? 'جارٍ الإلغاء…' : 'إلغاء الإجازة'}
          danger
        />

        {/* Dialog: Permanent Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          busy={deleteLoading}
          closeOnConfirm={false}
          title="حذف الإجازة نهائيًا"
          message={<>سيؤدي هذا إلى حذف إجازة «{deleteTarget?.leadership_member?.rank ?? ''} / <ResponsivePersonName name={deleteTarget?.leadership_member?.full_name} />» نهائيًا مع سجل مراحل المراجعة المرتبط بها. سيبقى أثر الحذف في سجل العمليات. لا يمكن التراجع عن ذلك.</>}
          confirmLabel={deleteLoading ? 'جارٍ الحذف...' : 'حذف نهائي'}
          danger
        />
      </div>

      {/* Print View Report */}
      <div className="print-only print-report-frame">
        <table className="print-report-table">
          <thead>
            <tr>
              <th>م</th>
              <th>المسمى الوظيفي / الاسم</th>
              <th>نوع الإجازة</th>
              <th>البداية</th>
              <th>النهاية</th>
              <th>المدة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {allVisible.map((leave, index) => {
              const status = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
              return (
                <tr key={leave.id}>
                  <td>{index + 1}</td>
                  <td>
                    <PersonName
                      rank={leave.leadership_member?.rank}
                      name={leave.leadership_member?.full_name ?? '-'}
                    />
                  </td>
                  <td>{leave.leave_type?.name_ar ?? '-'}</td>
                  <td>{formatDate(leave.start_date)}</td>
                  <td>{formatDate(leave.end_date)}</td>
                  <td>{formatDayCount(leave.total_days)}</td>
                  <td>{statusConfig[status].label}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>الإجمالي · عدد الإجازات: {allVisible.length}</td>
              <td>{formatDayCount(allVisible.reduce((sum, leave) => sum + leave.total_days, 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <PrintReportFooter />
      </div>
    </div>
  );
}
