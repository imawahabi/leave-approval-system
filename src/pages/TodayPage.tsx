import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, UserCheck, Plane, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/Skeleton';
import { memberStatusConfig } from '@/constants';
import { compareLeaders } from '@/utils/leaderOrder';
import { addDays, todayInKuwait, formatDate, isCurrentlyOnLeave, daysUntil } from '@/utils/date';
import { PersonName } from '@/components/PersonName';
import { RankInsignia } from '@/components/RankInsignia';
import type { LeadershipLeave, LeadershipMember } from '@/types';

interface TodayEntry {
  member: LeadershipMember;
  leave: LeadershipLeave | null;
  type: 'at_work' | 'on_leave' | 'on_leave_today' | 'returning_today';
}

export function TodayPage() {
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, leavesRes] = await Promise.all([
        supabase.from('leadership_members').select('*, sector:sectors(*), department:departments(*)').eq('is_active', true),
        supabase
          .from('leadership_leaves')
          .select('*, leave_type:leave_types(*)')
          .eq('approval_status', 'approved')
          .neq('status', 'cancelled')
          .gte('end_date', addDays(todayInKuwait(), -7)),
      ]);
      if (membersRes.error) throw membersRes.error;
      const members = (membersRes.data as LeadershipMember[]) || [];
      members.sort(compareLeaders);
      if (leavesRes.error) throw leavesRes.error;
      const leaves = (leavesRes.data as LeadershipLeave[]) ?? [];
      const leavesByMember = new Map<string, LeadershipLeave[]>();
      leaves.forEach((l) => {
        const arr = leavesByMember.get(l.leadership_member_id) ?? [];
        arr.push(l);
        leavesByMember.set(l.leadership_member_id, arr);
      });

      const result: TodayEntry[] = members.map((m) => {
        const memberLeaves = leavesByMember.get(m.id) ?? [];
        const startingToday = memberLeaves.find((l) => daysUntil(l.start_date) === 0);
        const returningToday = memberLeaves.find((l) => isCurrentlyOnLeave(l.start_date, l.end_date, l.status) && daysUntil(l.end_date) === 0);
        const active = memberLeaves.find((l) => isCurrentlyOnLeave(l.start_date, l.end_date, l.status));

        if (startingToday) return { member: m, leave: startingToday, type: 'on_leave_today' };
        if (returningToday) return { member: m, leave: returningToday, type: 'returning_today' };
        if (active) return { member: m, leave: active, type: 'on_leave' };
        return { member: m, leave: null, type: 'at_work' };
      });
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const groups = {
    at_work: entries.filter((e) => e.type === 'at_work'),
    on_leave: entries.filter((e) => e.type === 'on_leave'),
    on_leave_today: entries.filter((e) => e.type === 'on_leave_today'),
    returning_today: entries.filter((e) => e.type === 'returning_today'),
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">حالة الموظفين اليوم</h1>
        </div>
        <div className="card p-6"><TableSkeleton rows={5} cols={4} /></div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={fetch} />;

  const sections = [
    { key: 'on_leave_today' as const, title: 'تبدأ إجازاتهم اليوم', empty: 'لا توجد حالات في هذه المجموعة اليوم', icon: UserPlus, color: 'text-blue-600', items: groups.on_leave_today },
    { key: 'returning_today' as const, title: 'تنتهي إجازاتهم اليوم', empty: 'لا توجد حالات في هذه المجموعة اليوم', icon: CalendarCheck, color: 'text-teal-600', items: groups.returning_today },
    { key: 'on_leave' as const, title: 'في إجازة حاليًا', empty: 'لا يوجد موظفون في إجازة حاليًا', icon: Plane, color: 'text-amber-600', items: groups.on_leave },
    { key: 'at_work' as const, title: 'في العمل اليوم', empty: 'لا يوجد موظفون في العمل اليوم', icon: UserCheck, color: 'text-emerald-600', items: groups.at_work },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="w-11 h-11 rounded-xl bg-primary-700 flex items-center justify-center text-white shadow-sm shrink-0">
          <CalendarCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">حالة الموظفين اليوم</h1>
          <p className="text-sm text-slate-600">{formatDate(todayInKuwait())}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card"><EmptyState title="لا يوجد موظفون مسجلون" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 sm:gap-6">
          {sections.map((section) => (
            <div key={section.key} className="card-elevated overflow-hidden">
              <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0`}>
                    <section.icon className={`w-4 h-4 ${section.color}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="section-title">{section.title}</h2>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">{section.items.length}</span>
              </div>
              {section.items.length === 0 ? (
                <EmptyState title={section.empty} />
              ) : (
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {section.items.map((entry) => (
                    <Link
                      key={entry.member.id}
                      to={`/leaders/${entry.member.id}`}
                      className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 active:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <RankInsignia rank={entry.member.rank} size="sm" />
                        <div className="min-w-0">
                          <PersonName rank={entry.member.rank} name={entry.member.full_name} size="sm" />
                          <p className="text-xs text-slate-500 truncate mt-0.5">{entry.member.job_title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.leave && (
                          <span className="text-xs text-slate-500 hidden sm:block">
                            <bdi>{formatDate(entry.leave.start_date)}</bdi> - <bdi>{formatDate(entry.leave.end_date)}</bdi>
                          </span>
                        )}
                        <Badge
                          label={memberStatusConfig[entry.type].label}
                          color={memberStatusConfig[entry.type].color}
                          bg={memberStatusConfig[entry.type].bg}
                          dot={memberStatusConfig[entry.type].dot}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
