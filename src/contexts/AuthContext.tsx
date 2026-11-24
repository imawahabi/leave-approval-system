import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PermissionCode, PermissionGrant, Profile } from '@/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  permissions: PermissionGrant[];
  loading: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canApprove: boolean;
  accountType: 'admin' | 'user' | 'approver' | null;
  hasPermission: (permission: PermissionCode) => boolean;
  signIn: (civilId: string, pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const profileRequest = useRef(0);
  const activeUserId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as Profile | null;
  }, []);

  const fetchPermissions = useCallback(async (): Promise<PermissionGrant[]> => {
    const { data, error } = await supabase.rpc('my_permission_snapshot');
    // The new RPC is deployed after the local permission migration. Keep the
    // legacy role fallback usable while a rolling deployment is in progress.
    if (error) return [];
    return (data || []) as PermissionGrant[];
  }, []);

  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;
    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;
      const request = ++profileRequest.current;
      const nextUserId = nextSession?.user?.id ?? null;
      if (nextUserId !== activeUserId.current) setLoading(true);
      activeUserId.current = nextUserId;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfile(null);
        setPermissions([]);
        setLoading(false);
        return;
      }
      const nextProfile = await fetchProfile(nextSession.user.id);
      if (!mounted || request !== profileRequest.current) return;
      setProfile(nextProfile);
      const nextPermissions = await fetchPermissions();
      if (!mounted || request !== profileRequest.current) return;
      setPermissions(nextPermissions);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!authEventSeen) void applySession(data.session);
    }).catch(() => { if (mounted && !authEventSeen) setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true;
      // Defer Supabase queries until the auth callback has returned.
      window.setTimeout(() => { void applySession(nextSession); }, 0);
    });

    return () => { mounted = false; profileRequest.current += 1; subscription.unsubscribe(); };
  }, [fetchProfile, fetchPermissions]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const request = profileRequest.current;
    const nextProfile = await fetchProfile(user.id);
    if (request !== profileRequest.current) return;
    const nextPermissions = await fetchPermissions();
    if (request !== profileRequest.current) return;
    setProfile(nextProfile);
    setPermissions(nextPermissions);
  }, [user, fetchProfile, fetchPermissions]);

  const signIn = useCallback(async (civilId: string, pin: string) => {
    const { data, error } = await supabase.functions.invoke('civil-auth', {
      body: { action: 'login', civilId, pin },
    });
    if (error || !data?.token_hash) return { error: data?.error || 'البيانات غير صحيحة أو الحساب غير متاح' };
    const verified = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
    if (verified.error) return { error: 'تعذر إكمال تسجيل الدخول. حاول مرة أخرى.' };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions([]);
  }, []);

  const accountType = profile?.account_type ?? (profile?.role === 'admin' ? 'admin' : profile?.role === 'approver' ? 'approver' : profile ? 'user' : null);
  const isAdmin = profile?.is_active === true && accountType === 'admin';
  const hasPermission = useCallback((permission: PermissionCode) => {
    if (profile?.is_active !== true) return false;
    if (accountType === 'admin') return true;
    return permissions.some((grant) => grant.permission_code === permission);
  }, [accountType, permissions, profile?.is_active]);
  // Coarse navigation capability only; record actions must check their own
  // permission (edit_leader, create_leave, etc.) at the record's scope.
  const canEdit = profile?.is_active === true && (accountType === 'admin' || hasPermission('edit_leader') || hasPermission('create_leader') || hasPermission('create_leave'));
  const canApprove = profile?.is_active === true && (accountType === 'admin' || hasPermission('approve_undersecretary') || hasPermission('approve_minister'));

  return (
    <AuthContext.Provider value={{ user, session, profile, permissions, loading, isAdmin, canEdit, canApprove, accountType, hasPermission, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
