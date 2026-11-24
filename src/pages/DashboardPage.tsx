import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Plane, CalendarPlus, ArrowLeft, Send, BadgeCheck, CheckCircle2, FileText, ClipboardCheck, UserCheck, Users, Archive } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CardSkeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/Badge';
import { PersonName, ResponsivePersonName } from '@/components/PersonName';
import { RankInsignia } from '@/components/RankInsignia';
import { statusConfig } from '@/constants';
import { formatDate, formatDayCount, getRelativeDaysLabel, daysUntil, isCurrentlyOnLeave } from '@/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import type { LeadershipLeave, LeadershipMember } from '@/types';

interface DashboardStats {
  totalLeaders: number;
  atWorkToday: number;
  onLeaveToday: number;
  upcomingLeaders: number;
  approvedLeaves: number;
  pendingLeaves: number;
  pendingStage1: number;
  pendingStage2: number;
  rejectedLeaves: number;
}

export function DashboardPage() {
  const { isAdmin, permissions } = useAuth();
  const hasReviewPermission = isAdmin || permissions.some((p) => p.permission_code === 'approve_undersecretary' || p.permission_code === 'approve_minister');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [currentLeaves, setCurrentLeaves] = useState<LeadershipLeave[]>([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState<LeadershipLeave[]>([]);
  const [recentLeaves, setRecentLeaves] = useState<LeadershipLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const fetchDashboard = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, leavesRes, approvalCounts, recentRes] = await Promise.all([
        supabase.from('leadership_members').select('id, is_active').eq('is_active', true),
        supabase
          .from('leadership_leaves')
          .select(`
            *,
            leave_type:leave_types(*),
            leadership_member:leadership_member_id(*, sector:sectors(*), department:departments(*))
          `)
          .eq('approval_status', 'approved')
          .neq('status', 'cancelled')
          .order('start_date'),
        hasReviewPermission ? Promise.all([
          supabase.from('leadership_leaves').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved').neq('status', 'cancelled'),
          supabase.from('leadership_leaves').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending').neq('status', 'cancelled'),
          supabase.from('leadership_leaves').select('*', { count: 'exact', head: true }).eq('approval_status', 'rejected').neq('status', 'cancelled'),
          supabase.from('leadership_leaves').select('*', { count: 'exact', head: true }).eq('workflow_status', 'pending_stage_1').neq('status', 'cancelled'),
          supabase.from('leadership_leaves').select('*', { count: 'exact', head: true }).eq('workflow_status', 'pending_stage_2').neq('status', 'cancelled'),
        ]) : Promise.resolve(null),
        hasReviewPermission ? supabase
          .from('leadership_leaves')
          .select(`
            id,
            start_date,
            end_date,
            total_days,
            status,
            approval_status,
            workflow_status,
            current_approval_stage,
            created_at,
            created_by,
            notes,
            leave_type:leave_types(name_ar),
            leadership_member:leadership_member_id(*, sector:sectors(*), department:departments(*))
          `)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(25)
          : Promise.resolve({ data: [] }),
      ]);
      if (request !== requestVersion.current) return;

      if (membersRes.error) throw membersRes.error;
      if (leavesRes.error) throw leavesRes.error;
      if (approvalCounts) {
        const countError = approvalCounts.find((result) => result.error)?.error;
        if (countError) throw countError;
      }

      const members = membersRes.data as LeadershipMember[];
      const leaves = (leavesRes.data as LeadershipLeave[]) ?? [];

      const activeMemberIds = new Set(members.map((member) => member.id));
      const active = leaves.filter((l) => activeMemberIds.has(l.leadership_member_id) && isCurrentlyOnLeave(l.start_date, l.end_date, l.status));
      const leadersOnLeave = new Set(active.map((leave) => leave.leadership_member_id)).size;
      const upcomingMemberIds = new Set<string>();
      const upcoming = leaves
        .filter((leave) => activeMemberIds.has(leave.leadership_member_id) && daysUntil(leave.start_date) > 0)
        .filter((leave) => {
          if (upcomingMemberIds.has(leave.leadership_member_id)) return false;
          upcomingMemberIds.add(leave.leadership_member_id);
          return true;
        });

      setStats({
        totalLeaders: members.length,
        atWorkToday: members.length - leadersOnLeave,
        onLeaveToday: leadersOnLeave,
        upcomingLeaders: upcoming.length,
        approvedLeaves: approvalCounts?.[0]?.count ?? 0,
        pendingLeaves: approvalCounts?.[1]?.count ?? 0,
        rejectedLeaves: approvalCounts?.[2]?.count ?? 0,
        pendingStage1: approvalCounts?.[3]?.count ?? 0,
        pendingStage2: approvalCounts?.[4]?.count ?? 0,
      });
      setCurrentLeaves(active);
      setUpcomingLeaves(upcoming);
      const recentLeaves = (recentRes?.data as LeadershipLeave[]) ?? [];
      const creatorIds = [...new Set(recentLeaves.map((leave) => leave.created_by).filter(Boolean))] as string[];
      if (creatorIds.length) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds);
        if (request !== requestVersion.current) return;
        const profileMap = new Map((profilesData ?? []).map((profile) => [profile.id, profile]));
        setRecentLeaves(recentLeaves.map((leave) => ({
          ...leave,
          creator: leave.created_by ? profileMap.get(leave.created_by) ?? null : null,
        })));
      } else {
        setRecentLeaves(recentLeaves);
      }
    } catch (err) {
      if (request === requestVersion.current) setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [hasReviewPermission]);

  useEffect(() => {
    void fetchDashboard();
    return () => { requestVersion.current += 1; };
  }, [fetchDashboard]);

  // Re-fetch when a review decision is made in ReviewPage
  useEffect(() => {
    const handler = () => fetchDashboard();
    window.addEventListener('app:review-updated', handler);
    return () => window.removeEventListener('app:review-updated', handler);
  }, [fetchDashboard]);

  if (loading && !stats) {
    return (
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="card p-6"><CardSkeleton /></div>
      </div>
    );
  }

  if (error && !stats) {
    return <ErrorState message={error} onRetry={fetchDashboard} />;
  }

  const todayLabel = new Intl.DateTimeFormat('ar-uk-u-nu-latn', {
    timeZone: 'Asia/Kuwait', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
  const attendancePercent = stats?.totalLeaders ? Math.round((stats.atWorkToday / stats.totalLeaders) * 100) : 0;
  const pendingReviewActions = (stats?.pendingLeaves ?? 0) > 0
    ? stats!.pendingLeaves
    : ((stats?.pendingStage1 ?? 0) + (stats?.pendingStage2 ?? 0));
  const showReviewSection = (isAdmin || hasReviewPermission) && pendingReviewActions > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary-700 flex items-center justify-center text-white shadow-sm shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">ملخص الإجازات</h1>
            <p className="text-xs sm:text-sm text-slate-500 truncate">{todayLabel}</p>
          </div>
        </div>
      </div>

      {/* ── Top Daily Presence & Leave Summary (Balanced 4-card Grid) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-label="الإحصائيات السريعة">
        {/* في العمل - أخضر إيجابي */}
        <Link
          to="/today"
          className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all duration-200"
        >
          {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
          <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-slate-900 tabular-nums">
                  {stats?.atWorkToday ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">موظف</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">في العمل اليوم</p>
            </div>
          </div>

          {/* نمط الشاشات الكبيرة: رأسي موحد بدون بادجات */}
          <div className="hidden sm:block">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="mt-3.5">
              <p className="text-xs font-medium text-slate-500">في العمل اليوم</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {stats?.atWorkToday ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-medium">موظف</span>
              </div>
            </div>
          </div>
        </Link>

        {/* في إجازة اليوم - محايد */}
        <Link
          to="/leaves"
          className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
        >
          {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
          <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Plane className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-slate-900 tabular-nums">
                  {stats?.onLeaveToday ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">موظف</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">في إجازة اليوم</p>
            </div>
          </div>

          {/* نمط الشاشات الكبيرة: رأسي موحد بدون بادجات */}
          <div className="hidden sm:block">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Plane className="w-5 h-5" />
            </div>
            <div className="mt-3.5">
              <p className="text-xs font-medium text-slate-500">في إجازة اليوم</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {stats?.onLeaveToday ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-medium">موظف</span>
              </div>
            </div>
          </div>
        </Link>

        {/* إجازات قادمة - محايد */}
        <Link
          to="/leaves"
          className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
        >
          {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
          <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-slate-900 tabular-nums">
                  {stats?.upcomingLeaders ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">موظف</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">إجازات قادمة</p>
            </div>
          </div>

          {/* نمط الشاشات الكبيرة: رأسي موحد بدون بادجات */}
          <div className="hidden sm:block">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div className="mt-3.5">
              <p className="text-xs font-medium text-slate-500">إجازات قادمة</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {stats?.upcomingLeaders ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-medium">موظف</span>
              </div>
            </div>
          </div>
        </Link>

        {/* إجمالي الموظفين - محايد مع بادج نسبة الحضور العائم */}
        <Link
          to="/leaders"
          className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
        >
          {/* بادج نسبة الحضور بشكل عائم فقط للحفاظ على ارتفاع ومساحات متساوية لجميع الكروت */}
          <span className="absolute left-2.5 top-2.5 sm:left-4 sm:top-4 inline-flex items-center text-[10px] sm:text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/90 px-1.5 sm:px-2 py-0.5 rounded-lg shadow-2xs pointer-events-none">
            {attendancePercent}% حضور
          </span>

          {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
          <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-slate-900 tabular-nums">
                  {stats?.totalLeaders ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">موظف</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">إجمالي الموظفين</p>
            </div>
          </div>

          {/* نمط الشاشات الكبيرة: رأسي موحد */}
          <div className="hidden sm:block">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div className="mt-3.5">
              <p className="text-xs font-medium text-slate-500">إجمالي الموظفين</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {stats?.totalLeaders ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-medium">موظف مسجل</span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Leave workflow and review status ── */}
      {showReviewSection && (
        <div className="card-elevated overflow-hidden flex flex-col">
          {/* Card Header */}
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/60 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-4 h-4 text-slate-700" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">حالات ومراحل الإجازات</h2>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {pendingReviewActions} بانتظار الإجراء
              </span>
              <Link
                to="/review"
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors shadow-2xs"
              >
                المراجعة
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 4 Pipeline Status Cards (مبسطة ومتناسقة أفقياً في الهواتف ورأسياً في الشاشات الكبيرة) */}
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Stage 1: المدير العام - محايد */}
              <Link
                to="/review?stage=undersecretary&state=pending"
                className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
              >
                {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
                <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Send className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-900 tabular-nums">
                        {stats?.pendingStage1 ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">طلب</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 leading-tight mt-0.5 line-clamp-2">مكتب المدير العام</p>
                  </div>
                </div>

                {/* نمط الشاشات الكبيرة: رأسي موحد */}
                <div className="hidden sm:block">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Send className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5">
                    <p className="text-xs font-medium text-slate-500">مكتب المدير العام</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                        {stats?.pendingStage1 ?? 0}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">طلب قيد التدقيق</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Stage 2: رئيس الجهة - محايد */}
              <Link
                to="/review?stage=minister&state=pending"
                className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
              >
                {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
                <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <BadgeCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-900 tabular-nums">
                        {stats?.pendingStage2 ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">طلب</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 leading-tight mt-0.5 line-clamp-2">مكتب رئيس الجهة</p>
                  </div>
                </div>

                {/* نمط الشاشات الكبيرة: رأسي موحد */}
                <div className="hidden sm:block">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <BadgeCheck className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5">
                    <p className="text-xs font-medium text-slate-500">مكتب رئيس الجهة</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                        {stats?.pendingStage2 ?? 0}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">طلب بانتظار العرض</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Result 1: تم العرض - أخضر إيجابي */}
              <Link
                to="/review?stage=minister&state=approved"
                className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all duration-200"
              >
                {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
                <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-emerald-700 tabular-nums">
                        {stats?.approvedLeaves ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">إجازة</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">تم العرض</p>
                  </div>
                </div>

                {/* نمط الشاشات الكبيرة: رأسي موحد */}
                <div className="hidden sm:block">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5">
                    <p className="text-xs font-medium text-slate-500">تم العرض</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight tabular-nums">
                        {stats?.approvedLeaves ?? 0}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">إجازة تم عرضها</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Result 2: مؤرشفة - محايد */}
              <Link
                to="/review?state=rejected"
                className="group relative overflow-hidden rounded-2xl bg-white p-3 sm:p-5 border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200"
              >
                {/* نمط الهواتف: أفقي (أيقونة ثم العدد والنص) */}
                <div className="flex sm:hidden items-center gap-2.5 w-full min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-lg font-black tabular-nums ${(stats?.rejectedLeaves ?? 0) > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                        {stats?.rejectedLeaves ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">طلب</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">طلبات مؤرشفة</p>
                  </div>
                </div>

                {/* نمط الشاشات الكبيرة: رأسي موحد */}
                <div className="hidden sm:block">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div className="mt-3.5">
                    <p className="text-xs font-medium text-slate-500">طلبات مؤرشفة</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums ${(stats?.rejectedLeaves ?? 0) > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                        {stats?.rejectedLeaves ?? 0}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">طلب مؤرشف</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: 2 columns on lg screens */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Current leaves */}
        <div className="card-elevated overflow-hidden flex flex-col">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Plane className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">الموظفون في إجازة حاليًا</h2>
                <p className="text-xs text-slate-400">عدد الموظفين في إجازة: {currentLeaves.length}</p>
              </div>
            </div>
            <Link to="/leaves" className="text-xs text-primary-700 hover:text-primary-800 font-medium flex items-center gap-1 shrink-0">
              <ArrowLeft className="w-3 h-3" /> عرض الكل
            </Link>
          </div>
          {currentLeaves.length === 0 ? (
            <EmptyState icon={<Plane className="w-7 h-7" />} title="لا يوجد موظفون في إجازة حاليًا" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {currentLeaves.map((leave) => {
                const sc = statusConfig.active;
                const member = leave.leadership_member;
                return (
                  <Link key={leave.id} to={`/leaders/${member?.id}`} className="px-4 sm:px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4 hover:bg-slate-50/70 focus-visible:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <RankInsignia rank={member?.rank} size="sm" />
                      <div className="min-w-0">
                        <span className="block">
                          <PersonName rank={member?.rank} name={member?.full_name ?? '-'} />
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 truncate">
                          {member?.job_title && <span>{member.job_title}</span>}
                          {member?.job_title && member?.department?.name_ar && <span className="text-slate-300">·</span>}
                          {member?.department?.name_ar && <span className="truncate text-slate-400">{member.department.name_ar}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-2.5 md:gap-3 shrink-0 mr-11 md:mr-0">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="font-medium">
                          <bdi>{formatDate(leave.start_date)}</bdi>
                          <span className="text-slate-400 mx-1.5">-</span>
                          <bdi>{formatDate(leave.end_date)}</bdi>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded whitespace-nowrap">
                          {formatDayCount(leave.total_days)}
                        </span>
                      </div>
                      <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming leaves */}
        <div className="card-elevated overflow-hidden flex flex-col">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <CalendarPlus className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">الموظفون الذين تبدأ إجازاتهم لاحقًا</h2>
                <p className="text-xs text-slate-400">عدد الموظفون الذين لديهم إجازات قادمة: {upcomingLeaves.length}</p>
              </div>
            </div>
            <Link to="/leaves" className="text-xs text-blue-700 hover:text-blue-800 font-medium">عرض الكل</Link>
          </div>
          {upcomingLeaves.length === 0 ? (
            <EmptyState icon={<CalendarPlus className="w-7 h-7" />} title="لا توجد إجازات قادمة" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {upcomingLeaves.map((leave) => {
                const member = leave.leadership_member;
                return (
                  <Link key={leave.id} to={`/leaders/${member?.id}`} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 focus-visible:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <RankInsignia rank={member?.rank} size="xs" />
                      <div className="min-w-0 flex-1">
                        <span>
                          <PersonName rank={member?.rank} name={member?.full_name ?? '-'} size="sm" />
                        </span>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{leave.leave_type?.name_ar ?? 'إجازة'} · تبدأ {formatDate(leave.start_date)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/50 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                      {getRelativeDaysLabel(leave.start_date)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>


        {/* Recent Leaves Log (for admins/reviewers) */}
        {hasReviewPermission && recentLeaves.length > 0 && (
          <div className="card-elevated overflow-hidden flex flex-col">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="section-title">سجل آخر الإجازات</h2>
                  <p className="text-xs text-slate-400">آخر الإجازات المسجلة في النظام</p>
                </div>
              </div>
              <Link to="/review" className="text-xs text-primary-700 hover:text-primary-800 font-medium flex items-center gap-1 shrink-0">
                <ArrowLeft className="w-3 h-3" /> صفحة المراجعة
              </Link>
            </div>
            <div className="divide-y divide-slate-100 max-h-[310px] overflow-y-auto overscroll-contain">
              {recentLeaves.map((leave) => {
                const member = leave.leadership_member;
                const ws = leave.workflow_status;
                const approvalLabel =
                  ws === 'approved' ? 'تم العرض'
                    : ws === 'pending_stage_1' ? 'بانتظار التدقيق والإحالة'
                      : ws === 'pending_stage_2' ? 'بانتظار العرض'
                        : ws === 'rejected_stage_1' ? 'مؤرشف (مكتب المدير العام)'
                          : ws === 'rejected_stage_2' ? 'مؤرشف (مكتب رئيس الجهة)'
                            : leave.approval_status === 'approved' ? 'تم العرض'
                              : leave.approval_status === 'rejected' ? 'مؤرشف'
                                : leave.current_approval_stage === 2 ? 'بانتظار العرض' : 'بانتظار التدقيق والإحالة';
                const approvalColor =
                  ws === 'approved' || leave.approval_status === 'approved'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : ws === 'pending_stage_2'
                      ? 'text-blue-700 bg-blue-50 border-blue-200'
                      : ws?.startsWith('rejected') || leave.approval_status === 'rejected'
                        ? 'text-slate-700 bg-slate-50 border-slate-200'
                        : 'text-amber-700 bg-amber-50 border-amber-200';
                const dotColor =
                  ws === 'approved' || leave.approval_status === 'approved'
                    ? 'bg-emerald-500'
                    : ws === 'pending_stage_2'
                      ? 'bg-blue-500'
                      : ws?.startsWith('rejected') || leave.approval_status === 'rejected'
                        ? 'bg-slate-400'
                        : 'bg-amber-500';

                return (
                  <Link
                    key={leave.id}
                    to={member?.id ? `/leaders/${member.id}` : '/review'}
                    className="px-4 sm:px-5 py-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 w-full sm:w-auto">
                      <RankInsignia rank={member?.rank} size="xs" />
                      <div className="min-w-0">
                        <span className="block">
                          <PersonName rank={member?.rank} name={member?.full_name ?? '-'} size="sm" />
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 truncate">
                          <span>{leave.leave_type?.name_ar ?? 'إجازة'}</span>
                          <span className="text-slate-300">·</span>
                          <span>{formatDayCount(leave.total_days)}</span>
                          <span className="hidden sm:inline text-slate-300">·</span>
                          <span className="hidden sm:inline text-slate-400">{formatDate(leave.start_date)}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          سجل {formatDate(leave.created_at)}
                          {isAdmin && leave.creator && (
                            <span className="mr-1.5"> · <ResponsivePersonName name={leave.creator.full_name ?? leave.creator.email} /></span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="self-start sm:self-auto">
                      <Badge
                        label={approvalLabel}
                        color={approvalColor.split(' ')[0]}
                        bg={approvalColor.split(' ').slice(1).join(' ')}
                        dot={dotColor}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
