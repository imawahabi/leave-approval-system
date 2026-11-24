import { useCallback, useEffect, useState } from 'react';
import {
  Clipboard, KeyRound, Link2, Pencil, Search, ShieldCheck, UserCog,
  UserPlus, CheckCircle2, AlertCircle, X, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/Badge';
import { AccessGrantBuilder } from '@/components/admin/AccessGrantBuilder';
import { accountTypeConfig } from '@/constants';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import { cleanNumericInput } from '@/utils/number';
import type { AccountType, PermissionGrantDraft, Profile } from '@/types';

const accountTypes: AccountType[] = ['user', 'approver', 'admin'];
const toHex = (array: Uint8Array) => Array.from(array, (value) => value.toString(16).padStart(2, '0')).join('');

type OrgOption = { id: string; name_ar: string };

const profileAccountType = (profile: Profile): AccountType => profile.account_type
  ?? (profile.role === 'admin' ? 'admin' : profile.role === 'approver' ? 'approver' : 'user');

export function AdminUsersPage() {
  const { isAdmin, user, refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [assistants, setAssistants] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [inviteAccountType, setInviteAccountType] = useState<AccountType>('user');
  const [inviteGrants, setInviteGrants] = useState<PermissionGrantDraft[]>([]);
  const [issuedInviteAccountType, setIssuedInviteAccountType] = useState<AccountType>('user');
  const [adminInviteConfirmOpen, setAdminInviteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /* ── Quick User Creation ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCivilId, setCreateCivilId] = useState('');
  const [createPin, setCreatePin] = useState('');
  const [createConfirmPin, setCreateConfirmPin] = useState('');
  const [createAccountType, setCreateAccountType] = useState<AccountType>('user');
  const [createGrants, setCreateGrants] = useState<PermissionGrantDraft[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* ── Bootstrap admin civil credential ── */
  const [civilId, setCivilId] = useState('');
  const [pin, setPin] = useState('');
  const [bootstrapDone, setBootstrapDone] = useState(false);

  /* ── Edit profile modal ── */
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editAccountType, setEditAccountType] = useState<AccountType>('user');
  const [editGrants, setEditGrants] = useState<PermissionGrantDraft[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);

  /* ── Reset PIN modal ── */
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  /* ── Filter / Search ── */
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const result = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (result.error) setError(result.error.message);
    else setProfiles(result.data as Profile[]);
    setLoading(false);
  }, []);

  const fetchOrganization = useCallback(async () => {
    const [sectorResult, departmentResult, assistantResult] = await Promise.all([
      supabase.from('sectors').select('id,name_ar').eq('is_active', true).order('sort_order').order('name_ar'),
      supabase.from('departments').select('id,name_ar').order('sort_order').order('name_ar'),
      supabase.from('assistant_undersecretaries').select('id,name_ar').eq('is_active', true).order('sort_order').order('name_ar'),
    ]);
    if (!sectorResult.error) setSectors((sectorResult.data || []) as OrgOption[]);
    if (!departmentResult.error) setDepartments((departmentResult.data || []) as OrgOption[]);
    if (!assistantResult.error) setAssistants((assistantResult.data || []) as OrgOption[]);
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchOrganization();
  }, [fetchProfiles, fetchOrganization]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.rpc('has_my_civil_credential').then(({ data }) => {
      if (data === true) setBootstrapDone(true);
    });
  }, [isAdmin]);

  /* ── Create Invite Link ── */
  const createInvite = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setInviteLink('');
    setCopyStatus('');
    try {
      const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
      const { data, error } = await supabase.rpc('create_registration_invite', {
        p_token_hash: tokenHash,
        p_account_type: inviteAccountType,
        p_grants: inviteGrants,
      });
      if (error?.code === 'PGRST202') {
        setActionError('إنشاء الدعوات بصلاحيات مخصصة لم يُفعّل في قاعدة البيانات بعد. يلزم تحديث قاعدة البيانات بواسطة مدير النظام.');
        return;
      }
      if (error || !data) throw error || new Error('Missing expiry');
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setIssuedInviteAccountType(inviteAccountType);
      setInviteExpiry(new Date(data).toLocaleString('ar-KW', { timeZone: 'Asia/Kuwait' }));
    } catch {
      setActionError('تعذر إنشاء رابط الدعوة. حاول مجددًا.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Quick Create User ── */
  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const cleanName = createName.trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      setCreateError('الاسم الكامل يجب أن يكون بين حرفين و120 حرفًا.');
      return;
    }
    if (!/^\d{12}$/.test(createCivilId)) {
      setCreateError('الرقم المدني يجب أن يتكون من 12 رقمًا فقط.');
      return;
    }
    if (!/^\d{4}$/.test(createPin)) {
      setCreateError('رمز الدخول يجب أن يتكون من 4 أرقام.');
      return;
    }
    if (createPin !== createConfirmPin) {
      setCreateError('تأكيد الرمز لا يطابق رمز الدخول.');
      return;
    }
    if (createAccountType !== 'admin' && !createGrants.length) {
      setCreateError('حدد صلاحية واحدة على الأقل للحساب الجديد.');
      return;
    }

    setCreateBusy(true);
    try {
      const { data: regData, error: regError } = await supabase.functions.invoke('civil-auth', {
        body: {
          action: 'admin-create-user',
          civilId: createCivilId,
          pin: createPin,
          fullName: cleanName,
          accountType: createAccountType,
          grants: createGrants,
        },
      });

      if (regError || !regData?.success) {
        setCreateError(regData?.error || 'تعذر إنشاء الحساب. تأكد من أن الرقم المدني غير مسجل مسبقًا.');
        setCreateBusy(false);
        return;
      }

      setSuccess(`تم إنشاء حساب "${cleanName}" بنوع (${accountTypeConfig[createAccountType].label}) وتخصيص صلاحياته بنجاح. يمكنه الآن تسجيل الدخول بالرقم المدني ورمز الدخول.`);
      setCreateOpen(false);
      setCreateName('');
      setCreateCivilId('');
      setCreatePin('');
      setCreateConfirmPin('');
      setCreateAccountType('user');
      setCreateGrants([]);
      await fetchProfiles();
    } catch (err) {
      console.error('Quick create user failed:', err);
      setCreateError('حدث خطأ غير متوقع أثناء إنشاء المستخدم. حاول مرة أخرى.');
    } finally {
      setCreateBusy(false);
    }
  };

  /* ── Edit profile ── */
  const openEdit = async (profile: Profile) => {
    setEditTarget(profile);
    setEditName(profile.full_name ?? '');
    setEditAccountType(profileAccountType(profile));
    setEditGrants([]);
    setEditActive(profile.is_active);
    setActionError(null);
    setSuccess(null);
    setEditLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_user_permissions', { p_user_id: profile.id });
      if (error) {
        setActionError('تعذر تحميل صلاحيات المستخدم الحالية.');
        return;
      }
      const nextGrants = (data || []).map((grant: { permission_code: PermissionGrantDraft['permission_code']; scope_kind: PermissionGrantDraft['scope_kind']; scope_id: string | null }) => ({
        permission_code: grant.permission_code,
        scope_kind: grant.scope_kind,
        scope_id: grant.scope_id,
      })) as PermissionGrantDraft[];
      setEditGrants(profileAccountType(profile) === 'admin' ? [] : nextGrants);
    } finally {
      setEditLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!editTarget || actionBusy) return;
    setActionError(null);
    const cleanName = editName.trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      setActionError('اكتب اسمًا من 2 إلى 120 حرفًا.');
      return;
    }
    setActionBusy(true);
    const isSelf = editTarget.id === user?.id;
    const { error } = await supabase.rpc('admin_replace_user_access', {
      p_user_id: editTarget.id,
      p_account_type: editAccountType,
      p_grants: editGrants,
      p_full_name: cleanName,
      p_is_active: isSelf ? editTarget.is_active : editActive,
    });

    if (error) {
      setActionError('تعذر حفظ بيانات المستخدم. تحقق من الصلاحيات وحاول مجددًا.');
    } else {
      setEditTarget(null);
      setSuccess('تم تحديث بيانات المستخدم وصلاحياته بنجاح.');
      if (isSelf) void refreshProfile();
      void fetchProfiles();
    }
    setActionBusy(false);
  };

  /* ── Reset PIN ── */
  const resetUserPin = async () => {
    if (!resetTarget || actionBusy) return;
    setActionError(null);
    if (!/^\d{4}$/.test(newPin)) {
      setActionError('أدخل رمزًا جديدًا من 4 أرقام.');
      return;
    }
    if (newPin !== confirmPin) {
      setActionError('تأكيد الرمز لا يطابق الرمز الجديد.');
      return;
    }
    setActionBusy(true);
    const { data, error } = await supabase.functions.invoke('civil-auth', {
      body: { action: 'admin-reset-pin', targetUserId: resetTarget.id, pin: newPin },
    });
    if (error || !data?.success) {
      setActionError(data?.error || 'تعذر تغيير الرمز. حاول مرة أخرى.');
    } else {
      setResetTarget(null);
      setNewPin('');
      setConfirmPin('');
      setSuccess('تم تغيير رمز الدخول بنجاح. أبلغ المستخدم بالرمز الجديد.');
    }
    setActionBusy(false);
  };

  /* ── Setup Admin Civil Credential ── */
  const setupAdmin = async () => {
    setActionError(null);
    if (!/^\d{12}$/.test(civilId) || !/^\d{4}$/.test(pin)) {
      setActionError('أدخل رقمًا مدنيًا من ١٢ رقمًا ورمزًا من ٤ أرقام');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('civil-auth', {
      body: { action: 'setup-admin', civilId, pin },
    });
    if (error || !data?.success) {
      setActionError(data?.error || 'تعذر تهيئة دخول المدير');
    } else {
      setBootstrapDone(true);
      setCivilId('');
      setPin('');
    }
    setBusy(false);
  };

  const visibleProfiles = profiles.filter((profile) => {
    const accountType = profileAccountType(profile);
    const matchesSearch = !search.trim() || arabicSearchMatches([profile.full_name, accountTypeConfig[accountType].label], search);
    const matchesAccount = !accountFilter || accountType === accountFilter;
    return matchesSearch && matchesAccount;
  });

  if (!isAdmin) return <ErrorState message="لا تملك صلاحية إدارة المستخدمين" />;
  if (error) return <ErrorState message={error} onRetry={fetchProfiles} />;

  return (
    <div className="animate-fade-in space-y-5 pb-12">
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle="إدارة حسابات النظام وإنشاء المستخدمين وتعيين الصلاحيات"
        icon={<UserCog className="w-5 h-5" />}
        actions={
          <button className="btn-primary flex items-center gap-1.5" onClick={() => { setCreateOpen(true); setCreateError(null); }}>
            <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">إنشاء مستخدم</span>
          </button>
        }
      />

      <section className="card p-4 sm:p-5 space-y-3" aria-labelledby="invite-heading">
        <div><h2 id="invite-heading" className="font-bold text-slate-900">دعوة مستخدم برابط</h2><p className="text-xs text-slate-500 mt-1">رابط فريد صالح للاستخدام مرة واحدة خلال 48 ساعة. حدّد نوع الحساب وصلاحياته قبل إنشائه.</p></div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <label className="text-xs font-medium text-slate-600 sm:w-48" htmlFor="invite-account-type">نوع الحساب الجديد
            <select id="invite-account-type" className="input-field mt-1" value={inviteAccountType} onChange={(event) => { setInviteAccountType(event.target.value as AccountType); setInviteGrants([]); }}>
              {accountTypes.map((type) => <option key={type} value={type}>{accountTypeConfig[type].label}</option>)}
            </select>
          </label>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => inviteAccountType === 'admin' ? setAdminInviteConfirmOpen(true) : void createInvite()} disabled={busy || (inviteAccountType !== 'admin' && !inviteGrants.length)}>
            <Link2 className="w-4 h-4" />{busy ? 'جارٍ الإنشاء…' : `إنشاء رابط ${accountTypeConfig[inviteAccountType].label}`}
          </button>
        </div>
        <AccessGrantBuilder
          accountType={inviteAccountType}
          grants={inviteGrants}
          onChange={setInviteGrants}
          sectors={sectors}
          departments={departments}
          assistants={assistants}
          disabled={busy}
        />
      </section>

      {/* Invite link alert if generated */}
      {inviteLink && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/90 p-4 space-y-2.5 animate-fade-in shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-teal-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              تم إنشاء رابط الدعوة بنجاح
            </h3>
            <button onClick={() => setInviteLink('')} className="text-xs text-teal-600 hover:text-teal-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-teal-800">
            الرابط بنوع حساب «{accountTypeConfig[issuedInviteAccountType].label}» وصالح لمدة ٤٨ ساعة حتى {inviteExpiry}. أرسله للمستخدم المراد انضمامه.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              dir="ltr"
              value={inviteLink}
              className="input-field text-left text-xs flex-1 bg-white font-mono"
              aria-label="رابط الدعوة"
            />
            <button
              className="btn-primary text-xs py-2 px-3 bg-teal-700 hover:bg-teal-800"
              onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); setCopyStatus('تم نسخ الرابط.'); } catch { setCopyStatus('تعذر النسخ. انسخ الرابط من الحقل.'); } }}
            >
              <Clipboard className="w-4 h-4" /> نسخ الرابط
            </button>
          </div>
          {copyStatus && <p role="status" aria-live="polite" className="text-xs text-teal-800">{copyStatus}</p>}
        </div>
      )}

      {/* Admin Civil Credential Setup Alert */}
      {user && !bootstrapDone && (
        <section className="card p-5 space-y-3 border-amber-200 bg-amber-50/40" aria-labelledby="bootstrap-heading">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-700" />
            <h2 id="bootstrap-heading" className="font-bold text-slate-900">
              تفعيل الدخول بالرقم المدني لحساب المدير الحالي
            </h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            نفّذ هذه الخطوة لتتمكن من تسجيل الدخول بالنظام الجديد (الرقم المدني + الرمز المكون من 4 أرقام).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <label className="text-sm font-medium text-slate-700">
              الرقم المدني (12 رقمًا)
              <input
                className="input-field mt-1.5"
                dir="ltr"
                inputMode="numeric"
                maxLength={12}
                value={civilId}
                onChange={(e) => setCivilId(cleanNumericInput(e.target.value, 12))}
                placeholder="298010101234"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              رمز الدخول (٤ أرقام)
              <input
                type="password"
                className="input-field mt-1.5"
                dir="ltr"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(cleanNumericInput(e.target.value, 4))}
                placeholder="••••"
              />
            </label>
          </div>
          <button className="btn-primary bg-amber-600 hover:bg-amber-700" onClick={setupAdmin} disabled={busy}>
            {busy ? 'جارٍ التفعيل...' : 'تفعيل دخول المدير بالرقم المدني'}
          </button>
        </section>
      )}

      {/* Status Notifications */}
      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 p-4 text-sm flex items-center justify-between gap-3 border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div role="status" className="rounded-xl bg-emerald-50 text-emerald-800 p-4 text-sm flex items-center justify-between gap-3 border border-emerald-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Accounts List Section */}
      <section className="card overflow-hidden" aria-label="قائمة المستخدمين">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-900 text-base">حسابات المستخدمين</h2>
            <p className="text-xs text-slate-500 mt-0.5">عدد المستخدمين المسجلين: {profiles.length}</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {/* Account type filter */}
            <select
              className="input-field text-xs sm:w-40"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="">كل أنواع الحسابات</option>
              {accountTypes.map((type) => (
                <option key={type} value={type}>{accountTypeConfig[type].label}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="input-field pr-10 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم المستخدم أو الصلاحية…"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : visibleProfiles.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            لا يوجد مستخدم مطابق لمعايير البحث الحالية.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 shrink-0 text-sm">
                    {profile.full_name?.charAt(0) ?? '؟'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 truncate text-sm">
                        {profile.full_name || 'مستخدم بدون اسم'}
                      </p>
                      {profile.id === user?.id && (
                        <span className="text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                          حسابك الحالي
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        label={accountTypeConfig[profileAccountType(profile)].label}
                        color={accountTypeConfig[profileAccountType(profile)].color}
                        bg={accountTypeConfig[profileAccountType(profile)].bg}
                      />
                      <span className="text-slate-300">·</span>
                      <span className={`text-xs ${profile.is_active ? 'text-emerald-700' : 'text-red-600 font-medium'}`}>
                        {profile.is_active ? 'نشط' : 'موقوف'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 mr-13 sm:mr-0">
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    onClick={() => openEdit(profile)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                    <span>تعديل البيانات</span>
                  </button>
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    onClick={() => {
                      setResetTarget(profile);
                      setNewPin('');
                      setConfirmPin('');
                      setActionError(null);
                      setSuccess(null);
                    }}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    <span>تغيير الرمز</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════
          MODAL: QUICK CREATE USER (إنشاء سريع)
      ════════════════════════════════════════════════════ */}
      <Modal
        open={createOpen}
        onClose={() => {
          if (!createBusy) {
            setCreateOpen(false);
            setCreateError(null);
          }
        }}
        title="إنشاء مستخدم جديد (إنشاء سريع)"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              className="btn-secondary"
              disabled={createBusy}
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                createBusy ||
                createName.trim().length < 2 ||
                createCivilId.length !== 12 ||
                createPin.length !== 4 ||
                createPin !== createConfirmPin ||
                (createAccountType !== 'admin' && !createGrants.length)
              }
              onClick={handleQuickCreate}
            >
              {createBusy ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب الآن'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleQuickCreate} className="space-y-4">
          <p className="text-xs text-slate-500">
            أدخل بيانات المستخدم لتسجيل حسابه مباشرة في النظام دون الحاجة لروابط دعوة.
          </p>

          {createError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 p-3 text-xs flex items-center gap-2 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="create-name">
              الاسم الكامل <span className="text-red-500">*</span>
            </label>
            <input
              id="create-name"
              type="text"
              required
              className="input-field"
              placeholder="مثال: عبدالله محمد الأحمد"
              value={createName}
              maxLength={120}
              onChange={(e) => setCreateName(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Civil ID (12 digits) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="create-civil-id">
                الرقم المدني (12 رقمًا) <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs font-mono ${createCivilId.length === 12 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                {createCivilId.length} / 12 رقم
              </span>
            </div>
            <input
              id="create-civil-id"
              type="text"
              required
              inputMode="numeric"
              dir="ltr"
              maxLength={12}
              className={`input-field font-mono tracking-wider ${
                createCivilId.length === 12 ? 'border-emerald-500 focus:ring-emerald-500' : ''
              }`}
              placeholder="298010101234"
              value={createCivilId}
              onChange={(e) => setCreateCivilId(cleanNumericInput(e.target.value, 12))}
              autoComplete="off"
            />
          </div>

          {/* PIN & Confirm PIN (4 digits) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="create-pin">
                  رمز الدخول (4 أرقام) <span className="text-red-500">*</span>
                </label>
                <span className={`text-xs font-mono ${createPin.length === 4 ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                  {createPin.length} / 4
                </span>
              </div>
              <input
                id="create-pin"
                type="password"
                required
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                className="input-field text-center font-mono tracking-widest text-base"
                placeholder="••••"
                value={createPin}
                onChange={(e) => setCreatePin(cleanNumericInput(e.target.value, 4))}
                autoComplete="new-password"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="create-confirm-pin">
                  تأكيد الرمز <span className="text-red-500">*</span>
                </label>
                {createConfirmPin && (
                  <span className={`text-xs ${createPin === createConfirmPin ? 'text-emerald-600 font-bold' : 'text-red-500'}`}>
                    {createPin === createConfirmPin ? 'متطابق ✓' : 'غير متطابق'}
                  </span>
                )}
              </div>
              <input
                id="create-confirm-pin"
                type="password"
                required
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                className={`input-field text-center font-mono tracking-widest text-base ${
                  createConfirmPin && createPin === createConfirmPin ? 'border-emerald-500' : ''
                }`}
                placeholder="••••"
                value={createConfirmPin}
                onChange={(e) => setCreateConfirmPin(cleanNumericInput(e.target.value, 4))}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Integrated account type and access selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">نوع الحساب والصلاحيات</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {accountTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setCreateAccountType(type); setCreateGrants([]); }}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                    createAccountType === type
                      ? 'border-teal-600 bg-teal-50/70 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm text-slate-900">{accountTypeConfig[type].label}</span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      createAccountType === type ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300'
                    }`}>
                      {createAccountType === type && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1">{accountTypeConfig[type].description}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <AccessGrantBuilder
                accountType={createAccountType}
                grants={createGrants}
                onChange={setCreateGrants}
                sectors={sectors}
                departments={departments}
                assistants={assistants}
                disabled={createBusy}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: EDIT USER ROLE ── */}
      <Modal
        open={!!editTarget}
        onClose={() => {
          if (!actionBusy) {
            setEditTarget(null);
            setActionError(null);
          }
        }}
        title="تعديل بيانات وصلاحيات المستخدم"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button className="btn-secondary" disabled={actionBusy} onClick={() => setEditTarget(null)}>
              إلغاء
            </button>
            <button className="btn-primary" disabled={actionBusy || editLoading} onClick={updateProfile}>
              {editLoading ? 'جارٍ تحميل الصلاحيات…' : actionBusy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">اسم المستخدم</label>
            <input
              className="input-field"
              value={editName}
              maxLength={120}
              onChange={(e) => setEditName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">نوع الحساب</label>
            <select
              className="input-field"
              value={editAccountType}
              disabled={editLoading || editTarget?.id === user?.id}
              onChange={(e) => { setEditAccountType(e.target.value as AccountType); setEditGrants([]); }}
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>{accountTypeConfig[type].label}</option>
              ))}
            </select>
          </div>

          <AccessGrantBuilder
            accountType={editAccountType}
            grants={editGrants}
            onChange={setEditGrants}
            sectors={sectors}
            departments={departments}
            assistants={assistants}
            disabled={actionBusy || editLoading || editTarget?.id === user?.id}
          />

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 pt-1">
            <input
              type="checkbox"
              checked={editActive}
              disabled={editLoading || editTarget?.id === user?.id}
              onChange={(e) => setEditActive(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
            />
            <span>الحساب نشط ويُسمح له بتسجيل الدخول</span>
          </label>

          {editTarget?.id === user?.id && (
            <p className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-lg">
              يمكنك تعديل اسمك فقط. لا يمكن تغيير صلاحية حسابك الخاص أو إيقافه من هذه الصفحة.
            </p>
          )}
        </div>
      </Modal>

      {/* ── MODAL: RESET PIN ── */}
      <ConfirmDialog
        open={adminInviteConfirmOpen}
        onClose={() => setAdminInviteConfirmOpen(false)}
        onConfirm={() => { setAdminInviteConfirmOpen(false); void createInvite(); }}
        title="تأكيد دعوة مدير نظام"
        message="الرابط سيمنح من يستخدمه جميع صلاحيات مدير النظام بعد التسجيل. تأكد من إرسال الرابط للشخص المقصود فقط."
        confirmLabel="إنشاء رابط المدير"
      />
      <Modal
        open={!!resetTarget}
        onClose={() => {
          if (!actionBusy) {
            setResetTarget(null);
            setNewPin('');
            setConfirmPin('');
            setActionError(null);
          }
        }}
        title={`تغيير رمز دخول: ${resetTarget?.full_name || 'المستخدم'}`}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              className="btn-secondary"
              disabled={actionBusy}
              onClick={() => {
                setResetTarget(null);
                setNewPin('');
                setConfirmPin('');
              }}
            >
              إلغاء
            </button>
            <button
              className="btn-primary"
              disabled={actionBusy || newPin.length !== 4 || newPin !== confirmPin}
              onClick={resetUserPin}
            >
              {actionBusy ? 'جارٍ التغيير…' : 'تأكيد تغيير الرمز'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            أدخل رمزًا جديدًا من 4 أرقام للمستخدم. لن يظهر الرمز القديم، وسيُستخدم الجديد عند تسجيل الدخول القادم.
          </p>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">الرمز الجديد (4 أرقام)</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="new-password"
              className="input-field text-center font-mono tracking-widest text-base"
              dir="ltr"
              maxLength={4}
              placeholder="••••"
              value={newPin}
              onChange={(e) => setNewPin(cleanNumericInput(e.target.value, 4))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">تأكيد الرمز الجديد</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="new-password"
              className="input-field text-center font-mono tracking-widest text-base"
              dir="ltr"
              maxLength={4}
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => setConfirmPin(cleanNumericInput(e.target.value, 4))}
            />
          </div>

          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">
            تنبيه: أبلغ المستخدم بالرمز الجديد فور حفظه لتسجيل الدخول.
          </p>
        </div>
      </Modal>
    </div>
  );
}
