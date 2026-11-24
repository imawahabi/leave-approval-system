import { useEffect, useState, useCallback } from 'react';
import { Building2, Plus, Pencil, Trash2, ChevronDown, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import type { AssistantUndersecretary, Sector, Department } from '@/types';

type EditTarget = { type: 'undersecretary' | 'sector' | 'department'; id: string; name: string };

export function AdminSectorsPage() {
  const { isAdmin, hasPermission } = useAuth();
  const canManageOrganization = isAdmin || hasPermission('manage_organization');
  const [undersecretaries, setUndersecretaries] = useState<AssistantUndersecretary[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [underModal, setUnderModal] = useState<{ open: boolean; editing?: AssistantUndersecretary | null }>({ open: false });
  const [sectorModal, setSectorModal] = useState<{ open: boolean; editing?: Sector | null }>({ open: false });
  const [deptModal, setDeptModal] = useState<{ open: boolean; sectorId?: string; editing?: Department | null }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<EditTarget | null>(null);
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formUnderId, setFormUnderId] = useState('');
  const [formParentSectorId, setFormParentSectorId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const [uRes, sRes, dRes] = await Promise.all([
      supabase.from('assistant_undersecretaries').select('*').order('sort_order').order('name_ar'),
      supabase.from('sectors').select('*').order('sort_order').order('name_ar'),
      supabase.from('departments').select('*').order('sort_order').order('name_ar'),
    ]);
    const fetchError = uRes.error ?? sRes.error ?? dRes.error;
    if (fetchError) setError(fetchError.message);
    else {
      setUndersecretaries(uRes.data as AssistantUndersecretary[]);
      setSectors(sRes.data as Sector[]);
      setDepartments(dRes.data as Department[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);

  const prepareForm = (name = '', nameEn = '', underId = '', parentSectorId = '') => {
    setFormName(name);
    setFormNameEn(nameEn);
    setFormUnderId(underId);
    setFormParentSectorId(parentSectorId);
    setFormError(null);
    setActionError(null);
  };

  const save = async (type: EditTarget['type']) => {
    if (!formName.trim()) { setFormError('الاسم مطلوب'); return; }
    if (type === 'department' && !deptModal.sectorId) { setFormError('القطاع مطلوب'); return; }
    setFormError(null);
    setFormSaving(true);
    try {
      if (type === 'undersecretary') {
        const payload = { name_ar: formName.trim(), name_en: formNameEn.trim() || null,
          ...(!underModal.editing ? { unit_kind: 'assistant', parent_id: undersecretaries.find((u) => u.unit_kind === 'undersecretary')?.id ?? null } : {}) };
        const result = underModal.editing
          ? await supabase.from('assistant_undersecretaries').update(payload).eq('id', underModal.editing.id).select('id').single()
          : await supabase.from('assistant_undersecretaries').insert(payload).select('id').single();
        if (result.error) throw result.error;
        setUnderModal({ open: false });
      } else if (type === 'sector') {
        const payload = {
          name_ar: formName.trim(), name_en: formNameEn.trim() || null,
          assistant_undersecretary_id: formUnderId || null,
          parent_sector_id: formParentSectorId || null,
        };
        const result = sectorModal.editing
          ? await supabase.from('sectors').update(payload).eq('id', sectorModal.editing.id).select('id').single()
          : await supabase.from('sectors').insert(payload).select('id').single();
        if (result.error) throw result.error;
        setSectorModal({ open: false });
      } else {
        const payload = { name_ar: formName.trim(), name_en: formNameEn.trim() || null, sector_id: deptModal.sectorId! };
        const result = deptModal.editing
          ? await supabase.from('departments').update(payload).eq('id', deptModal.editing.id).select('id').single()
          : await supabase.from('departments').insert(payload).select('id').single();
        if (result.error) throw result.error;
        setDeptModal({ open: false });
      }
      await fetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر حفظ التغيير.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setActionError(null);
    if (deleteTarget.type === 'sector' || deleteTarget.type === 'department') {
      const checks = deleteTarget.type === 'sector'
        ? await Promise.all([
          supabase.from('departments').select('id', { count: 'exact', head: true }).eq('sector_id', deleteTarget.id),
          supabase.from('leadership_members').select('id', { count: 'exact', head: true }).eq('sector_id', deleteTarget.id),
        ])
        : [await supabase.from('leadership_members').select('id', { count: 'exact', head: true }).eq('department_id', deleteTarget.id)];
      if (checks.some((check) => check.error)) {
        setActionError('تعذر التحقق من الارتباطات. حاول مجددًا.');
        setDeleteBusy(false);
        return;
      }
      if (checks.some((check) => (check.count ?? 0) > 0)) {
        setActionError(deleteTarget.type === 'sector'
          ? 'لا يمكن حذف قطاع مرتبط بإدارات أو موظفون. انقل الارتباطات أولًا.'
          : 'لا يمكن حذف إدارة مرتبطة بموظفون. انقل ارتباطات الموظفين أولًا.');
        setDeleteBusy(false);
        return;
      }
    }
    const table = deleteTarget.type === 'undersecretary' ? 'assistant_undersecretaries'
      : deleteTarget.type === 'sector' ? 'sectors' : 'departments';
    const { data, error: deleteError } = await supabase.from(table).delete().eq('id', deleteTarget.id).select('id');
    if (deleteError || !data?.length) {
      setActionError(deleteTarget.type === 'undersecretary'
        ? 'تعذر الحذف. افصل الجهات المرتبطة بهذا المستوى التنظيمي أولًا، أو تحقق من الصلاحية.'
        : 'تعذر الحذف. تحقق من الصلاحية ثم حاول مجددًا.');
    } else {
      setDeleteTarget(null);
      await fetch();
    }
    setDeleteBusy(false);
  };

  const renderSector = (s: Sector) => {
    const sectorDepts = departments.filter((d) => d.sector_id === s.id);
    const isExpanded = expandedSector === s.id;
    return (
      <div key={s.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setExpandedSector(isExpanded ? null : s.id)}
            aria-expanded={isExpanded} className="flex items-center gap-2 flex-1 min-w-0 text-right">
            {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronLeft className="w-4 h-4 shrink-0 text-slate-400" />}
            <span className="text-sm font-semibold text-slate-900 break-words">{s.name_ar}</span>
            <Badge label={`${sectorDepts.length} إدارة`} color="text-slate-500" bg="bg-slate-50 border-slate-200" />
            {!s.is_active && <Badge label="معطل" color="text-slate-500" bg="bg-slate-50 border-slate-200" />}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => {
              prepareForm(s.name_ar, s.name_en ?? '', s.assistant_undersecretary_id ?? '', s.parent_sector_id ?? '');
              setSectorModal({ open: true, editing: s });
            }} aria-label={`تعديل القطاع ${s.name_ar}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
            {isAdmin && <button type="button" onClick={() => { setActionError(null); setDeleteTarget({ type: 'sector', id: s.id, name: s.name_ar }); }}
              aria-label={`حذف القطاع ${s.name_ar}`} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {isExpanded && (
          <div className="border-t border-slate-100">
            {sectorDepts.length === 0 ? <p className="px-4 py-3 text-xs text-slate-400">لا توجد إدارات</p> : (
              <div className="divide-y divide-slate-50">
                {sectorDepts.map((d) => (
                  <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3 sm:pr-10">
                    <span className="text-sm text-slate-700 break-words">{d.name_ar}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => { prepareForm(d.name_ar, d.name_en ?? ''); setDeptModal({ open: true, sectorId: s.id, editing: d }); }}
                        aria-label={`تعديل الإدارة ${d.name_ar}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                      {isAdmin && <button type="button" onClick={() => { setActionError(null); setDeleteTarget({ type: 'department', id: d.id, name: d.name_ar }); }}
                        aria-label={`حذف الإدارة ${d.name_ar}`} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 py-2 border-t border-slate-50">
              <button type="button" onClick={() => { prepareForm(); setDeptModal({ open: true, sectorId: s.id }); }}
                className="text-xs text-primary-700 hover:text-primary-800 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> إضافة إدارة
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOrgUnit = (u: AssistantUndersecretary) => {
    const childSectors = sectors.filter((s) => s.assistant_undersecretary_id === u.id && s.id !== u.legacy_sector_id);
    const officeDepartments = departments.filter((d) => d.sector_id === u.legacy_sector_id);
    const childAssistants = undersecretaries.filter((child) => child.parent_id === u.id);
    const isUndersecretary = u.unit_kind === 'undersecretary';
    return (
      <section key={u.id} className="card p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 break-words">{u.name_ar}</h2>
            <p className="text-xs text-slate-500">{isUndersecretary ? `${childAssistants.length} وكلاء مساعدين` : `${childSectors.length} قطاعات`}{!u.is_active ? ' · معطل' : ''}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { prepareForm(u.name_ar, u.name_en ?? ''); setUnderModal({ open: true, editing: u }); }}
              aria-label={`تعديل ${u.name_ar}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
            {isAdmin && <button type="button" onClick={() => { setActionError(null); setDeleteTarget({ type: 'undersecretary', id: u.id, name: u.name_ar }); }}
              aria-label={`حذف ${u.name_ar}`} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>
        {u.legacy_sector_id && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500">الإدارات العامة التابعة لـ{u.name_ar}</h3>
            {officeDepartments.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-700 break-words">{d.name_ar}</span>
                <button type="button" onClick={() => { prepareForm(d.name_ar, d.name_en ?? ''); setDeptModal({ open: true, sectorId: u.legacy_sector_id!, editing: d }); }}
                  aria-label={`تعديل الإدارة ${d.name_ar}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => { prepareForm(); setDeptModal({ open: true, sectorId: u.legacy_sector_id! }); }}
              className="text-xs text-primary-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة إدارة</button>
          </div>
        )}
        {childSectors.length > 0 && <div className="space-y-2">{childSectors.map(renderSector)}</div>}
        {childAssistants.length > 0 && <div className="space-y-3 border-r-2 border-primary-100 pr-3">{childAssistants.map(renderOrgUnit)}</div>}
        {!isUndersecretary && <button type="button" onClick={() => { prepareForm('', '', u.id); setSectorModal({ open: true }); }}
          className="text-xs text-primary-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة قطاع</button>}
      </section>
    );
  };

  if (!canManageOrganization) return <ErrorState message="لا تملك صلاحية إدارة الهيكل التنظيمي" />;
  if (error) return <ErrorState message={error} onRetry={fetch} />;

  const ministerSector = sectors.find((s) => s.name_ar === 'رئيس الجهة' && !s.parent_sector_id);
  const ministerChildren = sectors.filter((s) => s.parent_sector_id === ministerSector?.id && !s.assistant_undersecretary_id);
  const unassignedSectors = sectors.filter((s) => !s.assistant_undersecretary_id && s.id !== ministerSector?.id && !s.parent_sector_id);
  const rootUnits = undersecretaries.filter((u) => !u.parent_id);
  const orphanDepartments = departments.filter((d) => !d.sector_id);
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="الهيكل التنظيمي" subtitle="رئيس الجهة والمدير العام ومساعدوه والقطاعات والإدارات" icon={<Building2 className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="btn-secondary px-3 sm:px-4"
              title="وكيل مساعد"
              aria-label="وكيل مساعد"
              onClick={() => { prepareForm(); setUnderModal({ open: true }); }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">وكيل مساعد</span>
            </button>
            <button
              type="button"
              className="btn-primary px-3 sm:px-4"
              title="قطاع جديد"
              aria-label="قطاع جديد"
              onClick={() => { prepareForm(); setSectorModal({ open: true }); }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">قطاع جديد</span>
            </button>
          </div>
        } />

      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div> : (
        <>
          {ministerSector && <section className="card p-3 sm:p-4 space-y-3">
            <h2 className="font-semibold text-slate-900">{ministerSector.name_ar}</h2>
            {departments.filter((d) => d.sector_id === ministerSector.id).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-700">{d.name_ar}</span>
                <button type="button" onClick={() => { prepareForm(d.name_ar, d.name_en ?? ''); setDeptModal({ open: true, sectorId: ministerSector.id, editing: d }); }}
                  aria-label={`تعديل الإدارة ${d.name_ar}`}><Pencil className="w-4 h-4 text-slate-500" /></button>
              </div>
            ))}
            <div className="space-y-2">{ministerChildren.map(renderSector)}</div>
            <div className="space-y-3 border-r-2 border-primary-200 pr-3">{rootUnits.map(renderOrgUnit)}</div>
          </section>}
          {!ministerSector && <div className="space-y-3">{rootUnits.map(renderOrgUnit)}</div>}
          {unassignedSectors.length > 0 && <section className="card p-3 sm:p-4 space-y-3">
            <h2 className="font-semibold text-slate-900">جهات غير محددة التبعية</h2>
            <div className="space-y-2">{unassignedSectors.map(renderSector)}</div>
          </section>}

          {orphanDepartments.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-slate-700">إدارات غير مرتبطة بقطاع ({orphanDepartments.length})</h2>
              <p className="mt-1 text-xs text-slate-500">هذه سجلات قائمة لم تتغير. ربطها يحتاج تحديد القطاع الصحيح.</p>
              <p className="mt-2 text-sm text-slate-600">{orphanDepartments.map((d) => d.name_ar).join('، ')}</p>
            </section>
          )}
        </>
      )}

      <Modal open={underModal.open} onClose={() => setUnderModal({ open: false })} title={underModal.editing ? `تعديل ${underModal.editing.name_ar}` : 'وكيل مساعد جديد'} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setUnderModal({ open: false })}>إلغاء</button><button className="btn-primary" onClick={() => void save('undersecretary')} disabled={formSaving}>{formSaving ? 'جارٍ الحفظ...' : 'حفظ'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">المسمى التنظيمي بالعربية *</label><input className="input-field" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: مساعد المدير العام للعمليات" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">الاسم بالإنجليزية</label><input className="input-field" dir="ltr" value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} /></div>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        </div>
      </Modal>

      <Modal open={sectorModal.open} onClose={() => setSectorModal({ open: false })} title={sectorModal.editing ? 'تعديل قطاع' : 'قطاع جديد'} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setSectorModal({ open: false })}>إلغاء</button><button className="btn-primary" onClick={() => void save('sector')} disabled={formSaving}>{formSaving ? 'جارٍ الحفظ...' : 'حفظ'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">اسم القطاع بالعربية *</label><input className="input-field" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">الاسم بالإنجليزية</label><input className="input-field" dir="ltr" value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">التبعية للوكيل المساعد</label>
            <select className="input-field" value={formUnderId} onChange={(e) => { setFormUnderId(e.target.value); if (e.target.value) setFormParentSectorId(''); }}>
              <option value="">لا يتبع وكيلاً مساعداً</option>
              {undersecretaries.filter((u) => u.unit_kind === 'assistant' && (u.is_active || u.id === formUnderId)).map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">التبعية المباشرة لقطاع أعلى</label>
            <select className="input-field" value={formParentSectorId} onChange={(e) => { setFormParentSectorId(e.target.value); if (e.target.value) setFormUnderId(''); }}>
              <option value="">لا توجد تبعية مباشرة لقطاع</option>
              {sectors.filter((s) => s.id !== sectorModal.editing?.id && !s.parent_sector_id && !s.assistant_undersecretary_id).map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
            </select>
          </div>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        </div>
      </Modal>

      <Modal open={deptModal.open} onClose={() => setDeptModal({ open: false })} title={deptModal.editing ? 'تعديل إدارة' : 'إدارة جديدة'} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setDeptModal({ open: false })}>إلغاء</button><button className="btn-primary" onClick={() => void save('department')} disabled={formSaving}>{formSaving ? 'جارٍ الحفظ...' : 'حفظ'}</button></>}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">اسم الإدارة بالعربية *</label><input className="input-field" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">الاسم بالإنجليزية</label><input className="input-field" dir="ltr" value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} /></div>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => { if (!deleteBusy) setDeleteTarget(null); }} onConfirm={() => void handleDelete()}
        title="حذف" message={`هل أنت متأكد من حذف "${deleteTarget?.name}"؟`} confirmLabel="حذف" danger busy={deleteBusy} closeOnConfirm={false} error={actionError} />
    </div>
  );
}
