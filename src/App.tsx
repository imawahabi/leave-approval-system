import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { getWorkspaceAccess } from '@/utils/access';

const ReviewPage = lazy(() => import('@/pages/ReviewPage').then(module => ({ default: module.ReviewPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(module => ({ default: module.DashboardPage })));
const TodayPage = lazy(() => import('@/pages/TodayPage').then(module => ({ default: module.TodayPage })));
const LeadersPage = lazy(() => import('@/pages/LeadersPage').then(module => ({ default: module.LeadersPage })));
const LeaderDetailPage = lazy(() => import('@/pages/LeaderDetailPage').then(module => ({ default: module.LeaderDetailPage })));
const LeavesPage = lazy(() => import('@/pages/LeavesPage').then(module => ({ default: module.LeavesPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then(module => ({ default: module.CalendarPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then(module => ({ default: module.ReportsPage })));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then(module => ({ default: module.AdminUsersPage })));
const AdminSectorsPage = lazy(() => import('@/pages/admin/AdminSectorsPage').then(module => ({ default: module.AdminSectorsPage })));
const AdminLeaveTypesPage = lazy(() => import('@/pages/admin/AdminLeaveTypesPage').then(module => ({ default: module.AdminLeaveTypesPage })));
const AdminAuditPage = lazy(() => import('@/pages/admin/AdminAuditPage').then(module => ({ default: module.AdminAuditPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

function PageLoading() {
  return <div role="status" className="card p-6 text-sm text-slate-500" aria-live="polite">جارٍ تحميل الصفحة...</div>;
}

type Access = 'general' | 'admin' | 'workspace' | 'today' | 'leaders' | 'leaves' | 'calendar' | 'reports' | 'review';

function AccessRoute({ access, children }: { access: Access; children: React.ReactNode }) {
  const { session, profile, accountType, isAdmin, canApprove, hasPermission, loading } = useAuth();
  if (loading) return <AppLoadingScreen />;
  if (!session || !profile?.is_active) return <Navigate to="/login" replace />;
  if (accountType === 'approver' && access !== 'review') return <Navigate to="/review" replace />;
  if (access === 'admin' && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (access === 'review' && !canApprove) return <Navigate to="/dashboard" replace />;
  const workspaceAccess = getWorkspaceAccess(isAdmin, hasPermission);
  const allowedByPermission = access in workspaceAccess
    ? workspaceAccess[access as keyof typeof workspaceAccess]
    : true;
  const canSeeWorkspace = workspaceAccess.workspace;
  if (!allowedByPermission) return <Navigate to={canApprove ? '/review' : canSeeWorkspace ? '/dashboard' : '/settings'} replace />;
  if (access === 'review' && accountType === 'approver') {
    return <Suspense fallback={<AppLoadingScreen />}>{children}</Suspense>;
  }
  return <Layout><Suspense fallback={<PageLoading />}>{children}</Suspense></Layout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, accountType, loading } = useAuth();
  if (loading) return <AppLoadingScreen />;
  if (session && profile?.is_active) return <Navigate to={accountType === 'approver' ? '/review' : '/dashboard'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/invite/:token" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/review" element={<AccessRoute access="review"><ReviewPage /></AccessRoute>} />
          <Route path="/dashboard" element={<AccessRoute access="workspace"><DashboardPage /></AccessRoute>} />
          <Route path="/today" element={<AccessRoute access="today"><TodayPage /></AccessRoute>} />
          <Route path="/leaders" element={<AccessRoute access="leaders"><LeadersPage /></AccessRoute>} />
          <Route path="/leaders/:id" element={<AccessRoute access="leaders"><LeaderDetailPage /></AccessRoute>} />
          <Route path="/leaves" element={<AccessRoute access="leaves"><LeavesPage /></AccessRoute>} />
          <Route path="/calendar" element={<AccessRoute access="calendar"><CalendarPage /></AccessRoute>} />
          <Route path="/reports" element={<AccessRoute access="reports"><ReportsPage /></AccessRoute>} />
          <Route path="/settings" element={<AccessRoute access="general"><SettingsPage /></AccessRoute>} />
          <Route path="/notifications" element={<Navigate to="/dashboard" replace />} />
          <Route path="/admin/users" element={<AccessRoute access="admin"><AdminUsersPage /></AccessRoute>} />
          <Route path="/admin/permissions" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/sectors" element={<AccessRoute access="admin"><AdminSectorsPage /></AccessRoute>} />
          <Route path="/admin/leave-types" element={<AccessRoute access="admin"><AdminLeaveTypesPage /></AccessRoute>} />
          <Route path="/admin/audit" element={<AccessRoute access="admin"><AdminAuditPage /></AccessRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
