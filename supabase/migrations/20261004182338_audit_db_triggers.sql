-- Audit records must describe committed row changes, not browser-supplied claims.
-- Keep private identifiers, notes and attachments out of the public audit payload.
create or replace function private.audit_app_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  after_row jsonb;
  before_values jsonb;
  after_values jsonb;
  action_name text;
  target_id uuid;
  substantive_leave_change boolean;
begin
  if tg_table_schema <> 'public' or tg_table_name not in
    ('leadership_members','leadership_leaves','sectors','departments','leave_types') then
    raise exception 'Unsupported audit source';
  end if;

  if tg_op <> 'INSERT' then before_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then after_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and
    (before_row - array['updated_at','updated_by']) = (after_row - array['updated_at','updated_by']) then
    return new;
  end if;

  if tg_table_name = 'leadership_members' then
    if before_row is not null then
      before_values := jsonb_build_object(
        'full_name',before_row->'full_name','rank',before_row->'rank',
        'job_title',before_row->'job_title','sector_id',before_row->'sector_id',
        'department_id',before_row->'department_id','workplace',before_row->'workplace',
        'is_active',before_row->'is_active');
    end if;
    if after_row is not null then
      after_values := jsonb_build_object(
        'full_name',after_row->'full_name','rank',after_row->'rank',
        'job_title',after_row->'job_title','sector_id',after_row->'sector_id',
        'department_id',after_row->'department_id','workplace',after_row->'workplace',
        'is_active',after_row->'is_active');
      if tg_op = 'UPDATE' then
        after_values := after_values || jsonb_build_object(
          'file_number_changed',before_row->'file_number' is distinct from after_row->'file_number',
          'phone_changed',before_row->'phone_number' is distinct from after_row->'phone_number',
          'notes_changed',before_row->'notes' is distinct from after_row->'notes');
      end if;
    end if;
    action_name := case
      when tg_op = 'INSERT' then 'create_member'
      when tg_op = 'DELETE' then 'delete_member'
      when before_row->>'is_active' = 'true' and after_row->>'is_active' = 'false' then 'archive_member'
      else 'update_member' end;

  elsif tg_table_name = 'leadership_leaves' then
    if before_row is not null then
      before_values := jsonb_build_object(
        'leadership_member_id',before_row->'leadership_member_id',
        'leave_type_id',before_row->'leave_type_id',
        'start_date',before_row->'start_date','end_date',before_row->'end_date',
        'return_date',before_row->'return_date','total_days',before_row->'total_days',
        'status',before_row->'status','approval_status',before_row->'approval_status');
    end if;
    if after_row is not null then
      after_values := jsonb_build_object(
        'leadership_member_id',after_row->'leadership_member_id',
        'leave_type_id',after_row->'leave_type_id',
        'start_date',after_row->'start_date','end_date',after_row->'end_date',
        'return_date',after_row->'return_date','total_days',after_row->'total_days',
        'status',after_row->'status','approval_status',after_row->'approval_status');
      if tg_op = 'UPDATE' then
        after_values := after_values || jsonb_build_object(
          'notes_changed',before_row->'notes' is distinct from after_row->'notes',
          'attachment_changed',before_row->'attachment_url' is distinct from after_row->'attachment_url',
          'rejection_reason_changed',before_row->'rejection_reason' is distinct from after_row->'rejection_reason');
      end if;
    end if;
    substantive_leave_change := tg_op = 'UPDATE' and
      (before_row - array['approval_status','reviewed_by','reviewed_at','rejection_reason','updated_at','updated_by'])
      is distinct from
      (after_row - array['approval_status','reviewed_by','reviewed_at','rejection_reason','updated_at','updated_by']);
    action_name := case
      when tg_op = 'INSERT' then 'create_leave'
      when tg_op = 'DELETE' then 'delete_leave'
      when after_row->>'status' = 'cancelled' and before_row->>'status' is distinct from 'cancelled' then 'cancel_leave'
      when substantive_leave_change then 'update_leave'
      when before_row->>'approval_status' is distinct from after_row->>'approval_status' then
        case
          when after_row->>'approval_status' = 'approved' then 'approve_leave'
          when after_row->>'approval_status' = 'rejected' then 'reject_leave'
          when before_row->>'approval_status' = 'approved' then 'undo_approve_leave'
          when before_row->>'approval_status' = 'rejected' then 'reopen_rejected_leave'
          else 'update_leave' end
      else 'update_leave' end;

  else
    if before_row is not null then
      before_values := jsonb_build_object(
        'name_ar',before_row->'name_ar','name_en',before_row->'name_en',
        'is_active',before_row->'is_active','sort_order',before_row->'sort_order');
      if tg_table_name = 'departments' then
        before_values := before_values || jsonb_build_object('sector_id',before_row->'sector_id');
      end if;
    end if;
    if after_row is not null then
      after_values := jsonb_build_object(
        'name_ar',after_row->'name_ar','name_en',after_row->'name_en',
        'is_active',after_row->'is_active','sort_order',after_row->'sort_order');
      if tg_table_name = 'departments' then
        after_values := after_values || jsonb_build_object('sector_id',after_row->'sector_id');
      end if;
    end if;
    action_name := case tg_op
      when 'INSERT' then 'create_' || case tg_table_name when 'sectors' then 'sector' when 'departments' then 'department' else 'leave_type' end
      when 'DELETE' then 'delete_' || case tg_table_name when 'sectors' then 'sector' when 'departments' then 'department' else 'leave_type' end
      else 'update_' || case tg_table_name when 'sectors' then 'sector' when 'departments' then 'department' else 'leave_type' end end;
  end if;

  target_id := coalesce(after_row->>'id',before_row->>'id')::uuid;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
  values(auth.uid(),action_name,tg_table_name,target_id,before_values,after_values);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_app_change() from public, anon, authenticated;

create trigger audit_members_change after insert or update or delete on public.leadership_members
  for each row execute function private.audit_app_change();
create trigger audit_leaves_change after insert or update or delete on public.leadership_leaves
  for each row execute function private.audit_app_change();
create trigger audit_sectors_change after insert or update or delete on public.sectors
  for each row execute function private.audit_app_change();
create trigger audit_departments_change after insert or update or delete on public.departments
  for each row execute function private.audit_app_change();
create trigger audit_leave_types_change after insert or update or delete on public.leave_types
  for each row execute function private.audit_app_change();

-- The row trigger writes the review record in the same transaction as the decision.
create or replace function public.review_leave(
  p_leave_id uuid,p_decision text,p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_status text; actor_role text := private.current_role();
begin
  if actor_role not in ('admin','approver') then raise exception 'Unauthorized'; end if;
  select approval_status into old_status from public.leadership_leaves
    where id=p_leave_id and status <> 'cancelled' for update;
  if old_status is null then raise exception 'Leave not found'; end if;
  if not (
    (old_status='pending' and p_decision in ('approved','rejected')) or
    (old_status='approved' and p_decision='pending') or
    (old_status='rejected' and p_decision='pending' and actor_role='admin')
  ) then raise exception 'Invalid leave review transition'; end if;
  if p_decision='rejected' and nullif(trim(p_reason),'') is null then
    raise exception 'A rejection reason is required';
  end if;
  if p_decision='rejected' and length(trim(p_reason)) > 500 then
    raise exception 'Rejection reason is too long';
  end if;
  update public.leadership_leaves set approval_status=p_decision,
    rejection_reason=case when p_decision='rejected' then trim(p_reason) else null end
  where id=p_leave_id;
  return true;
end;
$$;

-- Client-generated audit rows can be forged even when their user_id is checked.
drop policy if exists audit_insert on public.audit_logs;
revoke insert on table public.audit_logs from authenticated;
