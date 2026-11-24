import { useEffect, useState, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import type { LeaveType } from '@/types';

export function AdminLeaveTypesPage() {
  const { isAdmin, hasPermission } = useAuth();
  const canManageLeaveTypes = isAdmin || hasPermission('manage_leave_types');
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing?: LeaveType | null }>({ open: false });
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('leave_types').select('*').order('sort_order');
    if (error) setError(error.message);
    else setTypes(data as LeaveType[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setFormError(null);
    if (!formName.trim()) { setFormError('الاسم مطلوب'); return; }
    setFormSaving(true);
    const payload = { name_ar: formName.trim(), name_en: formNameEn.trim() || null, is_active: true, sort_order: 0 };
    try {
      if (modal.editing) {
        await supabase.from('leave_types').update(payload).eq('id', modal.editing.id);
      } else {
        await supabase.from('leave_types').insert(payload);
      }
      setModal({ open: false });
      fetch();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'حدث خطأ'); }
    finally { setFormSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('leave_types').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    fetch();
  };

  if (!canManageLeaveTypes) return <ErrorState message="لا تملك صلاحية إدارة أنواع الإجازات" />;
  if (error) return <ErrorState message={error} onRetry={fetch} />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="أنواع الإجازات"
        subtitle="إدارة أنواع الإجازات"
        icon={<Tag className="w-5 h-5" />}
        actions={
          <button
            className="btn-primary px-3 sm:px-4"
            onClick={() => { setFormName(''); setFormNameEn(''); setModal({ open: true }); }}
            title="نوع جديد"
            aria-label="نوع جديد"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">نوع جديد</span>
          </button>
        }
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : types.length === 0 ? (
        <div className="card"><EmptyState title="لا توجد أنواع إجازات" message="أضف نوع إجازة ليظهر في نموذج الطلب." action={<button type="button" className="btn-primary" onClick={() => { setFormName(''); setFormNameEn(''); setModal({ open: true }); }}>إضافة نوع إجازة</button>} /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {types.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center"><Tag className="w-4 h-4 text-primary-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.name_ar}</p>
                    {t.name_en && <p className="text-xs text-slate-400">{t.name_en}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!t.is_active && <Badge label="معطل" color="text-slate-500" bg="bg-slate-50 border-slate-200" />}
                  <button onClick={() => { setFormName(t.name_ar); setFormNameEn(t.name_en ?? ''); setModal({ open: true, editing: t }); }} aria-label={`تعديل نوع الإجازة ${t.name_ar}`} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"><Pencil className="w-4 h-4" /></button>
                  {isAdmin && <button onClick={() => setDeleteTarget(t)} aria-label={`حذف نوع الإجازة ${t.name_ar}`} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.editing ? 'تعديل نوع إجازة' : 'نوع إجازة جديد'} size="sm"
        footer={<div className="flex items-center justify-end gap-2 w-full"><button className="btn-secondary w-full sm:w-48" onClick={() => setModal({ open: false })}>إلغاء</button><button className="btn-primary w-full sm:w-48" onClick={handleSave} disabled={formSaving}>{formSaving ? 'جارٍ الحفظ...' : 'حفظ'}</button></div>}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">الاسم (عربي) *</label><input className="input-field" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">الاسم (إنجليزي)</label><input className="input-field" value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} dir="ltr" /></div>
          {formError && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>}
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="حذف نوع إجازة" message={`هل أنت متأكد من حذف "${deleteTarget?.name_ar}"؟`} confirmLabel="حذف" danger />
    </div>
  );
}
