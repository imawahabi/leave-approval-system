import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, CalendarPlus, CheckCheck, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { addDays, formatDate, todayInKuwait } from '@/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import { ResponsivePersonName } from '@/components/PersonName';

interface Notice { id: string; title: string; memberName: string; memberRank: string | null; link: string; kind: 'start' | 'end' }
interface WorkflowNotice {
  id: string;
  event_code: 'submitted' | 'forwarded' | 'returned_to_review' | 'displayed' | 'archived' | 'resubmitted' | 'cancelled';
  created_at: string;
  read_at: string | null;
  leave: { leadership_member: { full_name: string; rank: string } | null; leave_type: { name_ar: string } | null } | null;
}
const eventLabels: Record<WorkflowNotice['event_code'], string> = {
  submitted: 'تم تقديم طلب الإجازة',
  forwarded: 'أُحيل الطلب إلى مكتب رئيس الجهة',
  returned_to_review: 'عاد الطلب إلى المراجعة',
  displayed: 'تم عرض الإجازة',
  archived: 'أُرشف طلب الإجازة',
  resubmitted: 'أُعيد تقديم طلب الإجازة',
  cancelled: 'أُلغيت الإجازة',
};

export function NotificationPopover() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [workflowItems, setWorkflowItems] = useState<WorkflowNotice[]>([]);
  const [actionError, setActionError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const unreadCount = workflowItems.filter(item => !item.read_at).length;

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); setWorkflowItems([]); return; }
    setLoading(true); setError(false);
    const today = todayInKuwait();
    const tomorrow = addDays(today, 1);
    const { data, error: queryError } = await supabase.from('leadership_leaves')
      .select('id,start_date,end_date,leadership_member_id,leadership_member:leadership_member_id(full_name,rank)')
      .eq('approval_status', 'approved').neq('status', 'cancelled')
      .gte('end_date', today)
      .or(`start_date.eq.${today},start_date.eq.${tomorrow},end_date.eq.${today},end_date.eq.${tomorrow}`)
      .order('start_date', { ascending: false }).limit(100);
    if (queryError) setError(true);
    else {
      const notices: Notice[] = [];
      for (const leave of data ?? []) {
        const member = leave.leadership_member as unknown as { full_name: string; rank: string } | null;
        if (leave.start_date === today || leave.start_date === tomorrow) notices.push({
          id: `start-${leave.id}`, kind: 'start', title: leave.start_date === today ? 'إجازة تبدأ اليوم' : 'إجازة تبدأ غدًا',
          memberName: member?.full_name ?? 'موظف', memberRank: member?.rank ?? null, link: `/leaders/${leave.leadership_member_id}`,
        });
        if (leave.end_date === today || leave.end_date === tomorrow) notices.push({
          id: `end-${leave.id}`, kind: 'end', title: leave.end_date === today ? 'إجازة تنتهي اليوم' : 'إجازة تنتهي غدًا',
          memberName: member?.full_name ?? 'موظف', memberRank: member?.rank ?? null, link: `/leaders/${leave.leadership_member_id}`,
        });
      }
      notices.sort((a, b) => (a.title.includes('اليوم') ? 0 : 1) - (b.title.includes('اليوم') ? 0 : 1));
      setItems(notices);
    }
    const workflow = await supabase.from('leave_notifications')
      .select('id,event_code,created_at,read_at,leave:leave_id(leadership_member:leadership_member_id(full_name,rank),leave_type:leave_type_id(name_ar))')
      .eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(40);
    if (workflow.error) setError(true);
    else setWorkflowItems((workflow.data ?? []) as unknown as WorkflowNotice[]);
    setLoading(false);
  }, [user]);

  const setRead = async (id: string, read: boolean) => {
    if (!user) return;
    setActionError(false);
    const { error: updateError } = await supabase.from('leave_notifications')
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq('id', id).eq('recipient_id', user.id);
    if (updateError) setActionError(true);
    else setWorkflowItems(current => current.map(item => item.id === id ? { ...item, read_at: read ? new Date().toISOString() : null } : item));
  };
  const markAllRead = async () => {
    if (!user || !unreadCount) return;
    setActionError(false);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('leave_notifications')
      .update({ read_at: now }).eq('recipient_id', user.id).is('read_at', null);
    if (updateError) setActionError(true);
    else setWorkflowItems(current => current.map(item => ({ ...item, read_at: item.read_at ?? now })));
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);

  return <div className="relative" ref={container}>
    <button type="button" onClick={() => setOpen(!open)} aria-label={`الإشعارات، ${unreadCount} غير مقروءة`} aria-expanded={open} aria-haspopup="dialog" className={`group relative flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/20 focus-visible:ring-offset-2 ${open ? 'border-primary-600 bg-white text-primary-800 shadow-xs' : 'border-slate-200/80 bg-slate-100/70 text-slate-600 hover:border-slate-300/80 hover:bg-slate-100/90 hover:text-primary-700'}`}>
      <Bell className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-hover:text-primary-700" aria-hidden="true" />
      {unreadCount > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm transition-transform duration-200 group-hover:scale-110" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <div role="dialog" aria-label="الإشعارات" dir="rtl" className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[min(75dvh,36rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 animate-fade-in sm:left-4 sm:right-auto sm:w-[26rem] lg:absolute lg:top-12 lg:left-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-l from-primary-50/70 to-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-800 shadow-sm ring-1 ring-primary-100"><Bell className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900">الإشعارات</h2>{unreadCount > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-100">{unreadCount} جديدة</span>}</div><p className="mt-0.5 text-xs leading-5 text-slate-500">تحديثات طلبات إجازات الموظفين والمواعيد القريبة</p></div>
        </div>
        <button type="button" onClick={() => void refresh()} className="group shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-xs transition-all duration-200 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="تحديث الإشعارات"><RefreshCw className={`h-4 w-4 transition-transform ${loading ? 'animate-spin' : 'group-hover:rotate-90'}`} /></button>
      </div>
      <div className="max-h-[calc(min(75dvh,36rem)-4rem)] overflow-y-auto overscroll-contain">
        {error && <p role="alert" className="p-3 text-xs text-red-700">تعذر تحميل بعض الإشعارات. حاول التحديث.</p>}
        {actionError && <p role="alert" className="p-3 text-xs text-red-700">تعذر حفظ حالة القراءة. حاول مرة أخرى.</p>}
        {loading && !items.length && !workflowItems.length && <p className="p-4 text-sm text-slate-500">جارٍ التحميل...</p>}
        {workflowItems.length > 0 && <section aria-label="تحديثات الطلبات">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"><h3 className="text-xs font-bold text-slate-700">تحديثات الطلبات</h3>{unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"><CheckCheck className="h-3.5 w-3.5" /> تحديد الكل كمقروء</button>}</div>
          {workflowItems.map(item => {
            const member = item.leave?.leadership_member;
            return <div key={item.id} className={`border-b border-slate-100 p-3.5 transition-colors duration-200 hover:bg-slate-50/80 ${item.read_at ? 'bg-white' : 'bg-primary-50/55'}`}>
              <div className="flex items-start justify-between gap-2">
                <Link to="/leaves?tracking=1" onClick={() => { setOpen(false); if (!item.read_at) void setRead(item.id, true); }} className="group/link flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${item.read_at ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-white text-primary-800 ring-primary-100'}`}><Bell className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover/link:-rotate-12" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900 transition-colors group-hover/link:text-primary-800">{eventLabels[item.event_code]}</strong><span className="block text-xs leading-5 text-slate-600">{member?.rank ? `${member.rank} / ` : ''}<ResponsivePersonName name={member?.full_name ?? 'موظف'} /> · {item.leave?.leave_type?.name_ar ?? 'إجازة'}</span><span className="mt-0.5 block text-[11px] text-slate-500">{formatDate(item.created_at)}</span></span>
                </Link>
                {!item.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-600 ring-4 ring-primary-100" aria-label="غير مقروء" />}
              </div>
              <button type="button" onClick={() => void setRead(item.id, !item.read_at)} className="mr-12 mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-800 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">{item.read_at ? 'إرجاع كغير مقروء' : 'تحديد كمقروء'}</button>
            </div>;
          })}
        </section>}
        {items.length > 0 && <section aria-label="مواعيد الإجازات القريبة"><h3 className="border-y border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-bold text-slate-700">مواعيد قريبة</h3>{items.slice(0, 8).map(item => <Link key={item.id} to={item.link} onClick={() => setOpen(false)} className="group/date flex items-start gap-3 border-b border-slate-100 p-3.5 transition-colors duration-200 hover:bg-slate-50"><span className="shrink-0 rounded-xl bg-teal-50 p-2.5 text-teal-800 ring-1 ring-teal-100 transition-transform duration-200 motion-safe:group-hover/date:scale-105">{item.kind === 'start' ? <CalendarPlus className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}</span><span><strong className="block text-sm text-slate-900 transition-colors group-hover/date:text-primary-800">{item.title}</strong><span className="text-xs text-slate-500">{item.memberRank ? `${item.memberRank} / ` : ''}<ResponsivePersonName name={item.memberName} /></span></span></Link>)}</section>}
        {!loading && !items.length && !workflowItems.length && !error && <p className="p-5 text-center text-sm text-slate-500">لا توجد إشعارات حاليًا</p>}
      </div>
    </div>}
  </div>;
}
