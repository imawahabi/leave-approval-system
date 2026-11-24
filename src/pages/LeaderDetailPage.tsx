import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Plus, Plane, Clock, Calendar, Pencil, Ban, Building, ShieldCheck } from 'lucide-react';
import { useLeadershipMember, useMemberLeaves } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LeaveFormModal } from '@/components/LeaveFormModal';
import { MemberFormModal } from '@/components/MemberFormModal';
import { statusConfig, memberStatusConfig } from '@/constants';
import { formatDate, formatDayCount, getLeaveStatus, getRemainingLabel, getRelativeDaysLabel, isCurrentlyOnLeave, daysUntil } from '@/utils/date';
import { useState } from 'react';
import { RankInsignia } from '@/components/RankInsignia';
import { isAssistantOfficeSector } from '@/utils/organization';
import { useSectors, useAssistantUndersecretaries } from '@/hooks/useData';
import { permissionCoversMember } from '@/utils/permissions';
import { ResponsivePersonName } from '@/components/PersonName';
import type { LeadershipLeave } from '@/types';

export function LeaderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, permissions, user } = useAuth();
  const { sectors } = useSectors();
  const { undersecretaries } = useAssistantUndersecretaries();
  const { member, loading, error, refetch: refetchMember } = useLeadershipMember(id);
  const { leaves, error: leavesError, refetch } = useMemberLeaves(id);
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeadershipLeave | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeadershipLeave | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [editMemberOpen, setEditMemberOpen] = useState(false);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-32 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !member) {
    return <ErrorState message={error ?? 'الموظف غير موجود'} onRetry={() => navigate('/leaders')} />;
  }

  const currentLeave = leaves.find((l) => isCurrentlyOnLeave(l.start_date, l.end_date, l.status) && (l.approval_status ?? 'approved') === 'approved');
  const upcomingLeave = leaves.find((l) => daysUntil(l.start_date) > 0 && l.status !== 'cancelled' && (l.approval_status ?? 'approved') === 'approved');
  const pendingLeaves = leaves.filter((l) => l.approval_status === 'pending' && l.status !== 'cancelled');
  const approvedLeaves = leaves.filter((l) => (l.approval_status ?? 'approved') === 'approved');

  const memberStatus = currentLeave ? 'on_leave' : 'at_work';
  const sc = memberStatusConfig[memberStatus];
  const canCreateLeave = permissionCoversMember(permissions, 'create_leave', member, sectors, undersecretaries, isAdmin);
  const canEditLeader = permissionCoversMember(permissions, 'edit_leader', member, sectors, undersecretaries, isAdmin);
  const canReviewUndersecretary = permissionCoversMember(permissions, 'approve_undersecretary', member, sectors, undersecretaries, isAdmin);
  const canReviewMinister = permissionCoversMember(permissions, 'approve_minister', member, sectors, undersecretaries, isAdmin);
  const reviewablePendingLeaves = pendingLeaves.filter((leave) => {
    const isMinisterStage = leave.workflow_status === 'pending_stage_2' || leave.current_approval_stage === 2;
    return isMinisterStage ? canReviewMinister : canReviewUndersecretary;
  });

  const handleCancelLeave = async () => {
    if (!cancelTarget || !user) return;
    setCancelBusy(true);
    setCancelError(null);
    const { data, error } = await supabase.from('leadership_leaves')
      .update({ status: 'cancelled', updated_by: user.id })
      .eq('id', cancelTarget.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      setCancelError('لم يتم إلغاء الإجازة. قد لا تملك صلاحية الإلغاء لهذا السجل أو ربما تغيرت حالته؛ حدّث الصفحة أو تواصل مع مدير النظام.');
      setCancelBusy(false);
      return;
    }
    setCancelTarget(null);
    refetch();
    setCancelBusy(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <Link to="/leaders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowRight className="w-4 h-4" /> العودة للقائمة
      </Link>

      {/* Header card */}
      <div className="card-elevated p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="shrink-0 pt-0.5">
              <RankInsignia rank={member.rank} size="lg" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-bold text-slate-900">{member.rank}</span>
                <span className="text-slate-400 font-bold">/</span>
                <span className="text-base sm:text-lg font-bold text-slate-900"><ResponsivePersonName name={member.full_name} /></span>
              </div>
              <p className="mt-1 text-xs text-slate-500">الاسم الكامل: {member.full_name}</p>
              <p className="text-sm text-slate-500 mt-0.5">{member.job_title}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                {!member.is_active && <Badge label="مؤرشف" color="text-slate-500" bg="bg-slate-50 border-slate-200" dot="bg-slate-400" />}
              </div>
            </div>
          </div>
          {(canEditLeader || canCreateLeave) && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {canEditLeader && <button className="btn-secondary flex-1 sm:flex-none sm:w-48" onClick={() => setEditMemberOpen(true)}>
                <Pencil className="w-4 h-4" /> تعديل
              </button>}
              {canCreateLeave && <button className="btn-primary flex-1 sm:flex-none sm:w-48" onClick={() => { setEditingLeave(null); setLeaveFormOpen(true); }}>
                <Plus className="w-4 h-4" /> تسجيل إجازة
              </button>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">رقم الملف / المدني</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">{member.file_number}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">المستوى التنظيمي</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5 break-words leading-relaxed">{member.sector?.assistant_undersecretary?.name_ar ?? 'غير محدد'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">القطاع</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5 break-words leading-relaxed">{isAssistantOfficeSector(member.sector) ? '-' : member.sector?.name_ar ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">الإدارة</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5 break-words leading-relaxed">{member.department?.name_ar ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">ملاحظات</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5 break-words leading-relaxed">{member.notes ?? '-'}</p>
          </div>
        </div>
      </div>

      {leavesError && (
        <div role="alert" className="card border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>تعذر تحميل إجازات الموظف، لذلك قد لا تظهر طلبات الإجازة قيد المراجعة هنا.</span>
          <button type="button" onClick={refetch} className="btn-secondary shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {/* One approval queue, filtered to the viewer's permitted stage and organization scope */}
      {reviewablePendingLeaves.length > 0 && (
        <div className="card-elevated border border-amber-200/70 bg-amber-50/25 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <h2 className="section-title text-amber-900">طلبات الإجازة قيد المراجعة ({reviewablePendingLeaves.length})</h2>
                <p className="text-xs text-amber-700">طلبات مكتب المدير العام ومكتب رئيس الجهة التي تملك صلاحية مراجعتها</p>
              </div>
            </div>
            <Link
              to="/review"
              className="btn-secondary text-xs py-1.5 px-3 bg-white hover:bg-amber-50 border-amber-200 text-amber-900 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>صفحة المراجعة</span>
            </Link>
          </div>
          <div className="space-y-2.5">
            {reviewablePendingLeaves.map((pl) => {
              const isMinisterStage = pl.workflow_status === 'pending_stage_2' || pl.current_approval_stage === 2;
              const targetStage = isMinisterStage ? 'minister' : 'undersecretary';
              const stageName = isMinisterStage ? 'مكتب رئيس الجهة' : 'مكتب المدير العام';
              const Icon = isMinisterStage ? ShieldCheck : Building;

              return (
                <div key={pl.id} className="p-4 bg-white rounded-2xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900">{pl.leave_type?.name_ar ?? 'إجازة'}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary-50 text-primary-800">
                        <Icon className="w-3.5 h-3.5" />
                        {stageName}
                      </span>
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">{isMinisterStage ? 'بانتظار العرض' : 'بانتظار التدقيق والإحالة'}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      من {formatDate(pl.start_date)} إلى {formatDate(pl.end_date)} · {formatDayCount(pl.total_days)}
                    </p>
                    {pl.notes && <p className="text-xs text-slate-400 italic mt-0.5">{pl.notes}</p>}
                  </div>
                  <Link
                    to={`/review?stage=${targetStage}&state=pending`}
                    className="self-end sm:self-center text-xs font-semibold text-primary-800 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-4 py-2 rounded-2xl transition-colors flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>مراجعة الطلب</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current leave */}
      {currentLeave && (
        <div className="card-elevated border border-amber-200/70 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Plane className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="section-title">الإجازة الحالية</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-slate-400">النوع</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{currentLeave.leave_type?.name_ar ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">البداية</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{formatDate(currentLeave.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">النهاية</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{formatDate(currentLeave.end_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">نهاية الإجازة</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">{getRemainingLabel(currentLeave.end_date)}</p>
            </div>
          </div>
          {currentLeave.notes && <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">{currentLeave.notes}</p>}
        </div>
      )}

      {/* Upcoming leave */}
      {upcomingLeave && (
        <div className="card-elevated border border-blue-200/70 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="section-title">الإجازة القادمة</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-slate-400">النوع</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{upcomingLeave.leave_type?.name_ar ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">البداية</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{formatDate(upcomingLeave.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">النهاية</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{formatDate(upcomingLeave.end_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">تبدأ</p>
              <p className="text-sm font-bold text-blue-700 mt-0.5">
                {getRelativeDaysLabel(upcomingLeave.start_date)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leave history */}
      <div className="card-elevated overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <h2 className="section-title">سجل الإجازات</h2>
            <p className="text-xs text-slate-400">عدد الإجازات التي تم عرضها: {approvedLeaves.length}</p>
          </div>
        </div>
        {approvedLeaves.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-7 h-7" />}
            title="لا توجد إجازات تم عرضها بعد"
            message={reviewablePendingLeaves.length > 0 ? 'توجد طلبات منتظرة في البطاقة المخصصة أعلاه.' : 'لم يُسجل عرض أي إجازات لهذا الموظف حتى الآن.'}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {approvedLeaves.map((leave) => {
              const status = getLeaveStatus(leave.start_date, leave.end_date, leave.status);
              const stConfig = statusConfig[status];
              const creator = leave.creator;
              return (
                <div key={leave.id} className="px-4 sm:px-5 py-3 sm:py-3.5 flex items-start sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full ${stConfig.dot} shrink-0 mt-1.5 sm:mt-0`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{leave.leave_type?.name_ar ?? 'إجازة'}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {formatDate(leave.start_date)} ← {formatDate(leave.end_date)} · {formatDayCount(leave.total_days)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        سجل بتاريخ: {formatDate(leave.created_at)}
                        {isAdmin && creator && (
                          <span className="mr-1.5"> · <ResponsivePersonName name={creator.full_name ?? creator.email} /></span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge label={stConfig.label} color={stConfig.color} bg={stConfig.bg} dot={stConfig.dot} />
                    {(isAdmin || permissionCoversMember(permissions, 'cancel_any_leave', member, sectors, undersecretaries) || (leave.created_by === user?.id && permissionCoversMember(permissions, 'cancel_own_leave', member, sectors, undersecretaries))) && status !== 'cancelled' && (
                      <button onClick={() => setCancelTarget(leave)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="إلغاء الإجازة">
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {leaveFormOpen && (
        <LeaveFormModal
          open={leaveFormOpen}
          onClose={() => { setLeaveFormOpen(false); setEditingLeave(null); }}
          onSaved={() => refetch()}
          preselectedMemberId={member.id}
          editingLeave={editingLeave}
        />
      )}
      {editMemberOpen && (
        <MemberFormModal
          open={editMemberOpen}
          onClose={() => setEditMemberOpen(false)}
          onSaved={() => {
            setEditMemberOpen(false);
            refetchMember();
          }}
          editingMember={member}
        />
      )}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelError(null); }}
        onConfirm={handleCancelLeave}
        busy={cancelBusy}
        closeOnConfirm={false}
        error={cancelError}
        title="إلغاء الإجازة"
        message={`هل أنت متأكد من إلغاء هذه الإجازة من ${cancelTarget ? formatDate(cancelTarget.start_date) : ''} إلى ${cancelTarget ? formatDate(cancelTarget.end_date) : ''}؟`}
        confirmLabel="إلغاء الإجازة"
        danger
      />
    </div>
  );
}
