create or replace function public.review_queue()
returns table(
  id uuid, member_name text, member_rank text, leave_type text,
  start_date date, end_date date, total_days integer, status text,
  approval_status text, rejection_reason text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_approve() then raise exception 'Unauthorized'; end if;
  return query select ll.id,m.full_name,m.rank,coalesce(lt.name_ar,'إجازة'),
    ll.start_date,ll.end_date,ll.total_days,ll.status,ll.approval_status,
    ll.rejection_reason,ll.reviewed_at
  from public.leadership_leaves ll
  join public.leadership_members m on m.id=ll.leadership_member_id
  left join public.leave_types lt on lt.id=ll.leave_type_id
  where ll.status <> 'cancelled'
  order by case ll.approval_status when 'pending' then 0 when 'approved' then 1 else 2 end,
    ll.created_at desc
  limit 500;
end;
$$;
revoke all on function public.review_queue() from public, anon;
grant execute on function public.review_queue() to authenticated;

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
  update public.leadership_leaves set approval_status=p_decision,
    rejection_reason=case when p_decision='rejected' then left(trim(p_reason),500) else null end
  where id=p_leave_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
  values(auth.uid(),case
      when p_decision='approved' then 'approve_leave'
      when old_status='approved' then 'undo_approve_leave'
      when old_status='rejected' then 'reopen_rejected_leave'
      else 'reject_leave' end,
    'leadership_leaves',p_leave_id,
    jsonb_build_object('approval_status',old_status),
    jsonb_build_object('approval_status',p_decision,'reason',p_reason));
  return true;
end;
$$;
revoke all on function public.review_leave(uuid,text,text) from public, anon;
grant execute on function public.review_leave(uuid,text,text) to authenticated;
