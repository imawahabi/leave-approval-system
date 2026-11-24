import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, Users, Plane, ClipboardCheck } from 'lucide-react';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useBottomNavAnchor } from '@/hooks/useBottomNavAnchor';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkspaceAccess } from '@/utils/access';
import { usePendingReviews } from '@/hooks/usePendingReviews';

export function MobileNav() {
  const isVisible = useScrollDirection();
  const navRef = useBottomNavAnchor();
  const { canApprove, isAdmin, hasPermission } = useAuth();
  const pendingCount = usePendingReviews();
  const workspaceAccess = getWorkspaceAccess(isAdmin, hasPermission);
  const mobileTabs = [
    ...(workspaceAccess.workspace ? [{ path: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard }] : []),
    ...(workspaceAccess.leaders ? [{ path: '/leaders', label: 'الموظفون', icon: Users }] : []),
    ...(workspaceAccess.leaves ? [{ path: '/leaves', label: 'الإجازات', icon: Plane }] : []),
    ...(canApprove ? [{ path: '/review', label: 'المراجعة', icon: ClipboardCheck }] : []),
    ...(workspaceAccess.today ? [{ path: '/today', label: 'اليوم', icon: CalendarCheck }] : []),
  ];

  return (
    <nav
      ref={navRef}
      dir="rtl"
      aria-label="التنقل الرئيسي"
      className={`mobile-nav lg:hidden transition-transform duration-300 ease-in-out will-change-transform ${
        isVisible ? 'shadow-lg' : 'mobile-nav--hidden pointer-events-none'
      }`}
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-around px-1">
        {mobileTabs.map(({ path, label, icon: Icon }) => {
          const hasPending = path === '/review' && pendingCount !== null && pendingCount > 0;
          return (
            <NavLink
              key={path}
              to={path}
              aria-label={hasPending ? `المراجعة، ${pendingCount} طلب بانتظار الإجراء` : label}
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'mobile-nav-item-active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon
                      className={`h-5 w-5 transition-colors ${
                        hasPending && !isActive
                          ? '!text-amber-500 stroke-[2.2] drop-shadow-[0_0_5px_rgba(245,158,11,0.4)]'
                          : ''
                      }`}
                      aria-hidden="true"
                      strokeWidth={1.8}
                    />
                    {hasPending && (
                      <b
                        className="absolute -top-2 -left-3 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center font-bold tabular-nums shadow-xs animate-pulse"
                        aria-hidden="true"
                      >
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </b>
                    )}
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
