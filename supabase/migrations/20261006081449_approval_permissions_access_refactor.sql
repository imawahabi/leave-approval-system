-- Keep the legacy review_queue RPC available to external clients while
-- enforcing the same stage and organization scope as the current queue.
-- Forwarding is governed by the undersecretary stage permission; reopening is
-- administrator-only. The latter remains an audit action label, not a grant.
delete from private.permission_grants
where permission_code in ('forward_approval', 'reopen_rejected_leave');

delete from private.permission_catalog
where code in ('forward_approval', 'reopen_rejected_leave');

create or replace function public.review_queue()
returns table(
  id uuid, member_name text, member_rank text, leave_type text,
  start_date date, end_date date, total_days integer, status text,
  approval_status text, rejection_reason text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_account_type() not in ('admin', 'approver') then
    raise exception 'Unauthorized';
  end if;

  return query
  select ll.id, m.full_name, m.rank, coalesce(lt.name_ar, 'إجازة'),
    ll.start_date, ll.end_date, ll.total_days, ll.status,
    ll.approval_status, ll.rejection_reason, ll.reviewed_at
  from public.leadership_leaves ll
  join public.leadership_members m on m.id = ll.leadership_member_id
  left join public.leave_types lt on lt.id = ll.leave_type_id
  where ll.status <> 'cancelled'
    and (
      private.current_account_type() = 'admin'
      or exists (
        select 1
        from private.leave_approval_steps las
        where las.leave_id = ll.id
          and private.has_permission(
            case las.stage_code
              when 'undersecretary' then 'approve_undersecretary'
              when 'minister' then 'approve_minister'
              else ''
            end,
            ll.leadership_member_id,
            ll.id
          )
      )
    )
  order by case ll.workflow_status
      when 'pending_stage_1' then 0
      when 'pending_stage_2' then 0
      when 'approved' then 1
      else 2
    end,
    ll.created_at desc
  limit 500;
end;
$$;

revoke all on function public.review_queue() from public, anon;
grant execute on function public.review_queue() to authenticated;

-- Match audit rows to a supported organization record. Unknown entity types
-- fail closed for scoped grants; administrators bypass the scope as requested.
create or replace function private.audit_org_unit_in_scope(
  p_grant_kind text,
  p_grant_id uuid,
  p_target_kind text,
  p_target_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive sector_tree(id) as (
    select s.id from public.sectors s
    where p_grant_kind = 'sector' and s.id = p_grant_id
    union all
    select child.id from public.sectors child
    join sector_tree parent on child.parent_sector_id = parent.id
  ), assistant_tree(id) as (
    select a.id from public.assistant_undersecretaries a
    where p_grant_kind = 'assistant_undersecretary' and a.id = p_grant_id
    union all
    select child.id from public.assistant_undersecretaries child
    join assistant_tree parent on child.parent_id = parent.id
  ), target_sector(sector_id) as (
    select p_target_id where p_target_kind = 'sector'
    union all
    select d.sector_id from public.departments d
      where p_target_kind = 'department' and d.id = p_target_id
    union all
    select s.legacy_sector_id from public.assistant_undersecretaries s
      where p_target_kind = 'assistant_undersecretary' and s.id = p_target_id
  )
  select case
    when p_target_kind = 'department' and p_grant_kind = 'department'
      then p_target_id = p_grant_id
    when p_target_kind = 'assistant_undersecretary'
      and p_grant_kind = 'assistant_undersecretary'
      then p_target_id in (select id from assistant_tree)
    when p_grant_kind = 'sector'
      then exists (select 1 from target_sector where sector_id in (select id from sector_tree))
    when p_grant_kind = 'assistant_undersecretary'
      then exists (
        select 1 from target_sector ts
        join public.sectors s on s.id = ts.sector_id
        where s.assistant_undersecretary_id in (select id from assistant_tree)
          or s.id in (select legacy_sector_id from public.assistant_undersecretaries
                      where id in (select id from assistant_tree))
      )
    else false
  end
$$;

create or replace function private.audit_log_visible(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare grant_row record;
begin
  if private.current_account_type() = 'admin' then return true; end if;
  if not private.has_any_permission('view_audit_logs') then return false; end if;
  if exists (
    select 1 from private.permission_grants g
    where g.user_id = (select auth.uid())
      and g.permission_code = 'view_audit_logs'
      and g.scope_kind = 'all'
      and g.is_allowed
  ) then
    return true;
  end if;

  if p_entity_type = 'leadership_leaves' then
    return exists (
      select 1 from public.leadership_leaves ll
      where ll.id = p_entity_id
        and private.has_permission('view_audit_logs', ll.leadership_member_id, ll.id)
    );
  elsif p_entity_type = 'leadership_members' then
    return private.has_permission('view_audit_logs', p_entity_id, null);
  elsif p_entity_type in ('sectors', 'departments', 'assistant_undersecretaries') then
    for grant_row in
      select g.scope_kind, g.scope_id
      from private.permission_grants g
      where g.user_id = (select auth.uid())
        and g.permission_code = 'view_audit_logs'
        and g.is_allowed
    loop
      if grant_row.scope_kind = 'all' then return true; end if;
      if grant_row.scope_kind <> 'own'
        and private.audit_org_unit_in_scope(
          grant_row.scope_kind,
          grant_row.scope_id,
          case p_entity_type
            when 'sectors' then 'sector'
            when 'departments' then 'department'
            else 'assistant_undersecretary'
          end,
          p_entity_id
        ) then
        return true;
      end if;
    end loop;
  end if;

  -- Profile and unsupported entity events may contain account data without
  -- a reliable organization key, so only administrators can read them.
  return false;
end;
$$;

revoke all on function private.audit_org_unit_in_scope(text, uuid, text, uuid) from public, anon;
revoke all on function private.audit_log_visible(text, uuid) from public, anon;
grant execute on function private.audit_log_visible(text, uuid) to authenticated;

-- Remove any legacy permissive SELECT policy before installing the scoped one;
-- PostgreSQL combines permissive policies with OR.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.audit_logs', policy_row.policyname);
  end loop;
end;
$$;

create policy audit_logs_read_scoped on public.audit_logs
  for select to authenticated
  using ((select private.audit_log_visible(entity_type, entity_id)));

notify pgrst, 'reload schema';
