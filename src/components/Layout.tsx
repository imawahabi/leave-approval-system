import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { BarChart3, Building2, CalendarCheck, CalendarDays, ClipboardCheck, History, LayoutDashboard, Menu, Plane, Settings, ShieldCheck, Tag, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { GlobalSearch } from './GlobalSearch';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationPopover } from './NotificationPopover';
import { formatDate, todayInKuwait } from '@/utils/date';

type HeaderDetails = { title: string; subtitle: string; icon: LucideIcon };

const pageHeadings: Record<string, HeaderDetails> = {
  '/leaders': { title: 'الموظفون', subtitle: 'دليل الموظفين والإجازات', icon: Users },
  '/leaves': { title: 'الإجازات', subtitle: 'سجل إجازات الموظفين الحالية والسابقة', icon: Plane },
  '/calendar': { title: 'التقويم', subtitle: 'متابعة إجازات الموظفين', icon: CalendarDays },
  '/reports': { title: 'التقارير', subtitle: 'تقارير إجازات الموظفين', icon: BarChart3 },
  '/settings': { title: 'إعدادات الحساب', subtitle: 'الملف الشخصي ورمز الدخول وصلاحيات الأمان', icon: Settings },
  '/admin/users': { title: 'المستخدمون والصلاحيات', subtitle: 'إدارة حسابات النظام وتعيين الصلاحيات', icon: UserCog },
  '/admin/sectors': { title: 'الهيكل التنظيمي', subtitle: 'رئيس الجهة والمدير العام ومساعدوه والقطاعات والإدارات', icon: Building2 },
  '/admin/leave-types': { title: 'أنواع الإجازات', subtitle: 'إدارة أنواع الإجازات', icon: Tag },
  '/admin/audit': { title: 'سجل العمليات', subtitle: 'متابعة العمليات المسجلة في النظام', icon: History },
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut, isAdmin, hasPermission } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const location = useLocation();
  const todayLabel = formatDate(todayInKuwait());
  const requestedReviewStage = new URLSearchParams(location.search).get('stage');
  const canReviewUndersecretary = isAdmin || hasPermission('approve_undersecretary');
  const canReviewMinister = isAdmin || hasPermission('approve_minister');
  const reviewMinister = requestedReviewStage === 'minister' && canReviewMinister
    || requestedReviewStage !== 'undersecretary' && !canReviewUndersecretary;
  const heading: HeaderDetails = location.pathname === '/dashboard'
    ? { title: 'ملخص الإجازات', subtitle: todayLabel, icon: LayoutDashboard }
    : location.pathname === '/today'
      ? { title: 'حالة الموظفين اليوم', subtitle: todayLabel, icon: CalendarCheck }
      : location.pathname === '/review'
        ? reviewMinister
          ? { title: 'مكتب رئيس الجهة', subtitle: 'عرض الطلبات وتسجيل «تم العرض»', icon: ShieldCheck }
          : { title: 'مكتب المدير العام', subtitle: 'تدقيق الطلبات وإحالتها لرئيس الجهة', icon: ClipboardCheck }
        : location.pathname.startsWith('/leaders/')
          ? { title: 'ملف الموظف', subtitle: 'بيانات الموظف وإجازاته', icon: Users }
          : pageHeadings[location.pathname] ?? { title: 'إجازات الموظفين', subtitle: 'متابعة الموظفين وإجازاتهم', icon: CalendarCheck };
  const HeadingIcon = heading.icon;

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onEscape); };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen lg:h-dvh lg:min-h-0 lg:overflow-hidden bg-[#f4f6f8] flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-teal-800">تخطي إلى محتوى الصفحة</a>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 xl:w-72 shrink-0 sticky top-0 right-0 h-screen self-start bg-[#142744]">
        <Sidebar onLogout={() => setShowLogoutConfirm(true)} />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/55" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85%] animate-slide-up" role="dialog" aria-modal="true" aria-label="القائمة الجانبية">
            <div className="h-full flex flex-col bg-[#142744] text-slate-300">
              <Sidebar
                onNavigate={() => setMobileOpen(false)}
                onLogout={() => setShowLogoutConfirm(true)}
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 left-3 p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                aria-label="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="app-content-scroll flex-1 min-w-0 flex flex-col lg:h-dvh lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
        {/* Top bar */}
        <header className="fixed inset-x-0 top-0 z-30 h-16 min-h-16 shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-6 lg:sticky lg:h-[76px] lg:min-h-[76px] lg:px-8">

          {/* Page identity on desktop; compact navigation on phones. */}
          <div className="flex items-center gap-2 shrink-0 lg:min-w-0 lg:w-[275px] xl:w-[350px]">
            <button
              className="lg:hidden p-2 -mr-1 rounded-lg hover:bg-slate-100 text-slate-700 active:bg-slate-200 transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 lg:hidden overflow-hidden">
                <img src="/entity-logo.png" alt="شعار الجهة" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-3 min-w-0 w-full">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center" aria-hidden="true"><HeadingIcon className="w-5 h-5" /></span>
              <div className="min-w-0 border-r-2 border-accent-500 pr-3">
                <h1 className="text-[15px] xl:text-base font-extrabold text-slate-900 leading-tight truncate" title={heading.title}>{heading.title}</h1>
                <p className="text-xs xl:text-[13px] text-slate-600 mt-0.5 leading-4 truncate" title={heading.subtitle}>{heading.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Center: Global search - stationary on desktop with subtle scale; expands gracefully on mobile */}
          <div
            className="flex-1 flex justify-center px-1 sm:px-4 min-w-0"
            onFocus={() => setSearchFocused(true)}
            onBlur={(e) => {
              // Delay to allow portal panel clicks to register
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setTimeout(() => setSearchFocused(false), 200);
              }
            }}
          >
            <div
              className={`w-full transition-all duration-300 ease-out ${
                searchFocused
                  ? 'max-w-full sm:max-w-md lg:max-w-lg'
                  : 'max-w-xs sm:max-w-sm lg:max-w-md'
              }`}
            >
              <GlobalSearch />
            </div>
          </div>

          {/* Right: notifications (always visible) + settings (gracefully collapses on mobile focus) + logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <NotificationPopover />

            {/* Profile / settings link: collapses smoothly on mobile when typing in search to provide space */}
            <div
              className={`transition-all duration-300 overflow-hidden ${
                searchFocused
                  ? 'max-w-0 opacity-0 pointer-events-none sm:max-w-[200px] sm:opacity-100 sm:pointer-events-auto'
                  : 'max-w-[200px] opacity-100'
              }`}
            >
              <Link
                to="/settings"
                title="ملفي الشخصي"
                aria-label="ملفي الشخصي"
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                <span className="w-8 h-8 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden">
                  <img src="/entity-logo.png" alt="شعار النظام" className="w-full h-full object-contain" />
                </span>
                <span className="text-sm font-medium text-slate-700 hidden sm:block truncate max-w-[120px]">
                  {profile?.full_name ?? 'المستخدم'}
                </span>
              </Link>
            </div>

          </div>
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 pt-20 lg:pt-6 max-w-[1440px] mx-auto w-full pb-28 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Logout confirmation modal */}
      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={signOut}
        title="تأكيد تسجيل الخروج"
        message="هل أنت متأكد من رغبتك في تسجيل الخروج من نظام إدارة واعتماد الإجازات؟"
        confirmLabel="تسجيل الخروج"
        cancelLabel="إلغاء"
        danger
      />

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
