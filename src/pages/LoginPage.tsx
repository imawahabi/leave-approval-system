import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ShieldCheck, AlertCircle, Loader2, Delete,
  UserCircle2, CreditCard, KeyRound, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cleanNumericInput } from '@/utils/number';

/* ─────────────────────────────────────────────────
   PIN BOXES  (4 individual square inputs)
───────────────────────────────────────────────── */
function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const r0 = useRef<HTMLInputElement>(null);
  const r1 = useRef<HTMLInputElement>(null);
  const r2 = useRef<HTMLInputElement>(null);
  const r3 = useRef<HTMLInputElement>(null);
  const refs = [r0, r1, r2, r3];
  const digits = value.padEnd(4, '').split('').slice(0, 4);

  useEffect(() => {
    // Keep desktop keyboard entry continuous across the civil-ID → PIN step,
    // without forcing the mobile virtual keyboard open on touch devices.
    if (window.matchMedia('(pointer: fine)').matches) {
      window.requestAnimationFrame(() => r0.current?.focus());
    }
  }, []);

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const trimmed = value.length > 0 ? value.slice(0, -1) : '';
      onChange(trimmed);
      const target = idx > 0 && value.length <= idx ? idx - 1 : idx;
      setTimeout(() => refs[target]?.current?.focus(), 0);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = cleanNumericInput(e.clipboardData.getData('text'), 4);
    if (pasted) {
      onChange(pasted);
      const nextIdx = Math.min(pasted.length, 3);
      refs[nextIdx]?.current?.focus();
    }
  };

  const handleChange = (idx: number, raw: string) => {
    const d = cleanNumericInput(raw);
    if (!d) return;
    if (d.length > 1) {
      const combined = cleanNumericInput(value.slice(0, idx) + d, 4);
      onChange(combined);
      const nextIdx = Math.min(combined.length, 3);
      refs[nextIdx]?.current?.focus();
      return;
    }
    const ch = d[d.length - 1];
    const next = (value.slice(0, idx) + ch + value.slice(idx + 1)).slice(0, 4);
    onChange(next);
    if (idx < 3) setTimeout(() => refs[idx + 1]?.current?.focus(), 0);
  };

  return (
    <div className="flex gap-3 justify-center" dir="ltr">
      {refs.map((ref, i) => (
        <input
          key={i}
          ref={ref}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] && digits[i] !== ' ' ? '•' : ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className={`
            w-14 h-14 rounded-2xl border-2 text-center text-3xl font-black
            transition-all outline-none select-none
            ${digits[i] && digits[i] !== ' '
              ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
            }
            focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15
            disabled:opacity-40 disabled:cursor-not-allowed
          `}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   NUMPAD
───────────────────────────────────────────────── */
function NumPad({
  onPress,
  onDelete,
  disabled,
}: {
  onPress: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div className="grid grid-cols-3 gap-2 mt-5" dir="ltr">
      {keys.map((k, i) =>
        k === '' ? (
          <div key={i} />
        ) : k === '⌫' ? (
          <button
            key={i}
            type="button"
            aria-label="حذف الرقم الأخير"
            disabled={disabled}
            onClick={onDelete}
            className="h-12 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all flex items-center justify-center text-slate-500 disabled:opacity-30"
          >
            <Delete className="w-5 h-5" />
          </button>
        ) : (
          <button
            key={i}
            type="button"
            aria-label={`الرقم ${k}`}
            disabled={disabled}
            onClick={() => onPress(k)}
            className="h-12 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border hover:border-teal-200 active:scale-95 transition-all text-lg font-bold text-slate-800 disabled:opacity-30"
          >
            {k}
          </button>
        ),
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   STEP INDICATOR
   login : steps 1-2   (civil-id → pin)
   invite: steps 1-3   (name → civil-id → pin)
───────────────────────────────────────────────── */
function StepBar({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => {
        const s = i + 1;
        const done = s < current;
        const active = s === current;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${done ? 'bg-teal-600 text-white' : active ? 'bg-teal-600 text-white ring-4 ring-teal-100' : 'bg-slate-200 text-slate-400'}
              `}
            >
              {done ? <ShieldCheck className="w-3.5 h-3.5" /> : s}
            </div>
            {s < total && (
              <div className={`w-6 h-0.5 rounded-full transition-all ${current > s ? 'bg-teal-500' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
      <span className="mr-2 text-[11px] text-slate-400 font-medium">
        {labels[current - 1]}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   CIVIL ID INPUT WITH PROGRESS BAR
───────────────────────────────────────────────── */
function CivilIdInput({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handle = (raw: string) => {
    const cleaned = cleanNumericInput(raw, 12);
    onChange(cleaned);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={12}
        dir="rtl"
        value={value}
        onChange={(e) => handle(e.target.value)}
        placeholder="000000000000"
        autoComplete="off"
        onKeyDown={(e) => { if (e.key === 'Enter' && value.length === 12) onNext(); }}
        className={`
          input-field text-center text-2xl tracking-[0.3em] font-bold transition-all
          ${value.length === 12 ? 'border-teal-500 bg-teal-50/60 text-teal-800' : ''}
        `}
      />
      {/* 12-segment progress bar */}
      <div className="flex gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-150 ${i < value.length ? 'bg-teal-500' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">
        {value.length === 12
          ? <span className="text-teal-600 font-semibold">✓ اكتمل الرقم المدني</span>
          : <>{value.length} / 12 رقم</>}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   LEFT BRANDING PANEL  (desktop only)
───────────────────────────────────────────────── */
function BrandPanel({ isInvite }: { isInvite: boolean }) {
  return (
    <div className="hidden lg:flex lg:w-[44%] bg-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden shrink-0">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-teal-700/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-xs">
        <div className="w-32 h-32 rounded-2xl bg-white backdrop-blur-sm shadow-2xl flex items-center justify-center mb-8">
          <img
            src="/entity-logo.png"
            alt="شعار الجهة"
            className="w-24 h-24 object-contain drop-shadow-lg"
          />
        </div>

        <h1 className="text-3xl font-extrabold text-white leading-snug">
          {isInvite ? 'إنشاء حساب جديد' : 'نظام إدارة واعتماد الإجازات'}
        </h1>
        <p className="text-teal-300 text-sm font-medium mt-2">
          الجهة الحكومية
        </p>

        {!isInvite && (
          <p className="text-slate-400 text-sm leading-7 mt-8">
            متابعة تواجد الموظفين وإجازاتهم في مكان واحد
          </p>
        )}

        {isInvite && (
          <div className="mt-8 space-y-2 text-right w-full">
            {[
              { icon: <UserCircle2 className="w-4 h-4 text-teal-400" />, text: 'أدخل اسمك الكامل' },
              { icon: <CreditCard className="w-4 h-4 text-teal-400" />, text: 'أدخل رقمك المدني (12 رقمًا)' },
              { icon: <KeyRound className="w-4 h-4 text-teal-400" />, text: 'اختر رمز دخول من 4 أرقام' },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-xl px-4 py-2.5">
                {row.icon}
                <span className="text-sm text-slate-300">{row.text}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   MAIN LOGIN PAGE
───────────────────────────────────────────────── */
export function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const inviteToken = location.pathname.startsWith('/invite/')
    ? location.pathname.split('/')[2]
    : null;
  const isInvite = !!inviteToken;

  /* Shared state */
  const [fullName, setFullName] = useState('');
  const [civilId, setCivilId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  /* step:
     Login  → 1 = civil-id,  2 = pin
     Invite → 1 = name,      2 = civil-id,  3 = pin  */
  const [step, setStep] = useState(1);

  const stepLabels = isInvite
    ? ['الاسم الكامل', 'الرقم المدني', 'رمز الدخول']
    : ['الرقم المدني', 'رمز الدخول'];
  const totalSteps = isInvite ? 3 : 2;

  const clearError = () => setError(null);

  /* ── validation helpers ── */
  const validateName = () => {
    if (fullName.trim().length < 2) { setError('أدخل اسمك الكامل'); return false; }
    return true;
  };
  const validateCivilId = () => {
    if (!/^\d{12}$/.test(civilId)) { setError('الرقم المدني يجب أن يكون 12 رقمًا فقط'); return false; }
    return true;
  };

  /* ── navigation ── */
  const goNext = () => {
    clearError();
    if (isInvite) {
      if (step === 1 && !validateName()) return;
      if (step === 2 && !validateCivilId()) return;
    } else {
      if (step === 1 && !validateCivilId()) return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    clearError();
    setPin('');
    setStep((s) => s - 1);
  };

  /* ── auto-advance civil-id → pin ── */
  const civilIdStep = isInvite ? 2 : 1;
  useEffect(() => {
    if (civilId.length === 12 && step === civilIdStep) {
      setTimeout(() => { clearError(); setStep((s) => s + 1); }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [civilId]);

  /* ── auto-submit on 4th PIN digit ── */
  useEffect(() => {
    const pinStep = isInvite ? 3 : 2;
    if (pin.length === 4 && step === pinStep && !loading) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  /* ── submit ── */
  const handleSubmit = async () => {
    clearError();
    if (!validateCivilId()) return;
    if (!/^\d{4}$/.test(pin)) { setError('رمز الدخول يجب أن يكون 4 أرقام'); return; }

    setLoading(true);

    const sanitizedCivilId = cleanNumericInput(civilId, 12);
    const sanitizedPin = cleanNumericInput(pin, 4);

    if (isInvite) {
      const { data, error: regErr } = await supabase.functions.invoke('civil-auth', {
        body: { action: 'register', token: inviteToken, civilId: sanitizedCivilId, pin: sanitizedPin, fullName: fullName.trim() },
      });
      setLoading(false);
      if (regErr || !data?.success) {
        setError(data?.error || 'تعذر إنشاء الحساب. اطلب رابطًا جديدًا من المدير.');
        setPin('');
      } else {
        setRegistered(true);
      }
      return;
    }

    const result = await signIn(sanitizedCivilId, sanitizedPin);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setPin('');
    }
  };

  /* ── pin helpers ── */
  const appendPin = (d: string) => {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setPin((p) => p.length < 4 ? p + d : p);
  };
  const deletePin = () => {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setPin((p) => p.slice(0, -1));
  };

  /* ── success screen (invite) ── */
  if (registered) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-10 max-w-sm w-full text-center space-y-5 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">تم إنشاء الحساب بنجاح!</h2>
            <p className="text-sm text-slate-500 mt-2 leading-6">
              يمكنك الآن تسجيل الدخول باستخدام رقمك المدني ورمز الدخول الذي اخترته.
            </p>
          </div>
          <button
            className="btn-primary w-full justify-center"
            onClick={() => { window.history.replaceState({}, '', '/login'); setRegistered(false); setStep(1); setCivilId(''); setPin(''); setFullName(''); }}
          >
            الانتقال لتسجيل الدخول
          </button>
        </div>
      </main>
    );
  }

  /* ── decide which content to render per step ── */
  const pinStep = isInvite ? 3 : 2;
  const isPinStep = step === pinStep;

  return (
    <main className="min-h-screen flex items-stretch" dir="rtl">

      {/* ── Branding panel ── */}
      <BrandPanel isInvite={isInvite} />

      {/* ── Form panel ── */}
      <div className="flex-1 bg-slate-50 flex flex-col items-center justify-center p-5 sm:p-10 overflow-y-auto">

        {/* Mobile logo */}
        <div className="flex lg:hidden flex-col items-center mb-7">
          <div className="w-20 h-20 rounded-2xl bg-white shadow flex items-center justify-center mb-3 overflow-hidden">
            <img src="/entity-logo.png" alt="الشعار" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">
            {isInvite ? 'إنشاء حساب جديد' : 'نظام إدارة واعتماد الإجازات'}
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">الجهة الحكومية</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8">

            <StepBar current={step} total={totalSteps} labels={stepLabels} />

            {/* ───── INVITE STEP 1: Full Name ───── */}
            {isInvite && step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                    <UserCircle2 className="w-6 h-6 text-teal-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">الاسم الكامل</h2>
                  <p className="text-xs text-slate-400 mt-1">أدخل اسمك الرباعي كما في الهوية</p>
                </div>

                <input
                  autoFocus
                  type="text"
                  className="input-field text-center text-base font-semibold"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); clearError(); }}
                  placeholder="الاسم الكامل"
                  maxLength={120}
                  onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
                />

                <button
                  type="button"
                  disabled={fullName.trim().length < 2}
                  onClick={goNext}
                  className="btn-primary w-full justify-center"
                >
                  التالي
                </button>
              </div>
            )}

            {/* ───── CIVIL ID STEP ───── */}
            {step === civilIdStep && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                    <CreditCard className="w-6 h-6 text-teal-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">الرقم المدني</h2>
                </div>

                <CivilIdInput
                  value={civilId}
                  onChange={(v) => { setCivilId(v); clearError(); }}
                  onNext={goNext}
                />

                <div className="flex gap-2">
                  {isInvite && (
                    <button type="button" onClick={goBack} className="btn-secondary flex-1 justify-center">
                      → رجوع
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={civilId.length !== 12}
                    onClick={goNext}
                    className="btn-primary flex-1 justify-center"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}

            {/* ───── PIN STEP ───── */}
            {isPinStep && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="w-6 h-6 text-teal-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {isInvite ? 'اختر رمز الدخول' : 'رمز الدخول'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {isInvite
                      ? 'أنشئ رمزًا من 4 أرقام - احتفظ به'
                      : 'أدخل رمزك المكوّن من 4 أرقام'}
                  </p>
                  <button
                    type="button"
                    onClick={goBack}
                    className="text-xs text-teal-600 hover:text-teal-800 mt-1.5 underline underline-offset-2"
                  >
                    تغيير الرقم المدني
                  </button>
                </div>

                <PinInput value={pin} onChange={setPin} disabled={loading} />

                <NumPad onPress={appendPin} onDelete={deletePin} disabled={loading} />

                <button
                  type="button"
                  disabled={pin.length !== 4 || loading}
                  onClick={handleSubmit}
                  className="btn-primary w-full justify-center mt-1"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {isInvite ? 'جارٍ إنشاء الحساب...' : 'جارٍ التحقق من الرمز...'}</>
                    : isInvite ? 'إنشاء الحساب' : 'دخول'}
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
