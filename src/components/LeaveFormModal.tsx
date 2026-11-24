import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, Eye, Calendar, CalendarCheck, Clock, Plane, FileCheck, RotateCcw, FileText, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DatePicker } from '@/components/DatePicker';
import { RankInsignia } from '@/components/RankInsignia';
import { ResponsivePersonName } from '@/components/PersonName';
import { useLeaveTypes, useLeadershipMembers } from '@/hooks/useData';
import { formatSectorPath } from '@/utils/organization';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, daysBetween, formatDate, formatDayCount, todayInKuwait } from '@/utils/date';
import { ranks } from '@/constants';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import { useFormCloseGuard } from '@/hooks/useFormCloseGuard';
import { cleanDurationInput } from '@/utils/number';
import type { LeadershipLeave } from '@/types';

interface LeaveFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  preselectedMemberId?: string | null;
  editingLeave?: LeadershipLeave | null;
}

export function LeaveFormModal({ open, onClose, onSaved, preselectedMemberId, editingLeave }: LeaveFormModalProps) {
  const { leaveTypes } = useLeaveTypes();
  const { members } = useLeadershipMembers({ isActive: true });
  const { user } = useAuth();

  const [memberId, setMemberId] = useState(preselectedMemberId ?? '');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Searchable leader selector state with portal
  const [memberSearch, setMemberSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [memberDropdownPos, setMemberDropdownPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });
  const memberTriggerRef = useRef<HTMLButtonElement>(null);
  const memberMenuRef = useRef<HTMLDivElement>(null);

  const updateMemberDropdownPosition = () => {
    if (memberTriggerRef.current) {
      const rect = memberTriggerRef.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 20);
      setMemberDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
        width,
      });
    }
  };

  // Close dropdown on click outside & window resize/scroll
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        memberTriggerRef.current &&
        !memberTriggerRef.current.contains(target) &&
        memberMenuRef.current &&
        !memberMenuRef.current.contains(target)
      ) {
        setMemberDropdownOpen(false);
      }
    }

    function handleReposition() {
      if (memberDropdownOpen) {
        updateMemberDropdownPosition();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && memberDropdownOpen) {
        e.stopPropagation();
        setMemberDropdownOpen(false);
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
  }, [memberDropdownOpen]);

  const selectedMember = useMemo(() => {
    return members.find((m) => m.id === memberId) ?? null;
  }, [members, memberId]);

  // Filtered members list with instant query (search by name, file number, job title)
  const filteredMembers = useMemo(() => {
    let result = members;
    if (rankFilter) {
      result = result.filter((m) => m.rank === rankFilter);
    }
    if (memberSearch.trim()) {
      result = result.filter((m) =>
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
          memberSearch
        )
      );
    }
    return result;
  }, [members, rankFilter, memberSearch]);

  useEffect(() => {
    if (editingLeave) {
      setMemberId(editingLeave.leadership_member_id);
      setLeaveTypeId(editingLeave.leave_type_id ?? '');
      setStartDate(editingLeave.start_date);
      setEndDate(editingLeave.end_date);
      setReturnDate(editingLeave.return_date ?? '');
      setDurationDays(String(daysBetween(editingLeave.start_date, editingLeave.end_date)));
      setNotes(editingLeave.notes ?? '');
    } else {
      setMemberId(preselectedMemberId ?? '');
      setLeaveTypeId('');
      setStartDate('');
      setEndDate('');
      setReturnDate('');
      setDurationDays('');
      setNotes('');
    }
    setError(null);
    setFieldError(null);
    setOverlapWarning(null);
  }, [editingLeave, preselectedMemberId, open]);

  const handleStartDateChange = (val: string) => {
    setFieldError(null);
    setStartDate(val);
    setDurationDays('');
    // If end date is earlier than start date, clear it
    if (endDate && val && val > endDate) {
      setEndDate('');
      setReturnDate('');
    }
  };

  const handleEndDateChange = (val: string) => {
    setFieldError(null);
    setEndDate(val);
    setDurationDays('');
    if (returnDate && val && returnDate < val) setReturnDate('');
  };

  const applyDuration = () => {
    const days = Number(cleanDurationInput(durationDays));
    if (!Number.isSafeInteger(days) || days < 1) return;
    const base = startDate || todayInKuwait();
    const end = addDays(base, days - 1);
    setStartDate(base);
    setEndDate(end);
    if (returnDate && returnDate < end) setReturnDate('');
  };

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return daysBetween(startDate, endDate);
  }, [startDate, endDate]);

  const initialDuration = editingLeave ? String(daysBetween(editingLeave.start_date, editingLeave.end_date)) : '';
  const dirty = [memberId, leaveTypeId, startDate, endDate, returnDate, durationDays, notes].join('\u0000') !== [
    editingLeave?.leadership_member_id ?? preselectedMemberId ?? '', editingLeave?.leave_type_id ?? '',
    editingLeave?.start_date ?? '', editingLeave?.end_date ?? '', editingLeave?.return_date ?? '',
    initialDuration, editingLeave?.notes ?? '',
  ].join('\u0000');
  const { confirmDiscard, setConfirmDiscard, requestClose, discardAndClose } = useFormCloseGuard(open, dirty, onClose);
  const guardedClose = () => { if (!saving) requestClose(); };

  const failField = (field: string, message: string) => {
    setFieldError({ field, message });
    window.requestAnimationFrame(() => document.getElementById(field)?.focus());
  };

  const previewMember = useMemo(() => members.find((m) => m.id === memberId), [members, memberId]);
  const previewLeaveType = useMemo(() => leaveTypes.find((t) => t.id === leaveTypeId), [leaveTypes, leaveTypeId]);

  // Check for overlaps
  useEffect(() => {
    if (!memberId || !startDate || !endDate) { setOverlapWarning(null); return; }
    (async () => {
      let query = supabase
        .from('leadership_leaves')
        .select('id, start_date, end_date')
        .eq('leadership_member_id', memberId)
        .neq('approval_status', 'rejected')
        .neq('status', 'cancelled')
        .lte('start_date', endDate)
        .gte('end_date', startDate);
      if (editingLeave) query = query.neq('id', editingLeave.id);
      const { data } = await query;
      if (data && data.length > 0) {
        const overlap = data[0];
        setOverlapWarning(`يوجد تداخل مع إجازة مسجلة من ${formatDate(overlap.start_date)} إلى ${formatDate(overlap.end_date)}`);
      } else {
        setOverlapWarning(null);
      }
    })();
  }, [memberId, startDate, endDate, editingLeave]);

  const handleSave = async () => {
    setError(null);
    setFieldError(null);
    if (!memberId) { failField('leave-member', 'اختر الموظف قبل إرسال الطلب.'); return; }
    if (!leaveTypeId) { failField('leave-type', 'اختر نوع الإجازة.'); return; }
    if (!startDate) { failField('leave-start', 'حدد تاريخ البداية.'); return; }
    if (!endDate) { failField('leave-end', 'حدد تاريخ النهاية.'); return; }
    if (startDate > endDate) { failField('leave-end', 'تاريخ النهاية يجب ألا يسبق البداية.'); return; }
    if (returnDate && returnDate < endDate) { failField('leave-return', 'تاريخ المباشرة يجب ألا يسبق نهاية الإجازة.'); return; }
    if (overlapWarning) { failField('leave-start', overlapWarning); return; }

    setSaving(true);
    const payload = {
      leadership_member_id: memberId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      return_date: returnDate || null,
      total_days: totalDays,
      status: 'upcoming' as const,
      notes: notes || null,
      created_by: user?.id,
      updated_by: user?.id,
    };

    try {
      if (editingLeave) {
        const { data, error } = await supabase
          .from('leadership_leaves')
          .update({ ...payload, approval_status: 'pending', updated_by: user?.id })
          .eq('id', editingLeave.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('تعذر تعديل الإجازة. حدّث الصفحة ثم حاول مجددًا.');
      } else {
        const { error } = await supabase.from('leadership_leaves').insert(payload);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={guardedClose}
      title={editingLeave ? 'تعديل وإعادة تقديم الإجازة' : 'طلب إجازة جديدة'}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button className="btn-secondary h-11 w-full sm:w-48" onClick={guardedClose} disabled={saving}>إلغاء</button>
          <button className="btn-primary h-11 w-full sm:w-48" onClick={handleSave} disabled={saving || !!overlapWarning}>
            {saving ? 'جارٍ الحفظ...' : 'تقديم طلب الإجازة'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Searchable Leader Selector */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">الموظف *</label>
            <span className="text-xs text-slate-400">
              الموظفون المعروضون: {filteredMembers.length} من {members.length}
            </span>
          </div>

          {/* Trigger button */}
          <button
            id="leave-member"
            type="button"
            ref={memberTriggerRef}
            aria-label="اختيار الموظف"
            aria-expanded={memberDropdownOpen}
            aria-haspopup="listbox"
            aria-invalid={fieldError?.field === 'leave-member'}
            disabled={!!preselectedMemberId}
            onClick={() => {
              if (!preselectedMemberId) {
                if (!memberDropdownOpen) {
                  updateMemberDropdownPosition();
                }
                setMemberDropdownOpen(!memberDropdownOpen);
              }
            }}
            className={`input-field flex items-center justify-between text-right min-h-[48px] py-1.5 cursor-pointer select-none bg-white transition-all ${
              preselectedMemberId ? 'opacity-75 cursor-not-allowed bg-slate-50' : 'hover:border-slate-400'
            }`}
          >
            {selectedMember ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <RankInsignia rank={selectedMember.rank} size="xs" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">{selectedMember.rank}</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-sm font-semibold text-slate-800">
                      <ResponsivePersonName name={selectedMember.full_name} />
                    </span>
                    <span className="text-xs text-slate-400">({selectedMember.file_number})</span>
                  </div>
                  {selectedMember.job_title && (
                    <p className="text-[11px] text-slate-500 truncate">{selectedMember.job_title}</p>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-slate-400 text-sm">-- ابحث بالاسم، رقم الملف / المدني، أو المسمى الوظيفي --</span>
            )}
            {!preselectedMemberId && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
          </button>
          {fieldError?.field === 'leave-member' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}

          {/* Search Popover Dropdown rendered outside modal with Portal */}
          {memberDropdownOpen &&
            createPortal(
              <div
                ref={memberMenuRef}
                dir="rtl"
                style={{
                  position: 'fixed',
                  top: `${memberDropdownPos.top}px`,
                  left: `${memberDropdownPos.left}px`,
                  width: `${memberDropdownPos.width}px`,
                  zIndex: 99999,
                  maxHeight: '360px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 py-2 animate-fade-in"
              >
                {/* Search Bar + Quick Rank Filter */}
                <div className="px-3 pb-2.5 border-b border-slate-100 space-y-2">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute right-2.5 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="ابحث بالاسم، رقم الملف / المدني، المنصب..."
                      className="w-full text-xs pr-8 pl-3 py-2 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-primary-500 focus:bg-white"
                    />
                    {memberSearch && (
                      <button
                        type="button"
                        onClick={() => setMemberSearch('')}
                        className="absolute left-2.5 text-xs text-slate-400 hover:text-slate-600"
                      >
                        مسح
                      </button>
                    )}
                  </div>

                  {/* Horizontal Quick Rank Pills for Fast Filtering */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setRankFilter('')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                        !rankFilter ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      الكل ({members.length})
                    </button>
                    {ranks.map((r) => {
                      const count = members.filter((m) => m.rank === r).length;
                      if (count === 0) return null;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRankFilter(rankFilter === r ? '' : r)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                            rankFilter === r ? 'bg-primary-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {r} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Members List */}
                <div className="overflow-y-auto flex-1 divide-y divide-slate-50 py-1">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMemberId(m.id);
                        setMemberDropdownOpen(false);
                        setMemberSearch('');
                      }}
                      className={`w-full text-right px-3 py-2.5 text-xs cursor-pointer flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        memberId === m.id ? 'bg-primary-50/70 text-primary-900 font-semibold' : 'text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <RankInsignia rank={m.rank} size="xs" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900">{m.rank}</span>
                            <span className="text-slate-400">/</span>
                            <span className="font-semibold text-slate-800"><ResponsivePersonName name={m.full_name} /></span>
                            <span className="text-slate-400 text-[10px]">({m.file_number})</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {m.job_title}
                            {m.sector ? ` · ${formatSectorPath(m.sector)}` : ''}
                          </p>
                        </div>
                      </div>
                      {memberId === m.id && <Check className="w-4 h-4 text-primary-700 shrink-0 mr-2" />}
                    </button>
                  ))}

                  {filteredMembers.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400">
                      لا يوجد موظف مطابق للبحث
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
        </div>

        <div>
            <label htmlFor="leave-type" className="block text-sm font-medium text-slate-700 mb-1.5">نوع الإجازة *</label>
          <select id="leave-type" className="input-field" value={leaveTypeId} aria-invalid={fieldError?.field === 'leave-type'} onChange={(e) => { setLeaveTypeId(e.target.value); setFieldError(null); }}>
            <option value="">-- اختر --</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name_ar}</option>
            ))}
          </select>
          {fieldError?.field === 'leave-type' && <p role="alert" className="mt-1 text-xs text-red-700">{fieldError.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DatePicker
            id="leave-start"
            label="تاريخ البداية"
            error={fieldError?.field === 'leave-start' ? fieldError.message : undefined}
            value={startDate}
            onChange={handleStartDateChange}
            required
            presets={[
              { label: 'اليوم', daysOffset: 0 },
              { label: 'غدًا', daysOffset: 1 },
              { label: 'بعد أسبوع', daysOffset: 7 },
            ]}
          />
          <DatePicker
            id="leave-end"
            label="تاريخ النهاية"
            error={fieldError?.field === 'leave-end' ? fieldError.message : undefined}
            value={endDate}
            onChange={handleEndDateChange}
            min={startDate}
            required
          />
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label htmlFor="leave-duration" className="block text-sm font-medium text-slate-700 mb-1.5">تحديد مدة الإجازة بالأيام</label>
          <div className="flex items-center gap-2">
            <input
              id="leave-duration"
              type="text"
              inputMode="numeric"
              value={durationDays}
              onChange={(event) => setDurationDays(cleanDurationInput(event.target.value))}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyDuration(); } }}
              placeholder="أدخل عدد الأيام"
              className="input-field min-w-0 flex-1"
            />
            <button type="button" onClick={applyDuration} disabled={!Number.isSafeInteger(Number(cleanDurationInput(durationDays))) || Number(cleanDurationInput(durationDays)) < 1} className="btn-secondary shrink-0">تطبيق</button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">تُحسب المدة من تاريخ البداية، أو من اليوم إذا لم تحدده بعد.</p>
        </div>

        <div>
          <DatePicker
            id="leave-return"
            label="تاريخ العودة / المباشرة (اختياري)"
            error={fieldError?.field === 'leave-return' ? fieldError.message : undefined}
            value={returnDate}
            onChange={(value) => { setReturnDate(value); setFieldError(null); }}
            min={endDate || startDate}
            placeholder="اختر تاريخ المباشرة عند الحاجة"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">ملاحظات</label>
          <textarea className="input-field min-h-[80px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." />
        </div>

        {overlapWarning && (
          <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {overlapWarning}
          </div>
        )}

        {/* Preview */}
        {memberId && startDate && endDate && (
          <div className="rounded-2xl border border-primary-200/90 bg-gradient-to-br from-primary-50/70 via-slate-50/50 to-white p-4 sm:p-5 shadow-xs space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-primary-100/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary-700 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-none">معاينة تفاصيل الإجازة</h3>
                  <p className="text-[11px] text-slate-500 mt-1">تأكد من صحة التواريخ والبيانات قبل تقديم الطلب</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${
                  editingLeave
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {editingLeave ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    تعديل وإعادة تقديم
                  </>
                ) : (
                  <>
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    طلب جديد
                  </>
                )}
              </span>
            </div>

            {/* Leader & Leave Type Card */}
            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <RankInsignia rank={previewMember?.rank} size="md" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 font-medium">الموظف صاحب الإجازة</p>
                  <h4 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                    {previewMember?.rank} / <ResponsivePersonName name={previewMember?.full_name} />
                  </h4>
                  {(previewMember?.job_title || previewMember?.sector?.name_ar) && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {[previewMember.job_title, previewMember.sector?.name_ar].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 self-start sm:self-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary-700 text-white shadow-xs">
                  <Plane className="w-3.5 h-3.5" />
                  {previewLeaveType?.name_ar ?? 'إجازة اعتيادية'}
                </span>
              </div>
            </div>

            {/* Dates & Timeline Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Start Date */}
              <div className="rounded-xl bg-white border border-slate-200/80 p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[11px] font-medium">تاريخ البداية</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  {formatDate(startDate)}
                </p>
              </div>

              {/* End Date */}
              <div className="rounded-xl bg-white border border-slate-200/80 p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-[11px] font-medium">تاريخ الانتهاء</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  {formatDate(endDate)}
                </p>
              </div>

              {/* Total Duration */}
              <div className="rounded-xl bg-primary-50/90 border border-primary-200/80 p-3">
                <div className="flex items-center gap-1.5 text-primary-700 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">المدة الإجمالية</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-primary-900 leading-tight">
                  {formatDayCount(totalDays)}
                </p>
              </div>

              {/* Return Date */}
              <div className="rounded-xl bg-white border border-slate-200/80 p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <CalendarCheck className="w-3.5 h-3.5 text-teal-600" />
                  <span className="text-[11px] font-medium">تاريخ المباشرة</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                  {returnDate ? formatDate(returnDate) : 'اليوم التالي'}
                </p>
              </div>
            </div>

            {/* Notes preview if entered */}
            {notes.trim() && (
              <div className="rounded-xl bg-white border border-slate-200/80 p-3 flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-700">ملاحظات مسجلة:</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">{notes}</p>
                </div>
              </div>
            )}

            {/* Workflow status notification */}
            <div className="rounded-xl bg-blue-50/80 border border-blue-200/70 p-3 flex items-start gap-2.5 text-xs text-blue-900">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                {editingLeave ? (
                  <span>
                    عند الضغط على <strong>«تقديم طلب الإجازة»</strong>، سيتم تحديث بيانات الإجازة ونقلها فورًا إلى مكتب المدير العام للتدقيق والإحالة كطلب منتظر.
                  </span>
                ) : (
                  <span>
                    عند الضغط على <strong>«تقديم طلب الإجازة»</strong>، سيتم توجيه طلب الإجازة إلى مكتب المدير العام للتدقيق والإحالة، ثم مكتب رئيس الجهة لعرضه على رئيس الجهة وتسجيل «تم العرض».
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmDiscard}
      onClose={() => setConfirmDiscard(false)}
      onConfirm={discardAndClose}
      title="إغلاق طلب الإجازة؟"
      message="هناك تغييرات لم تُحفظ. سيؤدي الإغلاق إلى فقدانها."
      confirmLabel="تجاهل التغييرات"
      danger
    />
    </>
  );
}
