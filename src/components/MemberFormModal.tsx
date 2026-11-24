import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSectors, useDepartments, useAssistantUndersecretaries } from '@/hooks/useData';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFormCloseGuard } from '@/hooks/useFormCloseGuard';
import { ranks } from '@/constants';
import type { LeadershipMember } from '@/types';
import { formatSectorPath, isAssistantOfficeSector } from '@/utils/organization';
import { permissionCoversMember } from '@/utils/permissions';
import { normalizeArabicDigits } from '@/utils/number';

interface MemberFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingMember?: LeadershipMember | null;
}

export function MemberFormModal({ open, onClose, onSaved, editingMember }: MemberFormModalProps) {
  const { user, permissions, isAdmin } = useAuth();
  const { sectors, refetch: refetchSectors } = useSectors();
  const { undersecretaries } = useAssistantUndersecretaries();
  const [sectorId, setSectorId] = useState(editingMember?.sector_id ?? '');
  const { departments } = useDepartments(sectorId || null);

  const [fullName, setFullName] = useState(editingMember?.full_name ?? '');
  const [fileNumber, setFileNumber] = useState(editingMember?.file_number ?? '');
  const [rank, setRank] = useState(editingMember?.rank ?? '');
  const [jobTitle, setJobTitle] = useState(editingMember?.job_title ?? '');
  const [departmentId, setDepartmentId] = useState(editingMember?.department_id ?? '');

  const [notes, setNotes] = useState(editingMember?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(editingMember?.full_name ?? '');
      setFileNumber(editingMember?.file_number ?? '');
      setRank(editingMember?.rank ?? '');
      setJobTitle(editingMember?.job_title ?? '');
      setSectorId(editingMember?.sector_id ?? '');
      setDepartmentId(editingMember?.department_id ?? '');
      setNotes(editingMember?.notes ?? '');
      setError(null);
      setFieldError(null);
    }
  }, [open, editingMember]);

  // Sector dropdown & search state with portal positioning
  const [sectorSearch, setSectorSearch] = useState('');
  const [sectorDropdownOpen, setSectorDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });
  const sectorTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

  const updateDropdownPosition = () => {
    if (sectorTriggerRef.current) {
      const rect = sectorTriggerRef.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 20);
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
        width,
      });
    }
  };

  // Add new sector modal state
  const [newSectorModalOpen, setNewSectorModalOpen] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorError, setNewSectorError] = useState<string | null>(null);
  const [newSectorSaving, setNewSectorSaving] = useState(false);

  // Selected sector object
  const selectedSector = useMemo(() => {
    return sectors.find((s) => s.id === sectorId) ?? null;
  }, [sectors, sectorId]);
  const canEditExistingMember = !editingMember || permissionCoversMember(
    permissions,
    'edit_leader',
    editingMember,
    sectors,
    undersecretaries,
    isAdmin,
  );

  // Filtered sectors for searchable dropdown
  const filteredSectors = useMemo(() => {
    if (!sectorSearch.trim()) return sectors;
    const q = sectorSearch.trim().toLowerCase();
    return sectors.filter(
      (s) =>
        s.name_ar.toLowerCase().includes(q) ||
        s.assistant_undersecretary?.name_ar.toLowerCase().includes(q) ||
        (s.name_en && s.name_en.toLowerCase().includes(q))
    );
  }, [sectors, sectorSearch]);

  // Close sector dropdown when clicking outside and handle scroll/resize
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        sectorTriggerRef.current &&
        !sectorTriggerRef.current.contains(target) &&
        dropdownMenuRef.current &&
        !dropdownMenuRef.current.contains(target)
      ) {
        setSectorDropdownOpen(false);
      }
    }

    function handleReposition() {
      if (sectorDropdownOpen) {
        updateDropdownPosition();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && sectorDropdownOpen) {
        e.stopPropagation();
        setSectorDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [sectorDropdownOpen]);

  const handleCreateSector = async () => {
    const trimmed = newSectorName.trim();
    if (!trimmed) {
      setNewSectorError('يرجى إدخال اسم القطاع');
      return;
    }

    setNewSectorSaving(true);
    setNewSectorError(null);

    try {
      const payload = {
        name_ar: trimmed,
        is_active: true,
        sort_order: 0,
      };

      const { data, error: insertError } = await supabase
        .from('sectors')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      await refetchSectors();
      setSectorId(data.id);
      setDepartmentId('');
      setNewSectorModalOpen(false);
      setNewSectorName('');
      setSectorDropdownOpen(false);
      setSectorSearch('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إضافة القطاع';
      setNewSectorError(msg);
    } finally {
      setNewSectorSaving(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setFieldError(null);
    if (!fullName.trim()) { failField('member-name', 'أدخل الاسم الكامل.'); return; }
    const cleanFileNumber = normalizeArabicDigits(fileNumber).trim();
    if (!cleanFileNumber) { failField('member-file', 'أدخل رقم الملف أو الرقم المدني.'); return; }
    if (!rank) { failField('member-rank', 'اختر المسمى الوظيفي.'); return; }
    if (!jobTitle.trim()) { failField('member-job', 'أدخل المنصب.'); return; }

    const permissionTarget = editingMember
      ? editingMember
      : { sector_id: sectorId || null, department_id: departmentId || null };
    const requiredPermission = editingMember ? 'edit_leader' : 'create_leader';
    if (!permissionCoversMember(permissions, requiredPermission, permissionTarget, sectors, undersecretaries, isAdmin)) {
      setError(editingMember
        ? 'لا تملك صلاحية تعديل هذا الموظف ضمن نطاقك التنظيمي.'
        : 'لا تملك صلاحية إضافة موظف ضمن هذا النطاق التنظيمي.');
      return;
    }

    setSaving(true);
    try {
      if (editingMember) {
        const updatePayload: Record<string, unknown> = {
          full_name: fullName.trim(),
          file_number: cleanFileNumber,
          rank,
          job_title: jobTitle.trim(),
          sector_id: sectorId || null,
          department_id: departmentId || null,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        if (user?.id) {
          updatePayload.updated_by = user.id;
        }

        const { data: updatedMember, error: updateErr } = await supabase
          .from('leadership_members')
          .update(updatePayload)
          .eq('id', editingMember.id)
          .select('id')
          .maybeSingle();

        if (updateErr) throw updateErr;
        if (!updatedMember) throw new Error('لم يتم تعديل الموظف. قد لا تملك صلاحية التعديل ضمن هذا النطاق، أو ربما تغيرت البيانات؛ حدّث الصفحة أو تواصل مع مدير النظام.');

      } else {
        const insertPayload: Record<string, unknown> = {
          full_name: fullName.trim(),
          file_number: cleanFileNumber,
          rank,
          job_title: jobTitle.trim(),
          sector_id: sectorId || null,
          department_id: departmentId || null,
          notes: notes.trim() || null,
          is_active: true,
        };
        if (user?.id) {
          insertPayload.created_by = user.id;
          insertPayload.updated_by = user.id;
        }

        const { error: insertErr } = await supabase
          .from('leadership_members')
          .insert(insertPayload);

        if (insertErr) throw insertErr;
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ';
      setError(msg.includes('duplicate') ? 'رقم الملف موجود مسبقًا لموظف آخر' : msg);
    } finally {
      setSaving(false);
    }
  };

  const dirty = [fullName, fileNumber, rank, jobTitle, sectorId, departmentId, notes].join('\u0000') !== [
    editingMember?.full_name ?? '', editingMember?.file_number ?? '', editingMember?.rank ?? '',
    editingMember?.job_title ?? '', editingMember?.sector_id ?? '', editingMember?.department_id ?? '',
    editingMember?.notes ?? '',
  ].join('\u0000');
  const { confirmDiscard, setConfirmDiscard, requestClose, discardAndClose } = useFormCloseGuard(open, dirty, onClose);
  const guardedClose = () => { if (!saving) requestClose(); };
  const failField = (field: string, message: string) => {
    setFieldError({ field, message });
    window.requestAnimationFrame(() => document.getElementById(field)?.focus());
  };

  return (
    <>
      <Modal
        open={open}
        onClose={guardedClose}
        title={editingMember ? 'تعديل موظف' : 'إضافة موظف جديد'}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button className="btn-secondary h-11 w-full sm:w-48" onClick={guardedClose} disabled={saving}>إلغاء</button>
            <button className="btn-primary h-11 w-full sm:w-48" onClick={handleSave} disabled={saving || (Boolean(editingMember) && !canEditExistingMember)}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        }
      >
        <div className="space-y-4">
          {editingMember && !canEditExistingMember && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>لا تملك صلاحية تعديل هذا الموظف ضمن نطاقك التنظيمي.</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center h-6 mb-1.5">
                <label htmlFor="member-name" className="block text-sm font-medium text-slate-700">الاسم الكامل *</label>
              </div>
              <input id="member-name" className="input-field" value={fullName} aria-invalid={fieldError?.field === 'member-name'} onChange={(e) => { setFullName(e.target.value); setFieldError(null); }} placeholder="الاسم الكامل" />
              {fieldError?.field === 'member-name' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}
            </div>
            <div>
              <div className="flex items-center h-6 mb-1.5">
                <label htmlFor="member-file" className="block text-sm font-medium text-slate-700">رقم الملف / المدني *</label>
              </div>
              <input id="member-file" className="input-field" value={fileNumber} aria-invalid={fieldError?.field === 'member-file'} onChange={(e) => { setFileNumber(normalizeArabicDigits(e.target.value)); setFieldError(null); }} placeholder="رقم الملف أو الرقم المدني" />
              {fieldError?.field === 'member-file' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center h-6 mb-1.5">
                <label htmlFor="member-rank" className="block text-sm font-medium text-slate-700">المسمى الوظيفي *</label>
              </div>
              <select id="member-rank" className="input-field" value={rank} aria-invalid={fieldError?.field === 'member-rank'} onChange={(e) => { setRank(e.target.value); setFieldError(null); }}>
                <option value="">-- اختر --</option>
                {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {fieldError?.field === 'member-rank' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}
            </div>
            <div>
              <div className="flex items-center h-6 mb-1.5">
                <label htmlFor="member-job" className="block text-sm font-medium text-slate-700">المنصب *</label>
              </div>
              <input id="member-job" className="input-field" value={jobTitle} aria-invalid={fieldError?.field === 'member-job'} onChange={(e) => { setJobTitle(e.target.value); setFieldError(null); }} placeholder="المنصب" />
              {fieldError?.field === 'member-job' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Searchable Sector Selector */}
            <div className="relative">
              <div className="flex items-center justify-between h-6 mb-1.5">
                <label className="block text-sm font-medium text-slate-700">القطاع</label>
                <button
                  type="button"
                  onClick={() => {
                    setNewSectorName(sectorSearch.trim());
                    setNewSectorError(null);
                    setNewSectorModalOpen(true);
                  }}
                  className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3 h-3" /> إضافة قطاع جديد
                </button>
              </div>

              {/* Trigger Button */}
              <button
                type="button"
                ref={sectorTriggerRef}
                aria-label="اختيار القطاع"
                aria-expanded={sectorDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  if (!sectorDropdownOpen) {
                    updateDropdownPosition();
                  }
                  setSectorDropdownOpen(!sectorDropdownOpen);
                }}
                className="input-field flex items-center justify-between text-right cursor-pointer select-none bg-white hover:border-slate-400"
              >
                <span className={`text-sm ${selectedSector ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                  {selectedSector ? formatSectorPath(selectedSector) : '-- اختر أو ابحث عن القطاع --'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {/* Searchable Popover Menu rendered via Portal outside modal container */}
              {sectorDropdownOpen &&
                createPortal(
                  <div
                    ref={dropdownMenuRef}
                    dir="rtl"
                    style={{
                      position: 'fixed',
                      top: `${dropdownPos.top}px`,
                      left: `${dropdownPos.left}px`,
                      width: `${dropdownPos.width}px`,
                      zIndex: 99999,
                      maxHeight: '340px',
                      overflowY: 'auto',
                    }}
                    className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 animate-fade-in"
                  >
                    {/* Search Input */}
                    <div className="pb-2 mb-1 border-b border-slate-100">
                      <div className="relative flex items-center">
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
                        <input
                          type="text"
                          autoFocus
                          value={sectorSearch}
                          onChange={(e) => setSectorSearch(e.target.value)}
                          placeholder="ابحث بالاسم..."
                          className="w-full text-sm pr-9 pl-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 focus:bg-white text-slate-900 placeholder-slate-400 transition-colors"
                        />
                      </div>
                    </div>

                    {/* List Options */}
                    <div className="py-0.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSectorId('');
                          setDepartmentId('');
                          setSectorDropdownOpen(false);
                        }}
                        className="w-full text-right px-3.5 py-2.5 text-sm text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <span>-- بدون قطاع --</span>
                        {!sectorId && <Check className="w-4 h-4 text-teal-700" />}
                      </button>

                      {filteredSectors.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSectorId(s.id);
                            setDepartmentId('');
                            setSectorDropdownOpen(false);
                            setSectorSearch('');
                          }}
                          className={`w-full text-right px-3.5 py-2.5 text-sm rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                            sectorId === s.id
                              ? 'bg-teal-50 text-teal-900 font-semibold'
                              : 'text-slate-800 hover:bg-slate-50 font-normal'
                          }`}
                        >
                          <span className="min-w-0 text-right">
                            {s.assistant_undersecretary && !isAssistantOfficeSector(s) && <span className="block text-xs text-slate-500">{s.assistant_undersecretary.name_ar}</span>}
                            <span className="block truncate">{s.name_ar}</span>
                          </span>
                          {sectorId === s.id && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                        </button>
                      ))}

                      {filteredSectors.length === 0 && (
                        <div className="px-4 py-4 text-center text-sm text-slate-400">
                          لا يوجد قطاع مطابق للبحث
                        </div>
                      )}
                    </div>

                    {/* Quick Add Button inside dropdown */}
                    <div className="pt-2 mt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setNewSectorName(sectorSearch.trim());
                          setNewSectorError(null);
                          setNewSectorModalOpen(true);
                          setSectorDropdownOpen(false);
                        }}
                        className="w-full py-2 px-3.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        إضافة جهة / قطاع غير موجود
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </div>

            {/* Department Selector */}
            <div>
              <div className="flex items-center h-6 mb-1.5">
                <label className="block text-sm font-medium text-slate-700">الإدارة / جهة العمل</label>
              </div>
              <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!sectorId}>
                <option value="">-- اختر --</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
              </select>
            </div>
          </div>



          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ملاحظات</label>
            <textarea className="input-field min-h-[80px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." />
          </div>

          {error && <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={discardAndClose}
        title="إغلاق بيانات الموظف؟"
        message="هناك تغييرات لم تُحفظ. سيؤدي الإغلاق إلى فقدانها."
        confirmLabel="تجاهل التغييرات"
        danger
      />

      {/* Confirmation & Add New Sector Modal */}
      <Modal
        open={newSectorModalOpen}
        onClose={() => setNewSectorModalOpen(false)}
        title="إضافة قطاع جديد إلى قاعدة البيانات"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              className="btn-secondary h-11 w-full sm:w-48"
              onClick={() => setNewSectorModalOpen(false)}
              disabled={newSectorSaving}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn-primary h-11 w-full sm:w-48"
              onClick={handleCreateSector}
              disabled={newSectorSaving}
            >
              {newSectorSaving ? 'جارٍ الإضافة...' : 'تأكيد وإضافة'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 leading-relaxed">
              <strong className="block font-semibold mb-0.5">تنبيه هام:</strong>
              سيُضاف القطاع إلى قائمة القطاعات، وسيظهر لجميع المستخدمين في النماذج والتقارير.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">اسم القطاع الجديد *</label>
            <input
              type="text"
              autoFocus
              className="input-field"
              value={newSectorName}
              onChange={(e) => setNewSectorName(e.target.value)}
              placeholder="مثال: قطاع شؤون الأمن الخاص"
            />
          </div>

          {newSectorError && (
            <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {newSectorError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
