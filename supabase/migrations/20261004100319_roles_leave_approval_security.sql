-- Authorization is checked against the current database row, never user metadata.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'supervisor', 'approver', 'viewer'));

create or replace function private.current_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true
$$;
revoke all on function private.current_role() from public;
grant execute on function private.current_role() to authenticated;

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true)
$$;
revoke all on function private.is_active_user() from public;
grant execute on function private.is_active_user() to authenticated;

create or replace function private.can_edit()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.current_role() in ('admin','supervisor','approver')), false)
$$;
revoke all on function private.can_edit() from public;
grant execute on function private.can_edit() to authenticated;

create or replace function private.can_approve()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.current_role() in ('admin','approver')), false)
$$;
revoke all on function private.can_approve() from public;
grant execute on function private.can_approve() to authenticated;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.current_role() = 'admin'), false)
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- Remove the old first-signup-becomes-admin behavior and ignore client metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,full_name,role,is_active)
  values(new.id,coalesce(new.email,''),'','viewer',false)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- No account can insert/update its own profile or elevate its own role.
drop policy if exists profiles_insert_own_or_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (private.is_active_user() and (id = (select auth.uid()) or private.can_edit()));
create policy profiles_admin_update on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (private.is_admin());

create or replace function private.protect_last_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.is_active = true
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.is_active = false)
     and not exists(select 1 from public.profiles p
       where p.id <> old.id and p.role = 'admin' and p.is_active = true) then
    raise exception 'The last active administrator cannot be removed';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin before update or delete on public.profiles
for each row execute function private.protect_last_admin();

alter table public.leadership_leaves
  add column if not exists approval_status text not null default 'pending',
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;
update public.leadership_leaves set approval_status = 'approved'
  where approval_status = 'pending'; -- existing records predate approval workflow
alter table public.leadership_leaves drop constraint if exists leadership_leaves_approval_status_check;
alter table public.leadership_leaves add constraint leadership_leaves_approval_status_check
  check (approval_status in ('pending','approved','rejected'));
create index if not exists leadership_leaves_approval_status_idx
  on public.leadership_leaves(approval_status,start_date,end_date);

create or replace function private.enforce_leave_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.current_role();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.approval_status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.rejection_reason := null;
    end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  if row(new.leadership_member_id,new.leave_type_id,new.start_date,new.end_date,
      new.return_date,new.total_days,new.notes,new.substitute_member_id,new.attachment_url)
     is distinct from row(old.leadership_member_id,old.leave_type_id,old.start_date,old.end_date,
      old.return_date,old.total_days,old.notes,old.substitute_member_id,old.attachment_url) then
    new.approval_status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  elsif new.approval_status is distinct from old.approval_status then
    if actor_role not in ('admin','approver') then
      raise exception 'Only an approver can review a leave';
    end if;
    if old.approval_status <> 'pending' or new.approval_status not in ('approved','rejected') then
      raise exception 'Invalid leave review transition';
    end if;
    if new.approval_status = 'rejected' and nullif(trim(new.rejection_reason),'') is null then
      raise exception 'A rejection reason is required';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.rejection_reason := old.rejection_reason;
  end if;
  new.created_by := old.created_by;
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists enforce_leave_review on public.leadership_leaves;
create trigger enforce_leave_review before insert or update on public.leadership_leaves
for each row execute function private.enforce_leave_review();

-- Replace broad policies, including the old 'true' read grants.
do $$
declare t text; p record;
begin
  foreach t in array array['sectors','departments','leave_types','leadership_members','leadership_leaves','audit_logs'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $$;

create policy sectors_read on public.sectors for select to authenticated using (private.is_active_user());
create policy sectors_insert on public.sectors for insert to authenticated with check (private.can_edit());
create policy sectors_update on public.sectors for update to authenticated using (private.can_edit()) with check (private.can_edit());
create policy sectors_delete on public.sectors for delete to authenticated using (private.is_admin());
create policy departments_read on public.departments for select to authenticated using (private.is_active_user());
create policy departments_insert on public.departments for insert to authenticated with check (private.can_edit());
create policy departments_update on public.departments for update to authenticated using (private.can_edit()) with check (private.can_edit());
create policy departments_delete on public.departments for delete to authenticated using (private.is_admin());
create policy leave_types_read on public.leave_types for select to authenticated using (private.is_active_user());
create policy leave_types_insert on public.leave_types for insert to authenticated with check (private.can_edit());
create policy leave_types_update on public.leave_types for update to authenticated using (private.can_edit()) with check (private.can_edit());
create policy leave_types_delete on public.leave_types for delete to authenticated using (private.is_admin());
create policy members_read on public.leadership_members for select to authenticated using (private.is_active_user());
create policy members_insert on public.leadership_members for insert to authenticated with check (private.can_edit());
create policy members_update on public.leadership_members for update to authenticated using (private.can_edit()) with check (private.can_edit());
create policy members_delete on public.leadership_members for delete to authenticated using (private.is_admin());
create policy leaves_read on public.leadership_leaves for select to authenticated
  using (private.is_active_user() and (approval_status = 'approved' or private.can_edit()));
create policy leaves_insert on public.leadership_leaves for insert to authenticated with check (private.can_edit());
create policy leaves_update on public.leadership_leaves for update to authenticated
  using (private.can_edit()) with check (private.can_edit());
create policy leaves_delete on public.leadership_leaves for delete to authenticated using (private.is_admin());
create policy audit_read on public.audit_logs for select to authenticated using (private.can_edit());
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (private.can_edit() and user_id = (select auth.uid()));

-- Views must use the caller's RLS and exclude unapproved leaves from every dashboard.
create or replace view public.leadership_current_status
with (security_invoker = true) as
select lm.id,lm.full_name,lm.file_number,lm.rank,lm.job_title,lm.sector_id,
 s.name_ar as sector_name,lm.department_id,d.name_ar as department_name,
 lm.workplace,lm.is_active,ll.id as current_leave_id,ll.leave_type_id,
 lt.name_ar as current_leave_type,ll.start_date as current_leave_start,
 ll.end_date as current_leave_end,ll.return_date as current_leave_return,
 ll.total_days as current_leave_days,ll.status as leave_status,
 ll.notes as current_leave_notes
from public.leadership_members lm
left join public.sectors s on lm.sector_id=s.id
left join public.departments d on lm.department_id=d.id
left join public.leadership_leaves ll on lm.id=ll.leadership_member_id
  and ll.approval_status='approved' and ll.status<>'cancelled'
  and ll.start_date <= (now() at time zone 'Asia/Kuwait')::date
  and ll.end_date >= (now() at time zone 'Asia/Kuwait')::date
left join public.leave_types lt on ll.leave_type_id=lt.id
where lm.is_active=true;
