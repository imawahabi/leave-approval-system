-- Return one approval stage at a time. A null stage is rejected so callers
-- cannot accidentally combine the undersecretary and minister queues.
create or replace function public.review_queue_scoped(p_stage text default null)
returns table(
  id uuid, member_name text, member_rank text, leave_type text,
  start_date date, end_date date, total_days integer, status text,
  workflow_status text, current_approval_stage smallint,
  approval_status text, rejection_reason text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare stage_permission text;
begin
  if private.current_account_type() not in ('admin', 'approver') then
    raise exception 'Unauthorized';
  end if;
  if p_stage not in ('undersecretary', 'minister') then
    raise exception 'Approval stage is required';
  end if;
  stage_permission := case p_stage
    when 'undersecretary' then 'approve_undersecretary'
    else 'approve_minister'
  end;

  return query
  select ll.id, m.full_name, m.rank, coalesce(lt.name_ar, 'إجازة'),
    ll.start_date, ll.end_date, ll.total_days, ll.status,
    ll.workflow_status, ll.current_approval_stage,
    las.status, las.decision_reason, las.decided_at
  from public.leadership_leaves ll
  join public.leadership_members m on m.id = ll.leadership_member_id
  join private.leave_approval_steps las on las.leave_id = ll.id
  left join public.leave_types lt on lt.id = ll.leave_type_id
  where ll.status <> 'cancelled'
    and las.stage_code = p_stage
    and private.has_permission(stage_permission, ll.leadership_member_id, ll.id)
    and (
      (las.status in ('approved', 'rejected'))
      or (las.status = 'pending' and (
        (p_stage = 'undersecretary' and ll.workflow_status = 'pending_stage_1')
        or (p_stage = 'minister' and ll.workflow_status = 'pending_stage_2')
      ))
    )
  order by coalesce(las.decided_at, ll.created_at) desc
  limit 500;
end;
$$;

revoke all on function public.review_queue_scoped(text) from public, anon;
grant execute on function public.review_queue_scoped(text) to authenticated;

notify pgrst, 'reload schema';
