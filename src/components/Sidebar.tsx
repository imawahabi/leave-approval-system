import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, Users, Plane, Calendar, BarChart3, UserCog, Building2, Tag, History, ClipboardCheck, LogOut } from 'lucide-react';
import { navItems, adminNavItems, accountTypeConfig } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkspaceAccess } from '@/utils/access';
import { usePendingReviews } from '@/hooks/usePendingReviews';

const iconMap: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard, CalendarCheck, Users, Plane, Calendar, BarChart3,
  UserCog, Building2, Tag, History, ClipboardCheck,
};

export function Sidebar({ onNavigate, onLogout }: { onNavigate?: () => void; onLogout?: () => void }) {
  const { isAdmin, hasPermission, canApprove, accountType, profile } = useAuth();
  const displayAccountType = accountType ?? (profile?.role === 'admin' ? 'admin' : profile?.role === 'approver' ? 'approver' : 'user');
  const workspaceAccess = getWorkspaceAccess(isAdmin, hasPermission);

  const pendingCount = usePendingReviews();

  return (
    <div className="h-full flex flex-col bg-[#142744] text-slate-300">
      {/* Brand Header with Refined Logo Container and Spacing */}
      <div className="px-5 py-5 border-b border-slate-800/90">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-sm">
            <img
              src="/entity-logo.png"
              alt="شعار الجهة"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-white tracking-tight leading-snug">
              LeaveFlow
            </h1>
            <p className="text-[11px] font-medium text-slate-400 truncate mt-0.5 leading-normal">
              نظام إدارة واعتماد الإجازات - الجهة الحكومية
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="القائمة الرئيسية" className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-5 space-y-1">
        {navItems.filter((item) => {
          if (item.path === '/dashboard') return accountType !== 'approver' && workspaceAccess.workspace;
          if (item.path === '/leaders') return workspaceAccess.leaders;
          if (item.path === '/leaves') return workspaceAccess.leaves;
          if (item.path === '/review') return canApprove;
          if (item.path === '/today') return workspaceAccess.today;
          if (item.path === '/calendar') return workspaceAccess.calendar;
          if (item.path === '/reports') return workspaceAccess.reports;
          return false;
        }).map((item) => {
          const Icon = iconMap[item.icon] ?? LayoutDashboard;
          const hasPending = item.path === '/review' && pendingCount !== null && pendingCount > 0;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                  ? 'bg-white/10 text-white font-semibold shadow-xs border border-white/15'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-all ${
                      isActive
                        ? 'text-[#f7bd39]'
                        : hasPending
                          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                          : 'text-slate-400'
                    }`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {hasPending && (
                    <span
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-2 py-0.5 rounded-full tabular-nums shadow-xs animate-pulse"
                      title={`${pendingCount} طلب بانتظار المراجعة`}
                    >
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}


        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">الإدارة</span>
            </div>
            <div className="space-y-1">
              {adminNavItems.map((item) => {
                  const Icon = iconMap[item.icon] ?? LayoutDashboard;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                          ? 'bg-white/10 text-white font-semibold shadow-xs border border-white/15'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#f7bd39]' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
            </div>
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            title="إعدادات الحساب"
            aria-label="إعدادات الحساب"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${
                isActive
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-slate-200 hover:text-white hover:bg-white/5 active:bg-white/10'
              }`
            }
          >
            <span className="w-9 h-9 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden">
              <img src="/entity-logo.png" alt="شعار النظام" className="w-full h-full object-contain" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile?.full_name ?? 'المستخدم'}</p>
              <p className="text-xs text-slate-400 truncate">{profile ? accountTypeConfig[displayAccountType]?.label ?? 'مستخدم' : ''}</p>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              onLogout?.();
            }}
            className="shrink-0 rounded-xl p-2.5 text-slate-400 hover:text-red-300 hover:bg-red-500/15 active:bg-red-500/25 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
