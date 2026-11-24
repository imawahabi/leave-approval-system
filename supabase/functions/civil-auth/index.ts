import { createClient } from 'jsr:@supabase/supabase-js@2';
import { maxBodyBytes, readJsonBody } from './body.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const encoder = new TextEncoder();
const hmacKey = await crypto.subtle.importKey(
  'raw', encoder.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}
async function sha256(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function hmac(value: string) {
  return hex(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(value)));
}
function randomSecret() {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}
function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}
const invalid = () => response({ error: 'البيانات غير صحيحة أو الحساب غير متاح' }, 400);
const civilPattern = /^\d{12}$/;
const pinPattern = /^\d{4}$/;
const tokenPattern = /^[0-9a-f]{64}$/;
const accountTypes = ['user', 'approver', 'admin'];

function legacyAccountType(value: unknown) {
  const legacy = String(value || '');
  return legacy === 'admin' ? 'admin' : legacy === 'approver' ? 'approver' : 'user';
}

function requestedAccess(body: Record<string, unknown>) {
  const accountType = accountTypes.includes(String(body.accountType))
    ? String(body.accountType)
    : legacyAccountType(body.role);
  const grants = Array.isArray(body.grants) ? body.grants : [];
  if (!accountTypes.includes(accountType) || grants.length > 64) return null;
  return { accountType, grants };
}

async function registerWithToken(token: string, civilHash: string, pinVerifier: string, fullName: string) {
  const tokenHash = await sha256(token);
  const { data: reserved, error: reserveError } = await admin.rpc('consume_registration_invite', {
    p_token_hash: tokenHash,
  });
  if (reserveError || !reserved) return { error: 'رابط الدعوة غير صالح أو انتهت صلاحيته', status: 400 };
  const email = `${crypto.randomUUID()}@accounts.leave-system.example`;
  const { error: prepareError } = await admin.rpc('prepare_invite_email', {
    p_token_hash: tokenHash, p_email: email,
  });
  if (prepareError) return { error: 'تعذر إعداد الحساب. اطلب رابطًا جديدًا من المدير.', status: 500 };
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: randomSecret(),
    app_metadata: { invite_registration: true },
  });
  if (createError || !created.user) return { error: 'تعذر إنشاء الحساب. اطلب رابطًا جديدًا من المدير.', status: 500 };
  const { error: finishError } = await admin.rpc('finish_registration', {
    p_token_hash: tokenHash, p_user_id: created.user.id, p_civil_hash: civilHash,
    p_pin_verifier: pinVerifier, p_full_name: fullName,
  });
  if (finishError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: 'تعذر إنشاء الحساب. تحقق من الرقم المدني أو اطلب رابطًا جديدًا.', status: 400 };
  }
  return { userId: created.user.id };
}

async function authenticatedUser(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!bearer) return null;
  const { data, error } = await admin.auth.getUser(bearer);
  return error ? null : data.user;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return response({});
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    if (Number(request.headers.get('content-length') || '0') > maxBodyBytes) return invalid();
    const body = await readJsonBody(request);
    if (!body) return invalid();
    const action = body?.action;
    const civilId = String(body?.civilId || '');
    const pin = String(body?.pin || '');
    if (!pinPattern.test(pin) || (action !== 'admin-reset-pin' && !civilPattern.test(civilId))) return invalid();
    const civilHash = action === 'admin-reset-pin' ? '' : await hmac(`civil:${civilId}`);
    const pinVerifier = action === 'admin-reset-pin' ? '' : await hmac(`pin:${civilId}:${pin}`);

    if (action === 'login') {
      // The platform supplies the final client IP in this header; the database
      // additionally locks each civil identity after repeated failures.
      const ip = (request.headers.get('x-forwarded-for') || '').split(',').at(-1)?.trim() || 'unknown';
      const ipHash = await hmac(`ip:${ip}`);
      const { data: email, error } = await admin.rpc('verify_civil_pin_v2', {
        p_civil_hash: civilHash, p_legacy_verifier: pinVerifier,
        p_reset_verifier: await hmac(`pin-hash:${civilHash}:${pin}`), p_ip_hash: ipHash,
      });
      if (error || !email) return invalid();
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      if (linkError || !link?.properties?.hashed_token) return invalid();
      return response({ token_hash: link.properties.hashed_token });
    }

    if (action === 'register') {
      const token = String(body?.token || '').toLowerCase();
      const fullName = String(body?.fullName || '').trim();
      if (!tokenPattern.test(token) || fullName.length < 2 || fullName.length > 120) return invalid();
      const result = await registerWithToken(token, civilHash, pinVerifier, fullName);
      return 'error' in result ? response({ error: result.error }, result.status) : response({ success: true });
    }

    if (action === 'admin-create-user') {
      const caller = await authenticatedUser(request);
      if (!caller) return invalid();
      const { data: profile } = await admin.from('profiles').select('account_type,role,is_active').eq('id', caller.id).single();
      if ((profile?.account_type !== 'admin' && profile?.role !== 'admin') || !profile.is_active) return invalid();
      const fullName = String(body?.fullName || '').trim();
      const access = requestedAccess(body);
      if (fullName.length < 2 || fullName.length > 120 || !access) return invalid();
      const token = randomSecret();
      const { error: inviteError } = await admin.rpc('admin_create_registration_invite', {
        p_admin_id: caller.id,
        p_token_hash: await sha256(token),
        p_account_type: access.accountType,
        p_grants: access.grants,
      });
      if (inviteError) return response({ error: 'تعذر تجهيز الحساب الجديد.' }, 500);
      const result = await registerWithToken(token, civilHash, pinVerifier, fullName);
      if ('error' in result) return response({ error: result.error }, result.status);
      return response({ success: true, userId: result.userId });
    }

    if (action === 'self-reset-pin') {
      const caller = await authenticatedUser(request);
      const nextPin = String(body?.newPin || '');
      if (!caller || !pinPattern.test(nextPin) || nextPin === pin) return invalid();
      const ip = (request.headers.get('x-forwarded-for') || '').split(',').at(-1)?.trim() || 'unknown';
      const { data: email, error: verifyError } = await admin.rpc('verify_civil_pin_v2', {
        p_civil_hash: civilHash, p_legacy_verifier: pinVerifier,
        p_reset_verifier: await hmac(`pin-hash:${civilHash}:${pin}`), p_ip_hash: await hmac(`ip:${ip}`),
      });
      if (verifyError || !email || email !== caller.email) return invalid();
      const { error: resetError } = await admin.rpc('self_reset_civil_pin', {
        p_user_id: caller.id, p_civil_hash: civilHash,
        p_reset_verifier: await hmac(`pin-hash:${civilHash}:${nextPin}`),
      });
      if (resetError) return response({ error: 'تعذر تغيير رمز الدخول.' }, 500);
      return response({ success: true });
    }

    if (action === 'setup-admin') {
      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (!bearer) return invalid();
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user) return invalid();
      const { data: profile } = await admin.from('profiles').select('account_type,role,is_active')
        .eq('id', authData.user.id).single();
      if ((profile?.account_type !== 'admin' && profile?.role !== 'admin') || !profile.is_active) return invalid();
      const { error: setupError } = await admin.rpc('setup_admin_civil', {
        p_admin_id: authData.user.id, p_civil_hash: civilHash, p_pin_verifier: pinVerifier,
      });
      if (setupError) return response({ error: 'الرقم المدني مستخدم أو تم إعداد حساب المدير من قبل.' }, 400);
      const { error: rotateError } = await admin.auth.admin.updateUserById(authData.user.id, {
        password: randomSecret(),
      });
      if (rotateError) return response({ error: 'تم حفظ الرقم المدني، لكن تعذر إغلاق كلمة المرور القديمة. تواصل مع مسؤول النظام.' }, 500);
      return response({ success: true });
    }

    if (action === 'admin-reset-pin') {
      const targetId = String(body?.targetUserId || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) return invalid();
      const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (!bearer) return invalid();
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user) return invalid();
      const { data: profile } = await admin.from('profiles').select('account_type,role,is_active')
        .eq('id', authData.user.id).single();
      if ((profile?.account_type !== 'admin' && profile?.role !== 'admin') || !profile.is_active) return invalid();
      const { data: targetCivilHash, error: hashError } = await admin.rpc('admin_pin_reset_civil_hash', {
        p_admin_id: authData.user.id, p_target_id: targetId,
      });
      if (hashError || !targetCivilHash) return response({ error: 'لا توجد بيانات دخول لهذا المستخدم' }, 400);
      const resetVerifier = await hmac(`pin-hash:${targetCivilHash}:${pin}`);
      const { error: resetError } = await admin.rpc('admin_reset_civil_pin', {
        p_admin_id: authData.user.id, p_target_id: targetId, p_reset_verifier: resetVerifier,
      });
      if (resetError) return response({ error: 'تعذر تغيير الرمز. حاول مرة أخرى.' }, 500);
      return response({ success: true });
    }
    return invalid();
  } catch {
    return response({ error: 'تعذر إكمال الطلب. حاول لاحقًا.' }, 500);
  }
});
