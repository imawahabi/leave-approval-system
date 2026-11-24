import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { compareLeaders } from '@/utils/leaderOrder';
import { arabicSearchMatches } from '@/utils/arabicSearch';
import type { LeadershipMember, LeadershipLeave, Sector, Department, LeaveType, AssistantUndersecretary } from '@/types';

function useRequestVersion() {
  const version = useRef(0);
  useEffect(() => () => { version.current += 1; }, []);
  return version;
}

export function useAssistantUndersecretaries() {
  const [undersecretaries, setUndersecretaries] = useState<AssistantUndersecretary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();
  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('assistant_undersecretaries')
      .select('*').eq('is_active', true).order('sort_order').order('name_ar');
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else { setUndersecretaries(data as AssistantUndersecretary[]); setError(null); }
    setLoading(false);
  }, [requestVersion]);
  useEffect(() => { void fetch(); }, [fetch]);
  return { undersecretaries, loading, error, refetch: fetch };
}

export function useSectors() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('sectors')
      .select('*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)')
      .eq('is_active', true)
      .order('sort_order');
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else setSectors(data as Sector[]);
    setLoading(false);
  }, [requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { sectors, loading, error, refetch: fetch };
}

export function useDepartments(sectorId?: string | null) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    let query = supabase.from('departments').select('*, sector:sectors(*)').eq('is_active', true).order('sort_order');
    if (sectorId) query = query.eq('sector_id', sectorId);
    const { data, error } = await query;
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else setDepartments(data as Department[]);
    setLoading(false);
  }, [sectorId, requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { departments, loading, error, refetch: fetch };
}

export function useLeaveTypes() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else setLeaveTypes(data as LeaveType[]);
    setLoading(false);
  }, [requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { leaveTypes, loading, error, refetch: fetch };
}

export function useLeadershipMembers(filters?: {
  search?: string;
  sectorId?: string | null;
  departmentId?: string | null;
  rank?: string | null;
  isActive?: boolean | null;
}) {
  const [members, setMembers] = useState<LeadershipMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('leadership_members')
      .select('*, sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)), department:departments(*)')
      .order('full_name');

    if (filters?.isActive !== undefined && filters?.isActive !== null) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters?.sectorId) query = query.eq('sector_id', filters.sectorId);
    if (filters?.departmentId) query = query.eq('department_id', filters.departmentId);
    if (filters?.rank) query = query.eq('rank', filters.rank);

    const { data, error } = await query;
    if (request !== requestVersion.current) return;
    if (error) {
      setError(error.message);
    } else {
      let result = (data as LeadershipMember[]) || [];
      if (filters?.search) {
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
            filters.search
          )
        );
      }
      result.sort(compareLeaders);
      setMembers(result);
    }
    setLoading(false);
  }, [filters?.search, filters?.sectorId, filters?.departmentId, filters?.rank, filters?.isActive, requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { members, loading, error, refetch: fetch };
}

export function useLeadershipMember(id: string | undefined) {
  const [member, setMember] = useState<LeadershipMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!id) { setMember(null); setError(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('leadership_members')
      .select('*, sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)), department:departments(*)')
      .eq('id', id)
      .maybeSingle();
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else { setMember(data as LeadershipMember | null); setError(null); }
    setLoading(false);
  }, [id, requestVersion]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { member, loading, error, refetch: fetch };
}

export function useMemberLeaves(memberId: string | undefined) {
  const [leaves, setLeaves] = useState<LeadershipLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!memberId) { setLeaves([]); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('leadership_leaves')
      .select('*, leave_type:leave_types(*)')
      .eq('leadership_member_id', memberId)
      .order('start_date', { ascending: false });
    if (request !== requestVersion.current) return;
    if (error) setError(error.message);
    else {
      const leaveRows = (data as LeadershipLeave[]) ?? [];
      const creatorIds = [...new Set(leaveRows.map((leave) => leave.created_by).filter(Boolean))] as string[];
      if (creatorIds.length) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds);
        if (request !== requestVersion.current) return;
        const profileMap = new Map((profilesData ?? []).map((profile) => [profile.id, profile]));
        setLeaves(leaveRows.map((leave) => ({
          ...leave,
          creator: leave.created_by ? profileMap.get(leave.created_by) ?? null : null,
        })));
      } else {
        setLeaves(leaveRows);
      }
    }
    setLoading(false);
  }, [memberId, requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { leaves, loading, error, refetch: fetch };
}

export function useAllLeaves(filters?: {
  approval?: 'approved' | 'review';
  createdBy?: string | null;
  status?: string | null;
  startDateFrom?: string | null;
  startDateTo?: string | null;
  sectorId?: string | null;
  departmentId?: string | null;
  leaveTypeId?: string | null;
  memberId?: string | null;
}) {
  const [leaves, setLeaves] = useState<LeadershipLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRequestVersion();

  const fetch = useCallback(async () => {
    const request = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const memberRelation = filters?.sectorId || filters?.departmentId
      ? 'leadership_member:leadership_member_id!inner'
      : 'leadership_member:leadership_member_id';
    let query = supabase
      .from('leadership_leaves')
      .select(`
        *,
        leave_type:leave_types(*),
        ${memberRelation}(*, sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)), department:departments(*))
      `)
      .order('start_date', { ascending: false });

    if (filters?.approval === 'approved') query = query.eq('approval_status', 'approved');
    if (filters?.approval === 'review') query = query.neq('approval_status', 'approved').neq('status', 'cancelled');
    if (filters?.createdBy) query = query.eq('created_by', filters.createdBy);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.startDateFrom) query = query.gte('start_date', filters.startDateFrom);
    if (filters?.startDateTo) query = query.lte('start_date', filters.startDateTo);
    if (filters?.leaveTypeId) query = query.eq('leave_type_id', filters.leaveTypeId);
    if (filters?.memberId) query = query.eq('leadership_member_id', filters.memberId);
    if (filters?.sectorId) query = query.eq('leadership_member.sector_id', filters.sectorId);
    if (filters?.departmentId) query = query.eq('leadership_member.department_id', filters.departmentId);

    const { data, error } = await query;
    if (request !== requestVersion.current) return;
    if (error) {
      setError(error.message);
    } else {
      setLeaves((data as LeadershipLeave[]) ?? []);
    }
    setLoading(false);
  }, [filters?.approval, filters?.createdBy, filters?.status, filters?.startDateFrom, filters?.startDateTo, filters?.sectorId, filters?.departmentId, filters?.leaveTypeId, filters?.memberId, requestVersion]);

  useEffect(() => { fetch(); }, [fetch]);
  return { leaves, loading, error, refetch: fetch };
}
