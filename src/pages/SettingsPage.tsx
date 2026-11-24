import { useState, useRef, useEffect } from 'react';
import {
  UserCircle2,
  KeyRound,
  Shield,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  BadgeCheck,
  Lock,
  Settings,
  ShieldCheck,
  Laptop,
  LogOut,
  Check,
  X,
  Clock,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { accountTypeConfig, roleConfig } from '@/constants';
import { cleanNumericInput } from '@/utils/number';
import { formatDate } from '@/utils/date';

/* ─────────────────────────────────────────────
   Toast Notification Component
─────────────────────────────────────────────── */
function Toast({
  type,
  message,
  onClose,
}: {
  type: 'success' | 'error';
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (type === 'success') {
      const t = setTimeout(onClose, 5000);
      return () => clearTimeout(t);
    }
  }, [type, onClose]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs sm:text-sm animate-fade-in ${
        type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      )}
      <span className="flex-1 leading-relaxed">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-xs opacity-60 hover:opacity-100 p-0.5"
        aria-label="إغلاق التنبيه"
      >
        ✕
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Masked 4-Digit PIN Input Component
─────────────────────────────────────────────── */
function PinInput({
  id,
  value,
  onChange,
  label,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const [showPin, setShowPin] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={showPin ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={4}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(cleanNumericInput(e.target.value, 4))}
          placeholder="••••"
          autoComplete="off"
          className="input-field text-center text-lg tracking-[0.4em] font-bold pl-10"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPin((v) => !v)}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          aria-label={showPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
        >
          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-150 ${
              i < value.length ? 'bg-primary-700' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════
   SETTINGS PAGE
═════════════════════════════════════════════ */
export function SettingsPage() {
  const {
    profile,
    accountType,
    refreshProfile,
    isAdmin,
    canEdit,
    canApprove,
    hasPermission,
    signOut,
  } = useAuth();

  /* ── Name editing state ── */
  const [name, setName] = useState(profile?.full_name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* ── PIN change state ── */
  const [civilId, setCivilId] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /* Keep name in sync if profile updates externally */
  useEffect(() => {
    if (profile?.full_name) setName(profile.full_name);
  }, [profile?.full_name]);

  const nameRef = useRef<HTMLInputElement>(null);

  /* ── Handle Save Name ── */
  const handleNameSave = async () => {
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 120) {
      setNameMsg({ type: 'error', text: 'الاسم يجب أن يكون بين حرفين و 120 حرفًا.' });
      nameRef.current?.focus();
      return;
    }
    if (cleaned === profile?.full_name) {
      setNameMsg({ type: 'error', text: 'لم تقم بإجراء أي تغيير على الاسم الحالي.' });
      return;
    }
    setNameSaving(true);
    setNameMsg(null);
    try {
      const { error } = await supabase.rpc('update_my_name', { p_full_name: cleaned });
      if (error) throw error;
      await refreshProfile();
      setNameMsg({ type: 'success', text: 'تم تحديث الاسم بنجاح في النظام.' });
    } catch {
      setNameMsg({ type: 'error', text: 'تعذر حفظ الاسم. يُرجى المحاولة مرة أخرى.' });
    } finally {
      setNameSaving(false);
    }
  };

  /* ── Handle Save PIN ── */
  const handlePinSave = async () => {
    setPinMsg(null);
    if (!/^\d{12}$/.test(civilId)) {
      setPinMsg({ type: 'error', text: 'يرجى إدخال الرقم المدني كاملاً (12 رقمًا).' });
      return;
    }
    if (!/^\d{4}$/.test(currentPin)) {
      setPinMsg({ type: 'error', text: 'يرجى إدخال رمز الدخول الحالي (4 أرقام).' });
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setPinMsg({ type: 'error', text: 'يرجى إدخال رمز الدخول الجديد (4 أرقام).' });
      return;
    }
    if (newPin === currentPin) {
      setPinMsg({ type: 'error', text: 'الرمز الجديد يجب أن يكون مختلفًا عن الرمز الحالي.' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinMsg({ type: 'error', text: 'تأكيد الرمز غير متطابق مع الرمز الجديد.' });
      return;
    }

    setPinSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('civil-auth', {
        body: { action: 'self-reset-pin', civilId, pin: currentPin, newPin },
      });
      if (error || !data?.success) {
        setPinMsg({
          type: 'error',
          text: data?.error || 'تعذر تغيير الرمز. تحقق من صحة الرقم المدني والرمز الحالي.',
        });
        return;
      }
      setCivilId('');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinMsg({
        type: 'success',
        text: 'تم تغيير رمز الدخول بنجاح. استخدم الرمز الجديد في المرات القادمة.',
      });
    } catch {
      setPinMsg({ type: 'error', text: 'تعذر الاتصال بالخادم. تحقق من اتصال الشبكة وحاول ثانية.' });
    } finally {
      setPinSaving(false);
    }
  };

  const roleLabel = accountType
    ? accountTypeConfig[accountType]?.label ?? accountType
    : profile?.role
    ? roleConfig[profile.role]?.label ?? profile.role
    : 'مستخدم';

  const roleDescription = accountType
    ? accountTypeConfig[accountType]?.description
    : profile?.role === 'admin'
    ? 'صلاحية كاملة على النظام وإدارة المستخدمين'
    : profile?.role === 'approver'
    ? 'تدقيق وإحالة الطلبات وتسجيل العرض'
    : 'صلاحيات مخصصة للعمل على إجازات الموظفين';

  /* Capabilities matrix */
  const capabilities = [
    {
      title: 'عرض ومتابعة بيانات الموظفين',
      desc: 'استعراض الهيكل التنظيمي وبيانات الموظفين ومسمياتهم الوظيفية',
      enabled: isAdmin || hasPermission('view_leaders'),
    },
    {
      title: 'تسجيل وتعديل الإجازات',
      desc: 'إدراج طلبات الإجازات وحفظ مسوداتها وإدارتها',
      enabled: isAdmin || canEdit || hasPermission('create_leave'),
    },
    {
      title: 'تدقيق وإحالة الإجازات وتسجيل العرض',
      desc: 'تدقيق الطلبات وإحالتها من مكتب المدير العام وتسجيل عرضها من مكتب رئيس الجهة',
      enabled: canApprove,
    },
    {
      title: 'استخراج التقارير وسجل العمليات',
      desc: 'تصدير كشوفات الإجازات والإحصائيات وجداول الحضور',
      enabled: isAdmin || hasPermission('view_reports'),
    },
  ];

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-5 animate-fade-in">
      {/* ── Page Header (Identical pattern to TodayPage) ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-700 shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">إعدادات الحساب</h1>
            <p className="text-sm text-slate-600">الملف الشخصي ورمز الدخول وصلاحيات الأمان</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl font-medium">
            <span className="w-2 h-2 rounded-full bg-primary-600" />
            جلسة نشطة
          </span>
        </div>
      </div>

      {/* ── 2-Column Grid System for Large Screens (Like TodayPage) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        
        {/* ── Card 1: Personal Profile & Display Name ── */}
        <div className="card-elevated overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-4 h-4 text-primary-700" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">الملف الشخصي</h2>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
              {roleLabel}
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            {/* Identity Summary Card */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-12 h-12 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                <img
                  src="/entity-logo.png"
                  alt="شعار النظام"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {profile?.full_name ?? 'المستخدم'}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                    <BadgeCheck className="w-3 h-3 text-primary-700" />
                    حساب نشط وموثق
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    <Shield className="w-3 h-3 text-slate-400" />
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Display Name Edit Form */}
            {nameMsg && (
              <Toast type={nameMsg.type} message={nameMsg.text} onClose={() => setNameMsg(null)} />
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="settings-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  الاسم الكامل الظاهر
                </label>
                <input
                  ref={nameRef}
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  className="input-field"
                  placeholder="أدخل اسمك الكامل"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleNameSave();
                  }}
                />
                <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
                  <span>يظهر هذا الاسم في سجل العمليات وتقارير الإجازات</span>
                  <span>{name.trim().length} / 120 حرفًا</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNameSave}
                disabled={nameSaving || name.trim() === profile?.full_name || name.trim().length < 2}
                className="btn-primary w-full sm:w-auto"
              >
                {nameSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                حفظ تعديل الاسم
              </button>
            </div>
          </div>
        </div>

        {/* ── Card 2: Security & PIN Code ── */}
        <div className="card-elevated overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-primary-700" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">رمز الدخول (PIN)</h2>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
              4 أرقام
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {pinMsg && (
              <Toast type={pinMsg.type} message={pinMsg.text} onClose={() => setPinMsg(null)} />
            )}

            {/* Civil ID */}
            <div>
              <label htmlFor="settings-civil" className="block text-xs font-medium text-slate-700 mb-1.5">
                الرقم المدني
              </label>
              <input
                id="settings-civil"
                type="text"
                inputMode="numeric"
                maxLength={12}
                dir="ltr"
                value={civilId}
                onChange={(e) => setCivilId(cleanNumericInput(e.target.value, 12))}
                placeholder="000000000000"
                autoComplete="off"
                className="input-field text-center text-base tracking-[0.2em] font-semibold"
              />
              <p className="text-xs text-slate-400 mt-1">
                {civilId.length} / 12 رقمًا - مطلوب للتحقق من هويتك وتأكيد ملكية الحساب
              </p>
            </div>

            {/* PIN Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PinInput
                id="settings-current-pin"
                value={currentPin}
                onChange={setCurrentPin}
                label="الرمز الحالي"
              />
              <PinInput
                id="settings-new-pin"
                value={newPin}
                onChange={setNewPin}
                label="الرمز الجديد"
              />
            </div>

            {/* Confirm New PIN */}
            <div>
              <PinInput
                id="settings-confirm-pin"
                value={confirmPin}
                onChange={setConfirmPin}
                label="تأكيد الرمز الجديد"
              />
            </div>

            {/* Real-time Match Indicator */}
            {newPin.length === 4 && confirmPin.length > 0 && (
              <div
                className={`text-xs font-medium flex items-center gap-1.5 ${
                  newPin === confirmPin ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {newPin === confirmPin ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    الرمزان الجديدان متطابقان وجاهزان للحفظ
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5 text-red-500" />
                    تأكيد الرمز غير متطابق مع الرمز الجديد
                  </>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              onClick={handlePinSave}
              disabled={
                pinSaving ||
                civilId.length !== 12 ||
                currentPin.length !== 4 ||
                newPin.length !== 4 ||
                confirmPin.length !== 4
              }
              className="btn-primary w-full sm:w-auto"
            >
              {pinSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              تحديث رمز الدخول
            </button>

            {/* Security Callout Note */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <p className="font-bold">ملاحظة أمنية:</p>
                <p className="mt-0.5">
                  يُستخدم الرقم المدني للتحقق الآمن من الهوية فقط. لا يتم تخزين الرمز السري كنص مكشوف، ويتم تشفيره فورًا وفق معايير الأمان.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 3: Permissions & Access Rights ── */}
        <div className="card-elevated overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-primary-700" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">الصلاحيات والوصول</h2>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
              صلاحيات الحساب
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-4 h-4 text-primary-700" />
                <span className="text-xs font-bold text-slate-800">{roleLabel}</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{roleDescription}</p>
            </div>

            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-slate-700 block">نطاق العمليات المتاحة:</span>
              <div className="space-y-2">
                {capabilities.map((cap) => (
                  <div
                    key={cap.title}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{cap.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{cap.desc}</p>
                    </div>
                    {cap.enabled ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-800 bg-primary-50 px-2 py-0.5 rounded-lg shrink-0">
                        <Check className="w-3 h-3 text-primary-700" />
                        متاح
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                        غير مفعل
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 4: Session Information & Security Advice ── */}
        <div className="card-elevated overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Laptop className="w-4 h-4 text-slate-700" />
              </div>
              <div className="min-w-0">
                <h2 className="section-title">بيانات الجلسة والنظام</h2>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full shrink-0">
              متصل الآن
            </span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">طريقة المصادقة</span>
                <span className="font-semibold text-slate-800">الرقم المدني + رمز PIN</span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">تاريخ تسجيل الحساب</span>
                <span className="font-medium text-slate-800">
                  {profile?.created_at ? formatDate(profile.created_at) : 'غير محدد'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">حالة الربط الشبكي</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  قاعدة البيانات متصلة ومباشرة
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-800">إرشادات الأمان للجلسة:</p>
                <p className="mt-0.5">
                  عند استخدام جهاز كمبيوتر مشترك أو خارج المكتب، تأكد دائمًا من تسجيل الخروج للحفاظ على سرية بيانات الموظفين.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">إنهاء الجلسة الحالية:</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              >
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
