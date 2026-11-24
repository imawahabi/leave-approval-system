import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, UserRound } from 'lucide-react';
import { Modal } from './Modal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cleanNumericInput } from '@/utils/number';

export function AccountSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [civilId, setCivilId] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(profile?.full_name ?? '');
      setCivilId(''); setOldPin(''); setNewPin(''); setConfirmPin('');
      setMessage(''); setError('');
    }
  }, [open, profile?.full_name]);

  const saveName = async () => {
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 120) { setError('الاسم يجب أن يكون بين حرفين و120 حرفًا.'); return; }
    setBusy(true); setError(''); setMessage('');
    const { error: saveError } = await supabase.rpc('update_my_name', { p_full_name: clean });
    if (saveError) setError('تعذر حفظ الاسم. حاول مرة أخرى.');
    else { await refreshProfile(); setMessage('تم تحديث الاسم بنجاح.'); }
    setBusy(false);
  };

  const changePin = async () => {
    if (!/^\d{12}$/.test(civilId) || !/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) {
      setError('تحقق من الرقم المدني والرمزين قبل المتابعة.'); return;
    }
    if (newPin !== confirmPin || newPin === oldPin) { setError('الرمز الجديد يجب أن يختلف ويتطابق مع تأكيده.'); return; }
    setBusy(true); setError(''); setMessage('');
    const { data, error: saveError } = await supabase.functions.invoke('civil-auth', {
      body: { action: 'self-reset-pin', civilId, pin: oldPin, newPin },
    });
    if (saveError || !data?.success) setError(data?.error || 'تعذر تغيير الرمز. تحقق من البيانات وحاول مرة أخرى.');
    else {
      setCivilId(''); setOldPin(''); setNewPin(''); setConfirmPin('');
      setMessage('تم تغيير رمز الدخول بنجاح. استخدم الرمز الجديد في المرة القادمة.');
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="إعدادات حسابي" size="md">
      <div className="space-y-5" dir="rtl">
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</p>}
        {message && <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{message}</p>}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><UserRound className="w-4 h-4" />البيانات الشخصية</h3>
          <label className="block text-xs font-medium text-slate-600" htmlFor="my-name">الاسم الكامل</label>
          <input id="my-name" className="input-field" value={name} maxLength={120} onChange={e => setName(e.target.value)} autoComplete="name" />
          <button type="button" className="btn-primary" disabled={busy || name.trim() === profile?.full_name} onClick={saveName}>حفظ الاسم</button>
        </section>
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound className="w-4 h-4" />تغيير رمز الدخول</h3>
          <p className="text-xs text-slate-500">أدخل رقمك المدني ورمزك الحالي للتحقق من ملكية الحساب.</p>
          <label className="block text-xs font-medium text-slate-600" htmlFor="my-civil">الرقم المدني</label>
          <input id="my-civil" className="input-field" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={12} value={civilId} onChange={e => setCivilId(cleanNumericInput(e.target.value, 12))} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'my-old-pin', label: 'الرمز الحالي', value: oldPin, set: setOldPin },
              { id: 'my-new-pin', label: 'الرمز الجديد', value: newPin, set: setNewPin },
              { id: 'my-confirm-pin', label: 'تأكيد الجديد', value: confirmPin, set: setConfirmPin },
            ].map(field => <div key={field.id}><label className="block text-xs font-medium text-slate-600 mb-1" htmlFor={field.id}>{field.label}</label><input id={field.id} type="password" className="input-field text-center" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={4} value={field.value} onChange={e => field.set(cleanNumericInput(e.target.value, 4))} /></div>)}
          </div>
          <button type="button" className="btn-primary" disabled={busy || civilId.length !== 12 || oldPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4} onClick={changePin}>تغيير الرمز</button>
        </section>
      </div>
    </Modal>
  );
}
