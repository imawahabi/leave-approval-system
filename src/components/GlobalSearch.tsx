import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, ExternalLink, CalendarDays, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { RankInsignia } from './RankInsignia';
import { PersonName } from './PersonName';
import { formatDate, getLeaveStatus } from '@/utils/date';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import { compareLeaders } from '@/utils/leaderOrder';
import type { LeadershipMember, LeadershipLeave } from '@/types';
import { ExpandableOrgPath } from './ExpandableOrgPath';

interface SearchResult {
  member: LeadershipMember;
  leaves: LeadershipLeave[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'في إجازة', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200/60' },
  upcoming: { label: 'قادمة', color: 'text-slate-700 bg-slate-100 border border-slate-200/70' },
  returning_soon: { label: 'تنتهي قريبًا', color: 'text-slate-700 bg-slate-100 border border-slate-200/70' },
  completed: { label: 'منتهية', color: 'text-slate-500 bg-slate-100/80 border border-slate-200/60' },
  cancelled: { label: 'ملغاة', color: 'text-rose-700 bg-rose-50 border border-rose-200/60' },
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position the portal panel under the input
  const updatePanelPosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 380), window.innerWidth - 20);
    setPanelStyle({
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      left: `${Math.max(10, Math.min(rect.left, window.innerWidth - width - 10))}px`,
      width: `${width}px`,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        const panel = document.getElementById('global-search-panel');
        if (panel && panel.contains(target)) return;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut listener: '/' or 'Ctrl+K' / 'Cmd+K' to focus, 'Escape' to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = document.activeElement;
      const isInputActive =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target as HTMLElement)?.isContentEditable;

      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) && !isInputActive) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);

    const { data: membersData } = await supabase
      .from('leadership_members')
      .select('*, sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)), department:departments(*)')
      .eq('is_active', true);

    const allMembers = (membersData as LeadershipMember[]) ?? [];
    const members = allMembers
      .filter((m) =>
        arabicSearchMatches(
          [
            m.full_name,
            m.file_number,
            m.rank,
            m.job_title,
            m.sector?.name_ar,
            m.sector?.assistant_undersecretary?.name_ar,
            m.department?.name_ar,
          ],
          q
        )
      )
      .sort(compareLeaders)
      .slice(0, 8);

    if (members.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const memberIds = members.map((m) => m.id);
    const { data: leavesData } = await supabase
      .from('leadership_leaves')
      .select('*, leave_type:leave_types(*)')
      .eq('approval_status', 'approved')
      .in('leadership_member_id', memberIds)
      .order('start_date', { ascending: false });

    const leaves = (leavesData as LeadershipLeave[]) ?? [];

    const searchResults: SearchResult[] = members.map((member) => ({
      member,
      leaves: leaves.filter((l) => l.leadership_member_id === member.id).slice(0, 3),
    }));

    setResults(searchResults);
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const goToMember = (id: string) => {
    navigate(`/leaders/${id}`);
    setOpen(false);
    setQuery('');
  };

  const panel = open ? (
    <div
      id="global-search-panel"
      style={panelStyle}
      className="bg-white rounded-2xl shadow-xl shadow-slate-900/15 border border-slate-200 overflow-hidden"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-8 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
          <span className="text-xs font-medium">جاري البحث…</span>
        </div>
      ) : results.length === 0 ? (
        <div className="py-8 text-center px-4">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
            <Search className="w-5 h-5" />
          </div>
          <p className="text-xs font-medium text-slate-700">لا توجد نتائج مطابقة</p>
          <p className="text-[11px] text-slate-400 mt-0.5">لم نجد أي موظف يطابق «{query}»</p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
          <div className="px-4 py-2.5 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              النتائج ({results.length})
            </span>
            <span className="text-[11px] text-slate-400">
              اضغط للانتقال للسجل
            </span>
          </div>
          {results.map(({ member, leaves }) => (
            <div key={member.id} className="hover:bg-slate-50/60 transition-colors">
              {/* Member header row */}
              <button
                type="button"
                className="w-full text-right flex items-center gap-3 px-4 py-3 cursor-pointer group transition-colors"
                onClick={() => goToMember(member.id)}
              >
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <RankInsignia rank={member.rank} size="sm" />
                  {member.file_number && (
                    <span className="text-[10px] font-mono leading-none text-slate-500 sm:hidden">
                      {member.file_number}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-primary-700 transition-colors">
                    <PersonName rank={member.rank} name={member.full_name} size="sm" />
                  </p>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    <span>{member.job_title}</span>
                    {member.sector?.name_ar && (
                      <>
                        <span className="mx-1 text-slate-300">·</span>
                        <ExpandableOrgPath sector={member.sector} department={member.department} />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline-flex text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{member.file_number}</span>
                  {/* ChevronLeft = correct RTL direction for "go to" arrow */}
                  <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-primary-600 group-hover:-translate-x-0.5 transition-all" />
                </div>
              </button>

              {/* Leaves preview */}
              {leaves.length > 0 ? (
                <div className="px-4 pb-2.5 space-y-1.5">
                  {leaves.map((leave) => {
                    const currentStatus = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
                    const st = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.completed;
                    return (
                      <div
                        key={leave.id}
                        className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-600 flex-1 truncate">
                          {leave.leave_type?.name_ar ?? 'إجازة'}
                          &nbsp;·&nbsp;
                          {formatDate(leave.start_date)}
                          &nbsp;←&nbsp;
                          {formatDate(leave.end_date)}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 pb-2">
                  <p className="text-xs text-slate-400 italic">لا توجد إجازات مسجلة</p>
                </div>
              )}

              {/* Link to full profile */}
              <div className="px-4 pb-3 pt-0.5">
                <button
                  onClick={() => goToMember(member.id)}
                  className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  عرض السجل الكامل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div ref={wrapperRef} className="relative w-full group">
        <div className="relative flex items-center">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-700 group-focus-within:scale-110 pointer-events-none transition-all duration-200" />
          <input
            ref={inputRef}
            id="global-search-input"
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => { if (query) { setOpen(true); updatePanelPosition(); } }}
            placeholder="ابحث باسم الموظف أو رقم ملفه..."
            aria-label="البحث عن موظف"
            dir="rtl"
            className="w-full h-10 pr-10 pl-11 text-sm placeholder:text-sm bg-slate-100/70 hover:bg-slate-100/90 hover:border-slate-300/80 border border-slate-200/80 rounded-xl text-slate-800 placeholder-slate-400
                       focus:outline-none focus:bg-white focus:border-primary-600 focus:ring-4 focus:ring-primary-600/10 focus:shadow-xs transition-all duration-200 ease-out"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="مسح البحث"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd
                title="اضغط / للتركيز على البحث"
                className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white/90 border border-slate-200/90 rounded shadow-2xs pointer-events-none transition-opacity duration-150 group-focus-within:opacity-0"
              >
                /
              </kbd>
            )}
          </div>
        </div>
      </div>
      {createPortal(panel, document.body)}
    </>
  );
}
