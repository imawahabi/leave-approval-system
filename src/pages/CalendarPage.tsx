import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Calendar as CalendarIcon, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { addDays, formatDate, toISODate, parseISODate, todayInKuwait } from '@/utils/date';
import { RankInsignia } from '@/components/RankInsignia';
import { compareLeaders } from '@/utils/leaderOrder';
import { PersonName, getFirstAndLastName } from '@/components/PersonName';
import type { LeadershipLeave } from '@/types';

const weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function CalendarPage() {
  const [view, setView] = useState<'month' | 'timeline'>('month');
  const [currentDate, setCurrentDate] = useState(() => parseISODate(todayInKuwait()));
  const [leaves, setLeaves] = useState<LeadershipLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const [selectedDate, setSelectedDate] = useState(todayInKuwait());

  const fetchLeaves = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - 7);
    const end = new Date(year, month + 1, 0);
    end.setDate(end.getDate() + 7);
    const { data, error } = await supabase
      .from('leadership_leaves')
      .select('*, leave_type:leave_types(*), leadership_member:leadership_member_id(*)')
      .eq('approval_status', 'approved')
      .neq('status', 'cancelled')
      .lte('start_date', toISODate(end))
      .gte('end_date', toISODate(start))
      .order('start_date');
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else setLeaves((data as LeadershipLeave[]) ?? []);
    setLoading(false);
  }, [currentDate]);

  useEffect(() => {
    void fetchLeaves();
    return () => { requestVersion.current += 1; };
  }, [fetchLeaves]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentDate]);

  const getLeavesOnDate = (date: Date): LeadershipLeave[] => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return leaves.filter((l) => l.start_date <= dateStr && l.end_date >= dateStr);
  };

  const isToday = (d: Date) => toISODate(d) === todayInKuwait();

  const selectedLeaves = getLeavesOnDate(parseISODate(selectedDate));
  const chooseDate = (date: string) => {
    setSelectedDate(date);
    const parsed = parseISODate(date);
    if (parsed.getMonth() !== currentDate.getMonth() || parsed.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  };
  const changeMonth = (offset: number) => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    setCurrentDate(next);
    setSelectedDate(toISODate(next));
  };

  if (error) return <ErrorState message={error} onRetry={fetchLeaves} />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 shrink-0">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">التقويم</h1>
          <p className="text-sm text-slate-600">متابعة إجازات الموظفين</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'month' ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`} onClick={() => setView('month')}>عرض شهري</button>
        <button className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'timeline' ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`} onClick={() => setView('timeline')}>الخط الزمني</button>
      </div>

      {view === 'month' ? (
        <>
          <div className="card p-4 sm:hidden" aria-live="polite">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button type="button" onClick={() => chooseDate(addDays(selectedDate, -1))} aria-label="اليوم السابق" className="min-h-11 min-w-11 rounded-lg border border-slate-200 flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
              <div className="text-center min-w-0"><h2 className="text-sm font-bold text-slate-900">{formatDate(selectedDate)}</h2><p className="text-xs text-slate-500">إجازات اليوم المحدد: {selectedLeaves.length}</p></div>
              <button type="button" onClick={() => chooseDate(addDays(selectedDate, 1))} aria-label="اليوم التالي" className="min-h-11 min-w-11 rounded-lg border border-slate-200 flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
            </div>
            {loading ? <Skeleton className="h-20 w-full" /> : <DayLeaves leaves={selectedLeaves} />}
          </div>
          {/* Month navigation */}
          <div className="card p-3 sm:p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">{months[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
              <div className="flex items-center gap-1 sm:gap-2">
                <button type="button" aria-label="الشهر السابق" onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 active:bg-slate-200"><ChevronRight className="w-5 h-5" /></button>
                <button type="button" onClick={() => chooseDate(todayInKuwait())} className="btn-secondary text-xs px-2.5 py-1.5">اليوم</button>
                <button type="button" aria-label="الشهر التالي" onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 active:bg-slate-200"><ChevronLeft className="w-5 h-5" /></button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
            ) : (
              <>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
                  {weekDays.map((d) => <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-slate-500 py-1.5 sm:py-2">{d}</div>)}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((date, i) => {
                    if (!date) return <div key={i} className="rounded-lg bg-slate-50/50" />;
                    const dayLeaves = getLeavesOnDate(date);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => chooseDate(dateStr)}
                        aria-label={`${formatDate(dateStr)}، ${dayLeaves.length} إجازة`}
                        aria-pressed={selectedDate === dateStr}
                        className={`min-h-[60px] sm:min-h-[100px] p-1 sm:p-1.5 rounded-lg border text-right transition-colors ${
                          isToday(date) ? 'border-primary-500 bg-primary-50/30' : 'border-slate-100 hover:bg-slate-50'
                        } ${selectedDate === dateStr ? 'ring-2 ring-primary-500/30' : ''}`}
                      >
                        <span className={`text-[10px] sm:text-xs font-medium ${isToday(date) ? 'text-primary-700' : 'text-slate-600'}`}>{date.getDate()}</span>
                        <div className="mt-0.5 sm:mt-1 space-y-0.5">
                          {dayLeaves.slice(0, 2).map((l) => {
                            const rank = l.leadership_member?.rank;
                            const shortName = getFirstAndLastName(l.leadership_member?.full_name);
                            return (
                              <div
                                key={l.id}
                                className="text-[9px] sm:text-[10px] truncate px-1 sm:px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 font-medium hidden sm:block leading-tight"
                                title={`${rank ? `${rank} / ` : ''}${l.leadership_member?.full_name}`}
                              >
                                {rank && <span className="font-bold">{rank} / </span>}
                                <span>{shortName}</span>
                              </div>
                            );
                          })}
                          {dayLeaves.length > 0 && <div className="sm:hidden flex gap-0.5 flex-wrap"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /></div>}
                          {dayLeaves.length > 2 && <div className="text-[10px] text-slate-400 px-1 hidden sm:block">+{dayLeaves.length - 2}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Selected date details */}
          {selectedDate && (
            <div className="card p-4 sm:p-5 hidden sm:block">
              <h3 className="text-sm font-bold text-slate-900 mb-3">إجازات يوم {formatDate(selectedDate)}</h3>
              {loading ? <Skeleton className="h-20 w-full" /> : <DayLeaves leaves={selectedLeaves} />}
            </div>
          )}
        </>
      ) : (
        <TimelineView leaves={leaves} loading={loading} currentDate={currentDate} />
      )}
    </div>
  );
}

function DayLeaves({ leaves }: { leaves: LeadershipLeave[] }) {
  if (!leaves.length) return <p className="py-4 text-center text-sm text-slate-500">لا توجد إجازات في هذا اليوم.</p>;
  return <div className="divide-y divide-slate-100">
    {leaves.map((leave) => <Link key={leave.id} to={`/leaders/${leave.leadership_member_id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50 focus-visible:bg-slate-50">
      <div className="flex items-center gap-2 min-w-0"><RankInsignia rank={leave.leadership_member?.rank} size="sm" /><div className="min-w-0"><PersonName rank={leave.leadership_member?.rank} name={leave.leadership_member?.full_name ?? '-'} /><p className="text-xs text-slate-500">{leave.leave_type?.name_ar}</p></div></div>
      <span className="shrink-0 text-xs text-slate-500 text-left"><bdi>{formatDate(leave.start_date)}</bdi><br /><bdi>{formatDate(leave.end_date)}</bdi></span>
    </Link>)}
  </div>;
}

function TimelineView({ leaves, loading, currentDate }: { leaves: LeadershipLeave[]; loading: boolean; currentDate: Date }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const membersWithLeaves = useMemo(() => {
    const map = new Map<string, { id: string; full_name: string; rank: string; job_title: string; leaves: LeadershipLeave[] }>();
    leaves.forEach((l) => {
      if (!l.leadership_member) return;
      const mid = l.leadership_member.id;
      if (!map.has(mid)) map.set(mid, { id: mid, full_name: l.leadership_member.full_name, rank: l.leadership_member.rank, job_title: l.leadership_member.job_title, leaves: [] });
      map.get(mid)!.leaves.push(l);
    });
    return Array.from(map.values()).sort(compareLeaders);
  }, [leaves]);

  const getLeaveBar = (memberLeaves: LeadershipLeave[], day: number): LeadershipLeave | null => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return memberLeaves.find((l) => l.start_date <= dateStr && l.end_date >= dateStr) ?? null;
  };

  if (loading) return <div className="card p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="card-elevated overflow-hidden">
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-slate-600" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title">الخط الزمني - {months[month]} {year}</h2>
          <p className="text-xs text-slate-400">تداخل إجازات الموظفين</p>
        </div>
      </div>
      {membersWithLeaves.length === 0 ? (
        <EmptyState title="لا توجد إجازات في هذا الشهر" />
      ) : (
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <div className="min-w-[640px] sm:min-w-[800px]">
            {/* Day headers */}
            <div className="flex border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="w-48 shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-l border-slate-100">المسمى الوظيفي / الاسم</div>
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const date = new Date(year, month, d);
                const isWeekend = date.getDay() === 5 || date.getDay() === 6;
                return (
                  <div key={d} className={`w-8 shrink-0 text-center py-2 text-[10px] border-l border-slate-50 ${isWeekend ? 'bg-slate-50 text-slate-400' : 'text-slate-600'}`}>
                    {d}
                  </div>
                );
              })}
            </div>
            {/* Member rows */}
            {membersWithLeaves.map((m) => (
              <div key={m.id} className="flex border-b border-slate-50 hover:bg-slate-50/50">
                <div className="w-48 shrink-0 px-3 py-2 text-xs border-l border-slate-100 truncate">
                  <PersonName rank={m.rank} name={m.full_name} size="sm" />
                </div>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = i + 1;
                  const leave = getLeaveBar(m.leaves, d);
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isStart = leave?.start_date === dateStr;
                  return (
                    <div key={d} className="w-8 shrink-0 border-l border-slate-50 relative">
                      {leave && (
                        <div
                          className={`absolute inset-y-1 ${isStart ? 'rounded-r' : ''} ${leave.end_date === dateStr ? 'rounded-l' : ''} ${
                            leave.status === 'cancelled' ? 'bg-red-200' : 'bg-amber-200'
                          }`}
                          title={`${m.full_name} - ${formatDate(leave.start_date)} إلى ${formatDate(leave.end_date)}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
