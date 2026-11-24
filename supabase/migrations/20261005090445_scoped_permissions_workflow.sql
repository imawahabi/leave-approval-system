-- Scoped permissions and staged leave workflow foundation.
-- This migration is intentionally additive: legacy role/approval columns remain
-- available while the application moves to account types, grants and scopes.

create schema if not exists private;

alter table public.profiles
  add column if not exists account_type text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('admin', 'user', 'approver'));

update public.profiles
set account_type = case
  when role = 'admin' then 'admin'
  when role = 'approver' then 'approver'
  else 'user'
end
where account_type = 'user';

create or replace function private.sync_profile_account_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.account_type := case when new.role = 'admin' then 'admin'
      when new.role = 'approver' then 'approver' else 'user' end;
  elsif new.role is distinct from old.role then
    new.account_type := case when new.role = 'admin' then 'admin'
      when new.role = 'approver' then 'approver' else 'user' end;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_profile_account_type() from public, anon, authenticated;
drop trigger if exists sync_profile_account_type on public.profiles;
create trigger sync_profile_account_type
before insert or update of role on public.profiles
for each row execute function private.sync_profile_account_type();

create table if not exists private.permission_catalog (
  code text primary key,
  description_ar text not null,
  created_at timestamptz not null default now()
);

insert into private.permission_catalog(code, description_ar) values
  ('view_leaders', 'مشاهدة بيانات الموظفين'),
  ('create_leader', 'إضافة موظف'),
  ('edit_leader', 'تعديل موظف'),
  ('archive_leader', 'أرشفة موظف'),
  ('delete_leader', 'حذف موظف'),
  ('view_leaves', 'مشاهدة الإجازات'),
  ('create_leave', 'إضافة إجازة'),
  ('edit_own_leave', 'تعديل الإجازات التي أنشأها المستخدم'),
  ('cancel_own_leave', 'إلغاء الإجازات التي أنشأها المستخدم'),
  ('edit_any_leave', 'تعديل أي إجازة'),
  ('cancel_any_leave', 'إلغاء أي إجازة'),
  ('disable_leave', 'تعطيل إجازة'),
  ('delete_leave', 'حذف إجازة'),
  ('approve_undersecretary', 'الموافقة في مرحلة المدير العام'),
  ('approve_minister', 'الموافقة في مرحلة رئيس الجهة'),
  ('return_review_pending', 'إعادة القرار إلى بانتظار المراجعة'),
  ('forward_approval', 'توجيه الإجازة إلى المرحلة التالية'),
  ('reopen_rejected_leave', 'إعادة فتح إجازة مرفوضة'),
  ('view_reports', 'مشاهدة التقارير'),
  ('view_audit_logs', 'مشاهدة سجل التدقيق'),
  ('manage_users', 'إدارة المستخدمين'),
  ('manage_organization', 'إدارة الهيكل التنظيمي'),
  ('manage_leave_types', 'إدارة أنواع الإجازات')
on conflict (code) do update set description_ar = excluded.description_ar;

create table if not exists private.permission_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_code text not null references private.permission_catalog(code) on delete cascade,
  scope_kind text not null check (scope_kind in ('all', 'own', 'sector', 'department', 'assistant_undersecretary')),
  scope_id uuid,
  is_allowed boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope_kind in ('all', 'own') and scope_id is null) or
         (scope_kind in ('sector', 'department', 'assistant_undersecretary') and scope_id is not null)),
  unique (user_id, permission_code, scope_kind, scope_id)
);

create table if not exists private.approval_routes (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  match_kind text not null check (match_kind in ('default', 'sector', 'department', 'assistant_undersecretary')),
  match_id uuid,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((match_kind = 'default' and match_id is null) or
         (match_kind <> 'default' and match_id is not null))
);

create table if not exists private.approval_route_steps (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references private.approval_routes(id) on delete cascade,
  step_number smallint not null check (step_number > 0),
  stage_code text not null check (stage_code in ('undersecretary', 'minister')),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (route_id, step_number)
);

create table if not exists private.leave_approval_steps (
  id uuid primary key default gen_random_uuid(),
  leave_id uuid not null references public.leadership_leaves(id) on delete cascade,
  step_number smallint not null check (step_number > 0),
  stage_code text not null check (stage_code in ('undersecretary', 'minister')),
  status text not null check (status in ('pending', 'approved', 'rejected', 'skipped')),
  reviewer_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  unique (leave_id, step_number)
);

create table if not exists private.leave_workflow_events (
  id uuid primary key default gen_random_uuid(),
  leave_id uuid not null references public.leadership_leaves(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_code text not null,
  from_state text,
  to_state text,
  reason text,
  created_at timestamptz not null default now()
);

-- Keep the private schema protected even if project-level defaults change.
-- Access is provided only through the guarded SECURITY DEFINER RPCs below.
alter table private.permission_catalog enable row level security;
alter table private.permission_grants enable row level security;
alter table private.approval_routes enable row level security;
alter table private.approval_route_steps enable row level security;
alter table private.leave_approval_steps enable row level security;
alter table private.leave_workflow_events enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

alter table public.leadership_leaves
  add column if not exists workflow_status text not null default 'pending_stage_1',
  add column if not exists current_approval_stage smallint not null default 1,
  add column if not exists approval_route_id uuid references private.approval_routes(id) on delete set null,
  add column if not exists rejected_at_stage smallint;

alter table public.leadership_leaves
  drop constraint if exists leadership_leaves_workflow_status_check;
alter table public.leadership_leaves
  add constraint leadership_leaves_workflow_status_check
  check (workflow_status in ('pending_stage_1', 'pending_stage_2', 'approved', 'rejected_stage_1', 'rejected_stage_2'));

create index if not exists leadership_leaves_workflow_idx
  on public.leadership_leaves(workflow_status, current_approval_stage);

create or replace function private.current_account_type()
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active = true)
    then coalesce(
      (select p.account_type from public.profiles p
        where p.id = (select auth.uid()) and p.is_active = true),
      case private.current_role()
        when 'admin' then 'admin'
        when 'approver' then 'approver'
        else 'user'
      end)
    else 'disabled' end
$$;

create or replace function private.scope_matches_member(
  p_scope_kind text,
  p_scope_id uuid,
  p_member_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive sector_tree as (
    select s.id from public.sectors s where p_scope_kind = 'sector' and s.id = p_scope_id
    union all
    select child.id from public.sectors child
    join sector_tree parent on child.parent_sector_id = parent.id
  ), assistant_tree as (
    select a.id from public.assistant_undersecretaries a
    where p_scope_kind = 'assistant_undersecretary' and a.id = p_scope_id
    union all
    select child.id from public.assistant_undersecretaries child
    join assistant_tree parent on child.parent_id = parent.id
  )
  select exists (
    select 1
    from public.leadership_members lm
    where lm.id = p_member_id
      and (
        (p_scope_kind = 'sector' and lm.sector_id in (select id from sector_tree))
        or (p_scope_kind = 'department' and lm.department_id = p_scope_id)
        or (p_scope_kind = 'assistant_undersecretary' and exists (
          select 1 from public.sectors s
          where s.id = lm.sector_id
            and (
              s.assistant_undersecretary_id in (select id from assistant_tree)
              or s.id in (select legacy_sector_id from public.assistant_undersecretaries
                           where id in (select id from assistant_tree))
            )
        ))
      )
  )
$$;

create or replace function private.scope_matches_org(
  p_scope_kind text,
  p_scope_id uuid,
  p_sector_id uuid,
  p_department_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive sector_tree as (
    select s.id from public.sectors s where p_scope_kind = 'sector' and s.id = p_scope_id
    union all
    select child.id from public.sectors child
    join sector_tree parent on child.parent_sector_id = parent.id
  ), assistant_tree as (
    select a.id from public.assistant_undersecretaries a
    where p_scope_kind = 'assistant_undersecretary' and a.id = p_scope_id
    union all
    select child.id from public.assistant_undersecretaries child
    join assistant_tree parent on child.parent_id = parent.id
  )
  select
    (p_scope_kind = 'sector' and p_sector_id in (select id from sector_tree))
    or (p_scope_kind = 'department' and p_department_id = p_scope_id)
    or (p_scope_kind = 'assistant_undersecretary' and exists (
      select 1 from public.sectors s
      where s.id = p_sector_id
        and (s.assistant_undersecretary_id in (select id from assistant_tree)
          or s.id in (select legacy_sector_id from public.assistant_undersecretaries
                      where id in (select id from assistant_tree)))
    ))
$$;

create or replace function private.has_any_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_account_type() in ('admin', 'user', 'approver')
    and (private.current_account_type() = 'admin'
    or exists(select 1 from private.permission_grants g
      where g.user_id = (select auth.uid()) and g.permission_code = p_permission and g.is_allowed))
$$;

create or replace function private.has_permission_in_org(
  p_permission text, p_sector_id uuid, p_department_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare grant_row record;
begin
  if private.current_account_type() not in ('admin', 'user', 'approver') then return false; end if;
  if private.current_account_type() = 'admin' then return true; end if;
  for grant_row in
    select * from private.permission_grants g
    where g.user_id = (select auth.uid()) and g.permission_code = p_permission and g.is_allowed
  loop
    if grant_row.scope_kind = 'all' then return true; end if;
    if grant_row.scope_kind <> 'own' and private.scope_matches_org(
      grant_row.scope_kind, grant_row.scope_id, p_sector_id, p_department_id) then return true; end if;
  end loop;
  return false;
end;
$$;

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
  leave_creator uuid;
begin
  if account_type not in ('admin', 'user', 'approver') then return false; end if;
  if account_type = 'admin' then return true; end if;
  if not exists (select 1 from private.permission_catalog where code = p_permission) then return false; end if;
  if target_member is null and p_leave_id is not null then
    select leadership_member_id, created_by into target_member, leave_creator
    from public.leadership_leaves where id = p_leave_id;
  end if;
  if p_permission in ('edit_own_leave', 'cancel_own_leave')
     and p_leave_id is not null and leave_creator = (select auth.uid()) then
    return exists (select 1 from private.permission_grants g
      where g.user_id = (select auth.uid()) and g.permission_code = p_permission
        and g.is_allowed and g.scope_kind = 'own');
  end if;
  for grant_row in
    select * from private.permission_grants g
    where g.user_id = (select auth.uid())
      and g.permission_code = p_permission and g.is_allowed
  loop
    if grant_row.scope_kind = 'all' then return true; end if;
    if grant_row.scope_kind = 'own' then continue; end if;
    if target_member is not null and private.scope_matches_member(
      grant_row.scope_kind, grant_row.scope_id, target_member) then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function private.current_account_type() from public, anon;
revoke all on function private.scope_matches_member(text,uuid,uuid) from public, anon;
revoke all on function private.scope_matches_org(text,uuid,uuid,uuid) from public, anon;
revoke all on function private.has_any_permission(text) from public, anon;
revoke all on function private.has_permission_in_org(text,uuid,uuid) from public, anon;
revoke all on function private.has_permission(text,uuid,uuid) from public, anon;
grant execute on function private.current_account_type() to authenticated;
grant execute on function private.scope_matches_member(text,uuid,uuid) to authenticated;
grant execute on function private.scope_matches_org(text,uuid,uuid,uuid) to authenticated;
grant execute on function private.has_any_permission(text) to authenticated;
grant execute on function private.has_permission_in_org(text,uuid,uuid) to authenticated;
grant execute on function private.has_permission(text,uuid,uuid) to authenticated;

-- One default two-stage route, plus direct-to-minister routes for the
-- undersecretary's own sector. Future organizational changes are data changes.
do $$
declare
  default_route uuid;
  direct_route uuid;
  unit_row record;
begin
  select id into default_route from private.approval_routes
  where match_kind = 'default' and is_active order by priority, created_at limit 1;
  if default_route is null then
    insert into private.approval_routes(name_ar, match_kind, priority)
    values ('المسار القياسي: الوكيل ثم الوزير', 'default', 100)
    returning id into default_route;
    insert into private.approval_route_steps(route_id, step_number, stage_code)
    values (default_route, 1, 'undersecretary'), (default_route, 2, 'minister');
  end if;

  for unit_row in
    select id, legacy_sector_id, name_ar from public.assistant_undersecretaries
    where unit_kind = 'undersecretary' and is_active and legacy_sector_id is not null
  loop
    select id into direct_route from private.approval_routes
    where match_kind = 'assistant_undersecretary' and match_id = unit_row.id and is_active
    order by priority, created_at limit 1;
    if direct_route is null then
      insert into private.approval_routes(name_ar, match_kind, match_id, priority)
      values ('المسار المباشر إلى الوزير: ' || unit_row.name_ar,
              'sector', unit_row.legacy_sector_id, 10)
      returning id into direct_route;
      insert into private.approval_route_steps(route_id, step_number, stage_code)
      values (direct_route, 2, 'minister');
    end if;
  end loop;
end $$;

create or replace function private.member_route(p_member_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id
  from private.approval_routes r
  where r.is_active and (
    r.match_kind = 'default'
    or (r.match_kind = 'sector' and exists (
      select 1 from public.leadership_members lm where lm.id = p_member_id and lm.sector_id = r.match_id
    ))
    or (r.match_kind = 'department' and exists (
      select 1 from public.leadership_members lm where lm.id = p_member_id and lm.department_id = r.match_id
    ))
    or (r.match_kind = 'assistant_undersecretary' and private.scope_matches_member(
      'assistant_undersecretary', r.match_id, p_member_id))
  )
  order by case when r.match_kind = 'default' then 1 else 0 end, r.priority, r.created_at
  limit 1
$$;

update public.leadership_leaves ll
set approval_route_id = private.member_route(ll.leadership_member_id)
where ll.approval_route_id is null;

update public.leadership_leaves ll
set current_approval_stage = case when exists (
    select 1 from private.approval_route_steps ars
    where ars.route_id = ll.approval_route_id and ars.step_number = 1 and ars.stage_code = 'undersecretary'
  ) then 1 else 2 end
where ll.approval_route_id is not null;

create or replace function private.initialize_leave_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  resolved_route_id uuid := coalesce(new.approval_route_id, private.member_route(new.leadership_member_id));
  first_stage text;
begin
  new.approval_route_id := resolved_route_id;
  select ars.stage_code into first_stage from private.approval_route_steps ars
    where ars.route_id = resolved_route_id order by ars.step_number limit 1;
  if first_stage = 'minister' then
    new.current_approval_stage := 2;
    new.workflow_status := 'pending_stage_2';
  else
    new.current_approval_stage := 1;
    new.workflow_status := 'pending_stage_1';
  end if;
  return new;
end;
$$;

drop trigger if exists initialize_leave_workflow on public.leadership_leaves;
create trigger initialize_leave_workflow
before insert on public.leadership_leaves
for each row execute function private.initialize_leave_workflow();

create or replace function private.populate_leave_approval_steps()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.leave_approval_steps(leave_id, step_number, stage_code, status)
  select new.id, ars.step_number, ars.stage_code,
    case when new.workflow_status = 'approved' then 'approved'
         when new.workflow_status like 'rejected%' and ars.step_number = new.rejected_at_stage then 'rejected'
         when ars.step_number < new.current_approval_stage then 'approved'
         when ars.step_number > new.current_approval_stage and new.workflow_status like 'pending%' then 'pending'
         else 'pending' end
  from private.approval_route_steps ars
  where ars.route_id = new.approval_route_id
  on conflict (leave_id, step_number) do nothing;
  return new;
end;
$$;

drop trigger if exists populate_leave_approval_steps on public.leadership_leaves;
create trigger populate_leave_approval_steps
after insert on public.leadership_leaves
for each row execute function private.populate_leave_approval_steps();

-- Backfill existing records as completed historical workflows. They are not
-- reopened or re-routed by this additive migration.
insert into private.leave_approval_steps(leave_id, step_number, stage_code, status, decided_at)
select ll.id, ars.step_number, ars.stage_code,
  case when ll.approval_status = 'approved' then 'approved'
       when ll.approval_status = 'rejected' and ars.step_number = coalesce(ll.rejected_at_stage, 1) then 'rejected'
       else 'pending' end,
  ll.reviewed_at
from public.leadership_leaves ll
join private.approval_route_steps ars on ars.route_id = ll.approval_route_id
on conflict (leave_id, step_number) do nothing;

update public.leadership_leaves
set workflow_status = case approval_status
  when 'approved' then 'approved'
  when 'rejected' then 'rejected_stage_1'
  else case when current_approval_stage = 2 then 'pending_stage_2' else 'pending_stage_1' end
end
where workflow_status = 'pending_stage_1';

create or replace function public.review_queue_scoped(p_stage text default null)
returns table(
  id uuid, member_name text, member_rank text, leave_type text,
  start_date date, end_date date, total_days integer, status text,
  workflow_status text, current_approval_stage smallint,
  approval_status text, rejection_reason text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_account_type() not in ('admin', 'approver') then
    raise exception 'Unauthorized';
  end if;
  return query
  select ll.id, m.full_name, m.rank, coalesce(lt.name_ar, 'إجازة'),
    ll.start_date, ll.end_date, ll.total_days, ll.status,
    ll.workflow_status, ll.current_approval_stage,
    ll.approval_status, ll.rejection_reason, ll.reviewed_at
  from public.leadership_leaves ll
  join public.leadership_members m on m.id = ll.leadership_member_id
  left join public.leave_types lt on lt.id = ll.leave_type_id
  where ll.status <> 'cancelled'
    and ((ll.workflow_status = 'pending_stage_1' and
      private.has_permission('approve_undersecretary', ll.leadership_member_id, ll.id))
      or (ll.workflow_status = 'pending_stage_2' and
      private.has_permission('approve_minister', ll.leadership_member_id, ll.id)))
    and (p_stage is null or
      (p_stage = 'undersecretary' and ll.workflow_status = 'pending_stage_1') or
      (p_stage = 'minister' and ll.workflow_status = 'pending_stage_2'))
  order by ll.created_at desc
  limit 500;
end;
$$;

revoke all on function public.review_queue_scoped(text) from public, anon;
grant execute on function public.review_queue_scoped(text) to authenticated;

create or replace function public.review_leave_stage(
  p_leave_id uuid,
  p_decision text,
  p_reason text default null,
  p_confirm_forward boolean default false
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  leave_row public.leadership_leaves%rowtype;
  stage_code text;
  permission_code text;
  old_workflow text;
begin
  select * into leave_row from public.leadership_leaves
    where id = p_leave_id and status <> 'cancelled' for update;
  if leave_row.id is null then raise exception 'Leave not found'; end if;
  old_workflow := leave_row.workflow_status;
  if leave_row.workflow_status = 'pending_stage_1' then
    stage_code := 'undersecretary'; permission_code := 'approve_undersecretary';
  elsif leave_row.workflow_status = 'pending_stage_2' then
    stage_code := 'minister'; permission_code := 'approve_minister';
  elsif leave_row.workflow_status = 'approved' and p_decision = 'pending' then
    stage_code := 'minister'; permission_code := 'approve_minister';
  else
    raise exception 'This leave is not waiting for a decision';
  end if;
  if not private.has_permission(permission_code, leave_row.leadership_member_id, p_leave_id) then
    raise exception 'Unauthorized';
  end if;
  if p_decision not in ('approved', 'rejected', 'pending') then
    raise exception 'Invalid decision';
  end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Rejection reason is too long';
  end if;
  if p_decision = 'approved' and stage_code = 'undersecretary' and not p_confirm_forward then
    raise exception 'Forward confirmation is required';
  end if;
  if p_decision = 'pending' then
    if not private.has_permission('return_review_pending', leave_row.leadership_member_id, p_leave_id) then
      raise exception 'Unauthorized';
    end if;
    update public.leadership_leaves set workflow_status =
      case when stage_code = 'undersecretary' then 'pending_stage_1' else 'pending_stage_2' end,
      current_approval_stage = case when stage_code = 'undersecretary' then 1 else 2 end,
      approval_status = 'pending', rejection_reason = null,
      reviewed_by = null, reviewed_at = null, updated_by = auth.uid()
    where id = p_leave_id;
  elsif p_decision = 'rejected' then
    update public.leadership_leaves set workflow_status =
      case when stage_code = 'undersecretary' then 'rejected_stage_1' else 'rejected_stage_2' end,
      rejected_at_stage = current_approval_stage,
      approval_status = 'rejected', rejection_reason = nullif(btrim(p_reason), ''),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_by = auth.uid()
    where id = p_leave_id;
  elsif stage_code = 'undersecretary' then
    update public.leadership_leaves set workflow_status = 'pending_stage_2',
      current_approval_stage = 2, approval_status = 'pending',
      rejection_reason = null, reviewed_by = auth.uid(), reviewed_at = now(), updated_by = auth.uid()
    where id = p_leave_id;
  else
    update public.leadership_leaves set workflow_status = 'approved',
      current_approval_stage = 2, approval_status = 'approved',
      rejection_reason = null, reviewed_by = auth.uid(), reviewed_at = now(), updated_by = auth.uid()
    where id = p_leave_id;
  end if;
  update private.leave_approval_steps
  set status = case when p_decision = 'approved' then 'approved'
                    when p_decision = 'rejected' then 'rejected'
                    else 'pending' end,
      reviewer_id = auth.uid(), decided_at = now(), decision_reason = nullif(btrim(p_reason), '')
  where leave_id = p_leave_id and step_number = leave_row.current_approval_stage;
  if p_decision = 'approved' and stage_code = 'undersecretary' then
    update private.leave_approval_steps set status = 'pending'
    where leave_id = p_leave_id and step_number = 2;
  end if;
  insert into private.leave_workflow_events(leave_id, actor_id, event_code, from_state, to_state, reason)
  values (p_leave_id, auth.uid(),
    case when p_decision = 'approved' and stage_code = 'undersecretary' then 'forward_to_minister'
         when p_decision = 'approved' then 'approve_final'
         when p_decision = 'rejected' then 'reject_stage'
         else 'return_to_pending' end,
    old_workflow,
    (select workflow_status from public.leadership_leaves where id = p_leave_id),
    nullif(btrim(p_reason), ''));
  return true;
end;
$$;

revoke all on function public.review_leave_stage(uuid,text,text,boolean) from public, anon;
grant execute on function public.review_leave_stage(uuid,text,text,boolean) to authenticated;

create or replace function public.admin_reopen_leave(
  p_leave_id uuid,
  p_target_stage smallint,
  p_reason text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_state text; next_state text;
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  if p_target_stage not in (1, 2) then raise exception 'Invalid target stage'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  select workflow_status into old_state from public.leadership_leaves
    where id = p_leave_id and status <> 'cancelled' for update;
  if old_state is null then raise exception 'Leave not found'; end if;
  next_state := case when p_target_stage = 1 then 'pending_stage_1' else 'pending_stage_2' end;
  update public.leadership_leaves set workflow_status = next_state,
    current_approval_stage = p_target_stage, approval_status = 'pending',
    rejection_reason = null, rejected_at_stage = null,
    reviewed_by = null, reviewed_at = null, updated_by = auth.uid()
  where id = p_leave_id;
  update private.leave_approval_steps set status = 'pending', reviewer_id = null,
    decided_at = null, decision_reason = null
  where leave_id = p_leave_id and step_number >= p_target_stage;
  insert into private.leave_workflow_events(leave_id, actor_id, event_code, from_state, to_state, reason)
  values (p_leave_id, auth.uid(), 'admin_reopen_or_rewind', old_state, next_state, btrim(p_reason));
  return true;
end;
$$;

revoke all on function public.admin_reopen_leave(uuid,smallint,text) from public, anon;
grant execute on function public.admin_reopen_leave(uuid,smallint,text) to authenticated;

create or replace function public.admin_grant_permission(
  p_user_id uuid, p_permission text, p_scope_kind text, p_scope_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare grant_id uuid;
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from private.permission_catalog where code = p_permission) then raise exception 'Unknown permission'; end if;
  insert into private.permission_grants(user_id, permission_code, scope_kind, scope_id, created_by)
  values(p_user_id, p_permission, p_scope_kind, p_scope_id, auth.uid())
  on conflict (user_id, permission_code, scope_kind, scope_id)
  do update set is_allowed = true, created_by = auth.uid()
  returning id into grant_id;
  return grant_id;
end;
$$;

create or replace function public.admin_revoke_permission(
  p_user_id uuid, p_permission text, p_scope_kind text, p_scope_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  update private.permission_grants set is_allowed = false
  where user_id = p_user_id and permission_code = p_permission
    and scope_kind = p_scope_kind and scope_id is not distinct from p_scope_id;
  return true;
end;
$$;

revoke all on function public.admin_grant_permission(uuid,text,text,uuid) from public, anon;
revoke all on function public.admin_revoke_permission(uuid,text,text,uuid) from public, anon;
grant execute on function public.admin_grant_permission(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_revoke_permission(uuid,text,text,uuid) to authenticated;

create or replace function public.admin_list_user_permissions(p_user_id uuid)
returns table(permission_code text, scope_kind text, scope_id uuid, is_allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  return query select g.permission_code, g.scope_kind, g.scope_id, g.is_allowed
  from private.permission_grants g
  where g.user_id = p_user_id and g.is_allowed
  order by g.permission_code, g.scope_kind, g.scope_id;
end;
$$;

revoke all on function public.admin_list_user_permissions(uuid) from public, anon;
grant execute on function public.admin_list_user_permissions(uuid) to authenticated;

create or replace function public.my_permission_snapshot()
returns table(account_type text, permission_code text, scope_kind text, scope_id uuid)
language sql stable security definer set search_path = '' as $$
  select private.current_account_type(), g.permission_code, g.scope_kind, g.scope_id
  from private.permission_grants g
  where g.user_id = (select auth.uid()) and g.is_allowed
  order by g.permission_code, g.scope_kind, g.scope_id
$$;

revoke all on function public.my_permission_snapshot() from public, anon;
grant execute on function public.my_permission_snapshot() to authenticated;

create or replace function public.admin_set_account_type(p_user_id uuid, p_account_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if private.current_account_type() <> 'admin' then raise exception 'Unauthorized'; end if;
  if p_account_type not in ('admin', 'user', 'approver') then raise exception 'Invalid account type'; end if;
  update public.profiles set account_type = p_account_type,
    role = case when p_account_type = 'admin' then 'admin'
                when p_account_type = 'approver' then 'approver' else 'viewer' end
  where id = p_user_id;
  if not found then raise exception 'Profile not found'; end if;
  return true;
end;
$$;

revoke all on function public.admin_set_account_type(uuid,text) from public, anon;
grant execute on function public.admin_set_account_type(uuid,text) to authenticated;

-- Preserve legacy access during rollout. The administrator can narrow or
-- replace these grants through the admin permission RPCs before removing them.
do $$
declare p record; permission_code text;
begin
  for p in select id, role from public.profiles where is_active loop
    if p.role in ('viewer', 'supervisor') then
      foreach permission_code in array array['view_leaders','view_leaves'] loop
        if not exists (select 1 from private.permission_grants g where g.user_id=p.id
          and g.permission_code=permission_code and g.scope_kind='all' and g.scope_id is null) then
          insert into private.permission_grants(user_id,permission_code,scope_kind,created_by)
          values(p.id,permission_code,'all',p.id);
        end if;
      end loop;
    end if;
    if p.role = 'supervisor' then
      foreach permission_code in array array['create_leave','edit_any_leave','cancel_any_leave'] loop
        if not exists (select 1 from private.permission_grants g where g.user_id=p.id
          and g.permission_code=permission_code and g.scope_kind='all' and g.scope_id is null) then
          insert into private.permission_grants(user_id,permission_code,scope_kind,created_by)
          values(p.id,permission_code,'all',p.id);
        end if;
      end loop;
    elsif p.role = 'approver' then
      foreach permission_code in array array['approve_undersecretary','approve_minister','return_review_pending'] loop
        if not exists (select 1 from private.permission_grants g where g.user_id=p.id
          and g.permission_code=permission_code and g.scope_kind='all' and g.scope_id is null) then
          insert into private.permission_grants(user_id,permission_code,scope_kind,created_by)
          values(p.id,permission_code,'all',p.id);
        end if;
      end loop;
    end if;
  end loop;
end $$;

do $$
declare t text; p record;
begin
  foreach t in array array['assistant_undersecretaries','sectors','departments','leave_types',
    'leadership_members','leadership_leaves','audit_logs'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy assistant_undersecretaries_read on public.assistant_undersecretaries
  for select to authenticated using (private.has_any_permission('manage_organization'));
create policy assistant_undersecretaries_write on public.assistant_undersecretaries
  for all to authenticated using (private.has_any_permission('manage_organization'))
  with check (private.has_any_permission('manage_organization'));

create policy sectors_read_scoped on public.sectors
  for select to authenticated using (
    private.has_permission_in_org('view_leaders', id, null)
    or private.has_permission_in_org('view_leaves', id, null)
    or private.has_permission_in_org('create_leave', id, null)
  );
create policy sectors_write_scoped on public.sectors
  for insert to authenticated with check (private.has_any_permission('manage_organization'));
create policy sectors_update_scoped on public.sectors
  for update to authenticated using (private.has_any_permission('manage_organization'))
  with check (private.has_any_permission('manage_organization'));
create policy sectors_delete_scoped on public.sectors
  for delete to authenticated using (private.has_any_permission('manage_organization'));

create policy departments_read_scoped on public.departments
  for select to authenticated using (
    private.has_permission_in_org('view_leaders', sector_id, id)
    or private.has_permission_in_org('view_leaves', sector_id, id)
    or private.has_permission_in_org('create_leave', sector_id, id)
  );
create policy departments_write_scoped on public.departments
  for insert to authenticated with check (private.has_any_permission('manage_organization'));
create policy departments_update_scoped on public.departments
  for update to authenticated using (private.has_any_permission('manage_organization'))
  with check (private.has_any_permission('manage_organization'));
create policy departments_delete_scoped on public.departments
  for delete to authenticated using (private.has_any_permission('manage_organization'));

create policy members_read_scoped on public.leadership_members
  for select to authenticated using (
    private.has_permission_in_org('view_leaders', sector_id, department_id)
    or private.has_permission_in_org('view_leaves', sector_id, department_id)
    or private.has_permission_in_org('create_leave', sector_id, department_id)
  );
create policy members_insert_scoped on public.leadership_members
  for insert to authenticated with check (private.has_permission_in_org('create_leader', sector_id, department_id));
create policy members_update_scoped on public.leadership_members
  for update to authenticated using (
    private.has_permission_in_org('edit_leader', sector_id, department_id)
    or private.has_permission_in_org('archive_leader', sector_id, department_id)
  ) with check (
    private.has_permission_in_org('edit_leader', sector_id, department_id)
    or private.has_permission_in_org('archive_leader', sector_id, department_id)
  );
create policy members_delete_scoped on public.leadership_members
  for delete to authenticated using (private.has_permission_in_org('delete_leader', sector_id, department_id));

create policy leaves_read_scoped on public.leadership_leaves
  for select to authenticated using (
    private.has_permission('view_leaves', leadership_member_id, id)
    or private.has_permission('edit_own_leave', leadership_member_id, id)
    or private.has_permission('cancel_own_leave', leadership_member_id, id)
  );
create policy leaves_insert_scoped on public.leadership_leaves
  for insert to authenticated with check (
    private.has_permission_in_org('create_leave',
      (select sector_id from public.leadership_members where id = leadership_member_id),
      (select department_id from public.leadership_members where id = leadership_member_id))
  );
create policy leaves_update_scoped on public.leadership_leaves
  for update to authenticated using (
    private.has_permission('edit_any_leave', leadership_member_id, id)
    or private.has_permission('edit_own_leave', leadership_member_id, id)
    or private.has_permission('cancel_any_leave', leadership_member_id, id)
    or private.has_permission('cancel_own_leave', leadership_member_id, id)
    or private.has_permission('disable_leave', leadership_member_id, id)
  ) with check (
    private.has_permission('edit_any_leave', leadership_member_id, id)
    or private.has_permission('edit_own_leave', leadership_member_id, id)
    or private.has_permission('cancel_any_leave', leadership_member_id, id)
    or private.has_permission('cancel_own_leave', leadership_member_id, id)
    or private.has_permission('disable_leave', leadership_member_id, id)
  );
create policy leaves_delete_scoped on public.leadership_leaves
  for delete to authenticated using (private.has_permission('delete_leave', leadership_member_id, id));

create policy leave_types_read_scoped on public.leave_types
  for select to authenticated using (
    private.has_any_permission('view_leaves') or private.has_any_permission('create_leave')
  );
create policy leave_types_write_scoped on public.leave_types
  for all to authenticated using (private.has_any_permission('manage_leave_types'))
  with check (private.has_any_permission('manage_leave_types'));

create policy audit_logs_read_scoped on public.audit_logs
  for select to authenticated using (
    private.has_any_permission('view_audit_logs')
  );

-- Keep the legacy RPC name as a guarded compatibility wrapper. New clients
-- should use review_leave_stage/admin_reopen_leave directly.
create or replace function public.review_leave(
  p_leave_id uuid, p_decision text, p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare workflow text; target_stage smallint; old_approval text;
begin
  select workflow_status, current_approval_stage, approval_status
    into workflow, target_stage, old_approval
  from public.leadership_leaves where id = p_leave_id for update;
  if workflow is null then raise exception 'Leave not found'; end if;
  if old_approval = 'rejected' then
    if private.current_account_type() <> 'admin' then raise exception 'Only the administrator can reopen a rejected leave'; end if;
    return public.admin_reopen_leave(p_leave_id,
      case when workflow = 'rejected_stage_2' then 2 else 1 end,
      coalesce(nullif(btrim(p_reason), ''), 'إعادة فتح بواسطة مدير النظام'));
  end if;
  return public.review_leave_stage(
    p_leave_id, p_decision, p_reason,
    p_decision = 'approved' and workflow = 'pending_stage_1');
end;
$$;

revoke all on function public.review_leave(uuid,text,text) from public, anon;
grant execute on function public.review_leave(uuid,text,text) to authenticated;
