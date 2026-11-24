import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Users, Search, Filter, Plus, MoreVertical, Archive, Edit2, X, RotateCcw, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useLeadershipMembers, useSectors, useDepartments, useAssistantUndersecretaries } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TableSkeleton } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MemberFormModal } from '@/components/MemberFormModal';
import { ranks, memberStatusConfig } from '@/constants';
import { addDays, todayInKuwait, isCurrentlyOnLeave } from '@/utils/date';
import { PersonName, ResponsivePersonName } from '@/components/PersonName';
import { RankInsignia } from '@/components/RankInsignia';
import { formatSectorOption, sectorInUnit } from '@/utils/organization';
import { permissionCoversMember } from '@/utils/permissions';
import { compareLeaders } from '@/utils/leaderOrder';
import { ExpandableOrgPath } from '@/components/ExpandableOrgPath';
import type { LeadershipMember, LeadershipLeave } from '@/types';

export function LeadersPage() {
  const { isAdmin, permissions, hasPermission, user } = useAuth();
  const canCreateLeader = isAdmin || hasPermission('create_leader');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [undersecretaryFilter, setUndersecretaryFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [leaveFilter, setLeaveFilter] = useState('');
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const [sort, setSort] = useState<{ key: 'name' | 'file' | 'rank' | 'status'; direction: 'asc' | 'desc' }>({ key: 'rank', direction: 'asc' });
  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<LeadershipMember | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LeadershipMember | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    id: string;
    member: LeadershipMember;
    top: number;
    left: number;
  } | null>(null);
  const [memberLeaves, setMemberLeaves] = useState<Record<string, LeadershipLeave[]>>({});

  // Close floating action menu on click outside, scroll or resize
  useEffect(() => {
    if (!menuAnchor) return;
    const handleClose = () => setMenuAnchor(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [menuAnchor]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { sectors } = useSectors();
  const { undersecretaries } = useAssistantUndersecretaries();
  const canEditLeader = (member: LeadershipMember) => permissionCoversMember(permissions, 'edit_leader', member, sectors, undersecretaries, isAdmin);
  const canArchiveLeader = (member: LeadershipMember) => permissionCoversMember(permissions, 'archive_leader', member, sectors, undersecretaries, isAdmin);
  const { departments } = useDepartments(sectorFilter || null);
  const { members, loading, error, refetch } = useLeadershipMembers({
    search: debouncedSearch,
    sectorId: sectorFilter || null,
    departmentId: deptFilter || null,
    rank: rankFilter || null,
    isActive: null,
  });

  // Fetch current leaves for all members
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('leadership_leaves')
        .select('*, leadership_member:leadership_member_id(id)')
        .eq('approval_status', 'approved')
        .neq('status', 'cancelled')
        .gte('end_date', addDays(todayInKuwait(), -30));
      if (data) {
        const map: Record<string, LeadershipLeave[]> = {};
        (data as LeadershipLeave[]).forEach((l) => {
          const mid = l.leadership_member_id;
          (map[mid] ??= []).push(l);
        });
        setMemberLeaves(map);
      }
    })();
  }, []);

  const getMemberStatus = useCallback((memberId: string): 'at_work' | 'on_leave' => {
    return (memberLeaves[memberId] ?? []).some((leave) => isCurrentlyOnLeave(leave.start_date, leave.end_date, leave.status))
      ? 'on_leave' : 'at_work';
  }, [memberLeaves]);

  const filteredMembers = useMemo(() => {
    let result = members;
    if (undersecretaryFilter) {
      result = result.filter((m) => sectorInUnit(m.sector, undersecretaryFilter, undersecretaries));
    }
    if (leaveFilter === 'on_leave') {
      result = result.filter((m) => getMemberStatus(m.id) === 'on_leave');
    } else if (leaveFilter === 'at_work') {
      result = result.filter((m) => getMemberStatus(m.id) === 'at_work');
    }
    return [...result].sort((a, b) => {
      if (sort.key === 'rank') {
        const compared = compareLeaders(a, b);
        return sort.direction === 'asc' ? compared : -compared;
      }
      const values = {
        name: [a.full_name, b.full_name],
        file: [a.file_number, b.file_number],
        status: [getMemberStatus(a.id), getMemberStatus(b.id)],
      }[sort.key];
      const compared = String(values[0] ?? '').localeCompare(String(values[1] ?? ''), 'ar', { numeric: true });
      return sort.direction === 'asc' ? compared : -compared;
    });
  }, [members, undersecretaryFilter, undersecretaries, leaveFilter, getMemberStatus, sort]);

  const toggleSort = (key: 'name' | 'file' | 'rank' | 'status') => setSort((current) => current.key === key ? { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const SortButton = ({ label, sortKey }: { label: string; sortKey: 'name' | 'file' | 'rank' | 'status' }) => (
    <button type="button" onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 hover:text-primary-700 transition-colors">
      {label}{sort.key === sortKey ? (sort.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />}
    </button>
  );

  const handleArchive = async () => {
    if (!archiveTarget || !user) return;
    setArchiveBusy(true);
    setArchiveError(null);
    const { data, error } = await supabase.from('leadership_members')
      .update({ is_active: false, updated_by: user.id })
      .eq('id', archiveTarget.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      setArchiveError('لم تتم أرشفة الموظف. قد لا تملك صلاحية الأرشفة ضمن نطاقه أو ربما تغيرت بياناته؛ حدّث الصفحة أو تواصل مع مدير النظام.');
    } else {
      setArchiveTarget(null);
      refetch();
    }
    setArchiveBusy(false);
  };

  if (loading && members.length === 0) {
    return (
      <div>
        <PageHeader title="الموظفون" subtitle="دليل الموظفين والإجازات" icon={<Users className="w-5 h-5" />} />
        <div className="card p-6"><TableSkeleton rows={6} cols={6} /></div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="الموظفون"
        subtitle="دليل الموظفين والإجازات"
        icon={<Users className="w-5 h-5" />}
        actions={
          canCreateLeader && (
            <button
              className="btn-primary px-3 sm:px-4"
              onClick={() => { setEditingMember(null); setFormOpen(true); }}
              title="إضافة موظف"
              aria-label="إضافة موظف"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة موظف</span>
            </button>
          )
        }
      />
      {saveSuccess && <div role="status" aria-live="polite" className="card mb-4 flex items-center justify-between gap-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span>{saveSuccess}</span><button type="button" onClick={() => setSaveSuccess(null)} aria-label="إغلاق رسالة النجاح" className="rounded p-1 hover:bg-emerald-100"><X className="h-4 w-4" /></button></div>}

      {/* Search & Filters */}
      <div className="card p-3 sm:p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <label htmlFor="leaders-search" className="sr-only">البحث عن موظف</label>
            <input
              id="leaders-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، رقم الملف / المدني، المسمى الوظيفي..."
              className="input-field pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-1"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            className={`btn-secondary sm:w-auto flex items-center gap-1.5 ${
              showFilters || undersecretaryFilter || sectorFilter || deptFilter || rankFilter || leaveFilter
                ? 'border-teal-500 bg-teal-50 text-teal-800 font-semibold'
                : ''
            }`}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            <Filter className="w-4 h-4" />
            <span>الفلاتر</span>
            {(undersecretaryFilter || sectorFilter || deptFilter || rankFilter || leaveFilter) && (
              <span className="w-2 h-2 rounded-full bg-teal-600" />
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">المستوى التنظيمي</label>
              <select className="input-field mobile-filter-control" aria-label="تصفية حسب المستوى التنظيمي" value={undersecretaryFilter} onChange={(e) => { setUndersecretaryFilter(e.target.value); setSectorFilter(''); setDeptFilter(''); }}>
                <option value="">كل المستويات والقطاعات</option>
                {undersecretaries.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">القطاع</label>
              <select className="input-field mobile-filter-control" aria-label="تصفية حسب القطاع" value={sectorFilter} onChange={(e) => { setSectorFilter(e.target.value); setDeptFilter(''); }}>
                <option value="">كل القطاعات</option>
                {sectors.filter((s) => !undersecretaryFilter || sectorInUnit(s, undersecretaryFilter, undersecretaries)).map((s) => <option key={s.id} value={s.id}>{formatSectorOption(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">الإدارة</label>
              <select className="input-field mobile-filter-control" aria-label="تصفية حسب الإدارة" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} disabled={!sectorFilter}>
                <option value="">كل الإدارات</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">المسمى الوظيفي</label>
              <select className="input-field mobile-filter-control" aria-label="تصفية حسب المسمى الوظيفي" value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}>
                <option value="">كل المسميات الوظيفية</option>
                {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">حالة الدوام</label>
              <select className="input-field mobile-filter-control" aria-label="تصفية حسب حالة الإجازة" value={leaveFilter} onChange={(e) => setLeaveFilter(e.target.value)}>
                <option value="">كل حالات الدوام</option>
                <option value="on_leave">في إجازة</option>
                <option value="at_work">على رأس عمله</option>
              </select>
            </div>
          </div>
        )}

        {/* Active Filters Chips */}
        {(!!search.trim() || !!undersecretaryFilter || !!sectorFilter || !!deptFilter || !!rankFilter || !!leaveFilter) && (
          <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-400">تصفية نشطة:</span>
            {search.trim() && (
              <span className="inline-flex items-center gap-1 text-xs bg-teal-50 border border-teal-200 text-teal-800 px-2.5 py-0.5 rounded-full font-medium">
                بحث: "{search.trim()}"
                <button onClick={() => setSearch('')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {undersecretaryFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                المستوى التنظيمي: {undersecretaries.find((u) => u.id === undersecretaryFilter)?.name_ar ?? undersecretaryFilter}
                <button onClick={() => { setUndersecretaryFilter(''); setSectorFilter(''); setDeptFilter(''); }} aria-label="إزالة فلتر المستوى التنظيمي" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {sectorFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                القطاع: {sectors.find((s) => s.id === sectorFilter) ? formatSectorOption(sectors.find((s) => s.id === sectorFilter)!) : sectorFilter}
                <button onClick={() => { setSectorFilter(''); setDeptFilter(''); }} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {deptFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                الإدارة: {departments.find((d) => d.id === deptFilter)?.name_ar ?? deptFilter}
                <button onClick={() => setDeptFilter('')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {rankFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                المسمى الوظيفي: {rankFilter}
                <button onClick={() => setRankFilter('')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {leaveFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                الحالة: {leaveFilter === 'on_leave' ? 'في إجازة' : 'على رأس عمله'}
                <button onClick={() => setLeaveFilter('')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSectorFilter('');
                setUndersecretaryFilter('');
                setDeptFilter('');
                setRankFilter('');
                setLeaveFilter('');
              }}
              className="text-xs text-red-600 hover:text-red-800 underline mr-1 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> مسح الفلاتر
            </button>
          </div>
        )}

        <p className="text-xs text-slate-500">
          الموظفون المعروضون: {filteredMembers.length} من {members.length}
        </p>
      </div>

      {/* Desktop table */}
      {filteredMembers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title={members.length === 0 ? 'لا يوجد موظفون مسجلون' : 'لا يوجد موظفون مطابقون'}
            message={members.length === 0 ? 'يمكنك البدء بإضافة موظف جديد.' : 'جرّب تعديل البحث أو الفلاتر.'}
            action={members.length > 0
              ? <button className="btn-secondary" onClick={() => { setSearch(''); setUndersecretaryFilter(''); setSectorFilter(''); setDeptFilter(''); setRankFilter(''); setLeaveFilter(''); }}>مسح البحث والفلاتر</button>
              : canCreateLeader && <button className="btn-primary" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> إضافة موظف</button>}
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden 2xl:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="table-header w-12 text-center">م</th>
                    <th className="table-header min-w-[320px] whitespace-nowrap"><span className="inline-flex items-center gap-1"><SortButton label="المسمى الوظيفي" sortKey="rank" /><span className="text-slate-400">/</span><SortButton label="الاسم" sortKey="name" /></span></th>
                    <th className="table-header min-w-[150px] whitespace-nowrap"><SortButton label="رقم الملف / المدني" sortKey="file" /></th>
                    <th className="table-header min-w-[170px]">المنصب</th>
                    <th className="table-header min-w-[190px]">القطاع / الإدارة</th>
                    <th className="table-header min-w-[130px] whitespace-nowrap text-center"><SortButton label="الحالة" sortKey="status" /></th>
                    {(filteredMembers.some((m) => canEditLeader(m) || canArchiveLeader(m))) && <th className="table-header w-14 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((m) => {
                    const status = getMemberStatus(m.id);
                    const sc = memberStatusConfig[status];
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="table-cell text-slate-400 text-center">{filteredMembers.indexOf(m) + 1}</td>
                        <td className="table-cell min-w-[320px]">
                          <Link to={`/leaders/${m.id}`} className="flex items-center gap-3">
                            <RankInsignia rank={m.rank} size="sm" />
                            <PersonName rank={m.rank} name={m.full_name} />
                          </Link>
                        </td>
                        <td className="table-cell whitespace-nowrap text-center text-slate-700 font-semibold">{m.file_number}</td>
                        <td className="table-cell">{m.job_title}</td>
                        <td className="table-cell text-slate-500 max-w-[260px]">
                          <ExpandableOrgPath sector={m.sector} department={m.department} />
                        </td>
                        <td className="table-cell whitespace-nowrap text-center">
                          <span className="inline-flex whitespace-nowrap">
                            <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                          </span>
                        </td>
                        {(canEditLeader(m) || canArchiveLeader(m)) && (
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (menuAnchor?.id === m.id) {
                                  setMenuAnchor(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const menuHeight = (canEditLeader(m) ? 44 : 0) + (canArchiveLeader(m) ? 44 : 0);
                                  const openUpward = rect.bottom + menuHeight > window.innerHeight;
                                  setMenuAnchor({
                                    id: m.id,
                                    member: m,
                                    top: openUpward ? rect.top - menuHeight : rect.bottom + 4,
                                    left: Math.max(10, rect.left),
                                  });
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                menuAnchor?.id === m.id
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'hover:bg-slate-200 text-slate-500'
                              }`}
                              title="خيارات"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="2xl:hidden space-y-3">
            {filteredMembers.map((m) => {
              const status = getMemberStatus(m.id);
              const sc = memberStatusConfig[status];
              return (
                <Link key={m.id} to={`/leaders/${m.id}`} className="card p-4 block hover:shadow-card-hover transition-all">
                  {/* Top Header: Rank, Insignia, Name & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <RankInsignia rank={m.rank} size="sm" />
                      <div className="min-w-0 flex-1">
                        <PersonName rank={m.rank} name={m.full_name} />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                    </div>
                  </div>

                  {/* Card Body: Well-organized Details */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs">
                    {/* المنصب */}
                    {m.job_title && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-400 shrink-0 font-medium">المنصب:</span>
                        <span className="text-slate-800 font-semibold flex-1 leading-relaxed">{m.job_title}</span>
                      </div>
                    )}

                    {/* القطاع / الإدارة */}
                    {(m.sector?.name_ar || m.department?.name_ar) && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-400 shrink-0 font-medium">القطاع / الإدارة:</span>
                        <div className="text-slate-600 flex-1 leading-relaxed min-w-0">
                          <ExpandableOrgPath sector={m.sector} department={m.department} />
                        </div>
                      </div>
                    )}

                    {/* رقم الملف / المدني */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-slate-100">
                      <span className="text-slate-400 font-medium">رقم الملف / المدني:</span>
                      <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md text-xs">
                        {m.file_number}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {formOpen && (editingMember ? canEditLeader(editingMember) : canCreateLeader) && (
        <MemberFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); setSaveSuccess(editingMember ? 'تم تحديث بيانات الموظف.' : 'تمت إضافة الموظف.'); refetch(); }}
          editingMember={editingMember}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => { setArchiveTarget(null); setArchiveError(null); }}
        onConfirm={handleArchive}
        busy={archiveBusy}
        closeOnConfirm={false}
        error={archiveError}
        title="أرشفة الموظف"
        message={<>هل أنت متأكد من أرشفة «<ResponsivePersonName name={archiveTarget?.full_name} />»؟ لن تظهر في القوائم الرئيسية ولكن ستبقى سجلات الإجازات محفوظة.</>}
        confirmLabel="أرشفة"
        danger
      />

      {menuAnchor &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${menuAnchor.top}px`,
              left: `${menuAnchor.left}px`,
              zIndex: 99999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 w-36 animate-fade-in"
          >
            {canEditLeader(menuAnchor.member) && <button
              onClick={() => {
                setEditingMember(menuAnchor.member);
                setFormOpen(true);
                setMenuAnchor(null);
              }}
              className="w-full px-3.5 py-2 text-right text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors font-medium"
            >
              <Edit2 className="w-4 h-4 text-slate-500" />
              <span>تعديل</span>
            </button>}
            {canArchiveLeader(menuAnchor.member) && <button
              onClick={() => {
                setArchiveTarget(menuAnchor.member);
                setMenuAnchor(null);
              }}
              className="w-full px-3.5 py-2 text-right text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-medium"
            >
              <Archive className="w-4 h-4 text-red-500" />
              <span>أرشفة</span>
            </button>}
          </div>,
          document.body
        )}
    </div>
  );
}
