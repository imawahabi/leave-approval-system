-- Keep invite creation callable without exposing writes to private tables.
create or replace function private.create_registration_invite_checked(
  p_token_hash text,
  p_account_type text,
  p_grants jsonb
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare expiry timestamptz := now() + interval '48 hours';
begin
  if private.current_account_type() <> 'admin'
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Unauthorized or invalid invite';
  end if;
  perform private.validate_access_grants(p_account_type, p_grants);
  insert into private.invite_tokens(
    token_hash, created_by, requested_role, requested_account_type,
    requested_grants, expires_at
  ) values (
    p_token_hash, auth.uid(), private.legacy_role_for_account(p_account_type),
    p_account_type, coalesce(p_grants, '[]'::jsonb), expiry
  );
  return expiry;
end;
$$;
revoke all on function private.create_registration_invite_checked(text,text,jsonb)
  from public, anon;
grant execute on function private.create_registration_invite_checked(text,text,jsonb)
  to authenticated;

create or replace function public.create_registration_invite(
  p_token_hash text,
  p_account_type text,
  p_grants jsonb default '[]'::jsonb
)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.create_registration_invite_checked(
    p_token_hash, p_account_type, p_grants
  )
$$;
revoke all on function public.create_registration_invite(text,text,jsonb)
  from public, anon;
grant execute on function public.create_registration_invite(text,text,jsonb)
  to authenticated;

create or replace function private.create_legacy_registration_invite_checked(
  p_token_hash text, p_role text
)
returns timestamptz language sql security definer set search_path = '' as $$
  select private.create_registration_invite_checked(
    p_token_hash,
    case p_role when 'admin' then 'admin'
      when 'approver' then 'approver' else 'user' end,
    private.default_grants_for_legacy_role(p_role)
  )
$$;
revoke all on function private.create_legacy_registration_invite_checked(text,text)
  from public, anon;
grant execute on function private.create_legacy_registration_invite_checked(text,text)
  to authenticated;

create or replace function public.create_registration_invite(
  p_token_hash text, p_role text default 'viewer'
)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.create_legacy_registration_invite_checked(p_token_hash, p_role)
$$;
revoke all on function public.create_registration_invite(text,text) from public, anon;
grant execute on function public.create_registration_invite(text,text) to authenticated;

create or replace function public.create_registration_invite(p_token_hash text)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.create_legacy_registration_invite_checked(p_token_hash, 'viewer')
$$;
revoke all on function public.create_registration_invite(text) from public, anon;
grant execute on function public.create_registration_invite(text) to authenticated;

-- The RLS callers supply both member and leave IDs. Always look up the leave
-- creator; an own-leave grant must remain tied to the saved member.
create or replace function private.has_permission(
  p_permission text,
  p_member_id uuid default null,
  p_leave_id uuid default null
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  account_type text := private.current_account_type();
  grant_row record;
  target_member uuid := p_member_id;
  leave_member uuid;
  leave_creator uuid;
begin
  if account_type not in ('admin', 'user', 'approver') then return false; end if;
  if p_leave_id is not null then
    select leadership_member_id, created_by into leave_member, leave_creator
    from public.leadership_leaves where id = p_leave_id;
    if not found then return false; end if;
    target_member := coalesce(p_member_id, leave_member);
  end if;
  if account_type = 'admin' then return true; end if;
  if not exists (select 1 from private.permission_catalog where code = p_permission) then
    return false;
  end if;
  if p_permission in ('edit_own_leave', 'cancel_own_leave')
     and p_leave_id is not null and leave_creator = (select auth.uid())
     and target_member = leave_member
     and exists (
       select 1 from private.permission_grants g
       where g.user_id = (select auth.uid())
         and g.permission_code = p_permission
         and g.is_allowed and g.scope_kind = 'own'
     ) then
    return true;
  end if;
  if p_permission in ('edit_own_leave', 'cancel_own_leave') then
    return false;
  end if;
  for grant_row in
    select * from private.permission_grants g
    where g.user_id = (select auth.uid())
      and g.permission_code = p_permission and g.is_allowed
  loop
    if grant_row.scope_kind = 'all' then return true; end if;
    if grant_row.scope_kind = 'own' then continue; end if;
    if target_member is not null and private.scope_matches_member(
      grant_row.scope_kind, grant_row.scope_id, target_member
    ) then return true; end if;
  end loop;
  return false;
end;
$$;

-- UPDATE requires SELECT, including for accounts that can only cancel or archive.
drop policy if exists members_read_mutation_scoped on public.leadership_members;
create policy members_read_mutation_scoped on public.leadership_members
  for select to authenticated using (
    private.has_permission_in_org('edit_leader', sector_id, department_id)
    or private.has_permission_in_org('archive_leader', sector_id, department_id)
    or private.has_permission_in_org('delete_leader', sector_id, department_id)
  );
drop policy if exists leaves_read_mutation_scoped on public.leadership_leaves;
create policy leaves_read_mutation_scoped on public.leadership_leaves
  for select to authenticated using (
    private.has_permission('edit_any_leave', leadership_member_id, id)
    or private.has_permission('edit_own_leave', leadership_member_id, id)
    or private.has_permission('cancel_any_leave', leadership_member_id, id)
    or private.has_permission('cancel_own_leave', leadership_member_id, id)
    or private.has_permission('disable_leave', leadership_member_id, id)
  );

-- A client cannot nominate its own approval route when creating a leave.
create or replace function private.initialize_leave_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare resolved_route_id uuid; first_stage text;
begin
  resolved_route_id := case
    when auth.role() = 'service_role' then
      coalesce(new.approval_route_id, private.member_route(new.leadership_member_id))
    else private.member_route(new.leadership_member_id)
  end;
  if resolved_route_id is null then raise exception 'Approval route not found'; end if;
  select ars.stage_code into first_stage from private.approval_route_steps ars
    where ars.route_id = resolved_route_id order by ars.step_number limit 1;
  if first_stage not in ('undersecretary','minister') or first_stage is null then
    raise exception 'Approval route has no valid first stage';
  end if;
  new.approval_route_id := resolved_route_id;
  new.current_approval_stage := case when first_stage = 'minister' then 2 else 1 end;
  new.workflow_status := case when first_stage = 'minister'
    then 'pending_stage_2' else 'pending_stage_1' end;
  new.rejected_at_stage := null;
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

-- Every substantive edit starts the saved approval route again. The existing
-- trigger clears the visible review fields; this trigger keeps route state in
-- sync so an edited approved leave cannot disappear from both review queues.
create or replace function private.reset_leave_workflow_on_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_stage text; resolved_route_id uuid;
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if row(new.leadership_member_id,new.leave_type_id,new.start_date,new.end_date,
      new.return_date,new.total_days,new.notes,new.substitute_member_id,
      new.attachment_url)
    is not distinct from row(old.leadership_member_id,old.leave_type_id,old.start_date,
      old.end_date,old.return_date,old.total_days,old.notes,
      old.substitute_member_id,old.attachment_url) then return new; end if;
  resolved_route_id := case
    when new.leadership_member_id is distinct from old.leadership_member_id
      then private.member_route(new.leadership_member_id)
    else old.approval_route_id end;
  select stage_code into first_stage from private.approval_route_steps
    where route_id = resolved_route_id order by step_number limit 1;
  if first_stage not in ('undersecretary','minister') or first_stage is null then
    raise exception 'Approval route has no valid first stage';
  end if;
  new.approval_route_id := resolved_route_id;
  new.current_approval_stage := case when first_stage = 'minister' then 2 else 1 end;
  new.workflow_status := case when first_stage = 'minister'
    then 'pending_stage_2' else 'pending_stage_1' end;
  new.approval_status := 'pending';
  new.rejected_at_stage := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.rejection_reason := null;
  return new;
end;
$$;
revoke all on function private.reset_leave_workflow_on_edit()
  from public, anon, authenticated;
drop trigger if exists a_reset_leave_workflow_on_edit on public.leadership_leaves;
create trigger a_reset_leave_workflow_on_edit
  before update on public.leadership_leaves
  for each row execute function private.reset_leave_workflow_on_edit();

create or replace function private.reset_leave_steps_on_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if row(new.leadership_member_id,new.leave_type_id,new.start_date,new.end_date,
      new.return_date,new.total_days,new.notes,new.substitute_member_id,
      new.attachment_url)
    is distinct from row(old.leadership_member_id,old.leave_type_id,old.start_date,
      old.end_date,old.return_date,old.total_days,old.notes,
      old.substitute_member_id,old.attachment_url) then
    if new.approval_route_id is distinct from old.approval_route_id then
      delete from private.leave_approval_steps where leave_id = new.id;
      insert into private.leave_approval_steps(leave_id, step_number, stage_code, status)
      select new.id, step_number, stage_code, 'pending'
      from private.approval_route_steps where route_id = new.approval_route_id;
    else
      update private.leave_approval_steps set status = 'pending',
        reviewer_id = null, decided_at = null, decision_reason = null
      where leave_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_leave_steps_on_edit()
  from public, anon, authenticated;
drop trigger if exists reset_leave_steps_on_edit on public.leadership_leaves;
create trigger reset_leave_steps_on_edit
  after update on public.leadership_leaves
  for each row execute function private.reset_leave_steps_on_edit();

-- RLS authorizes rows; these triggers authorize the kind of change.
create or replace function private.guard_member_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other_change boolean;
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or private.current_account_type() = 'admin' then return new; end if;
  if new.id is distinct from old.id then raise exception 'Leader ID cannot change'; end if;
  other_change := row(new.id,new.full_name,new.file_number,new.rank,new.job_title,
      new.sector_id,new.department_id,new.workplace,new.phone_number,new.notes)
    is distinct from row(old.id,old.full_name,old.file_number,old.rank,old.job_title,
      old.sector_id,old.department_id,old.workplace,old.phone_number,old.notes);
  if other_change and not (
    private.has_permission_in_org('edit_leader',old.sector_id,old.department_id)
    and private.has_permission_in_org('edit_leader',new.sector_id,new.department_id)
  ) then raise exception 'Unauthorized leader edit'; end if;
  if new.is_active is distinct from old.is_active and not (
    old.is_active and not new.is_active
    and private.has_permission_in_org('archive_leader',old.sector_id,old.department_id)
  ) then raise exception 'Unauthorized leader archive'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_member_update() from public, anon, authenticated;
drop trigger if exists guard_member_update on public.leadership_members;
create trigger guard_member_update before update on public.leadership_members
  for each row execute function private.guard_member_update();

create or replace function private.guard_leave_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare can_edit boolean; can_cancel boolean;
  substantive_change boolean; approval_change boolean;
begin
  if auth.role() = 'service_role' or auth.uid() is null
     or private.current_account_type() in ('admin','approver') then return new; end if;
  if new.id is distinct from old.id then raise exception 'Leave ID cannot change'; end if;
  can_edit := private.has_permission('edit_any_leave',old.leadership_member_id,old.id)
    or private.has_permission('edit_own_leave',old.leadership_member_id,old.id);
  can_cancel := private.has_permission('cancel_any_leave',old.leadership_member_id,old.id)
    or private.has_permission('cancel_own_leave',old.leadership_member_id,old.id)
    or private.has_permission('disable_leave',old.leadership_member_id,old.id);
  if old.status = 'cancelled' then
    raise exception 'Cancelled leave can only be changed by the administrator';
  end if;
  substantive_change := row(new.id,new.leadership_member_id,new.leave_type_id,
      new.start_date,new.end_date,new.return_date,new.total_days,new.notes,
      new.substitute_member_id,new.attachment_url)
    is distinct from row(old.id,old.leadership_member_id,old.leave_type_id,
      old.start_date,old.end_date,old.return_date,old.total_days,old.notes,
      old.substitute_member_id,old.attachment_url);
  approval_change := row(new.approval_status,new.workflow_status,
      new.current_approval_stage,new.approval_route_id,new.rejected_at_stage,
      new.reviewed_by,new.reviewed_at,new.rejection_reason)
    is distinct from row(old.approval_status,old.workflow_status,
      old.current_approval_stage,old.approval_route_id,old.rejected_at_stage,
      old.reviewed_by,old.reviewed_at,old.rejection_reason);
  if substantive_change and not can_edit then
    raise exception 'Unauthorized leave edit';
  end if;
  if new.leadership_member_id is distinct from old.leadership_member_id and not (
    private.has_permission('edit_any_leave',old.leadership_member_id,old.id)
    and private.has_permission('edit_any_leave',new.leadership_member_id,old.id)
  ) then raise exception 'Changing the leader requires edit access to both leaders'; end if;
  if approval_change and not substantive_change then
    raise exception 'Review state cannot be changed by this account';
  end if;
  if approval_change and substantive_change and (
    new.approval_status <> 'pending'
    or new.workflow_status not in ('pending_stage_1','pending_stage_2')
    or new.current_approval_stage not in (1,2)
    or new.reviewed_by is not null or new.reviewed_at is not null
    or new.rejection_reason is not null or new.rejected_at_stage is not null
    or (new.leadership_member_id is not distinct from old.leadership_member_id
        and new.approval_route_id is distinct from old.approval_route_id)
    or (new.leadership_member_id is distinct from old.leadership_member_id
        and new.approval_route_id is distinct from private.member_route(new.leadership_member_id))
  ) then raise exception 'Invalid resubmission state'; end if;
  if new.status is distinct from old.status and not (
    (new.status = 'cancelled' and old.status <> 'cancelled' and can_cancel)
    or (new.status <> 'cancelled' and can_edit)
  ) then raise exception 'Unauthorized leave status change'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_leave_update() from public, anon, authenticated;
drop trigger if exists guard_leave_update on public.leadership_leaves;
create trigger guard_leave_update before update on public.leadership_leaves
  for each row execute function private.guard_leave_update();

notify pgrst, 'reload schema';
