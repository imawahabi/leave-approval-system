-- A rejection is final for approvers even when no explanation is entered.
-- Keep the existing role and transition checks while allowing a null reason.
create or replace function private.enforce_leave_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.current_role(); substantive_change boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.approval_status := 'pending';
      new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
    end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  if old.approval_status = 'rejected' and actor_role <> 'admin' then
    raise exception 'Rejected leave can only be reopened by the administrator';
  end if;
  substantive_change := row(new.leadership_member_id,new.leave_type_id,new.start_date,new.end_date,
      new.return_date,new.total_days,new.notes,new.substitute_member_id,new.attachment_url)
     is distinct from row(old.leadership_member_id,old.leave_type_id,old.start_date,old.end_date,
      old.return_date,old.total_days,old.notes,old.substitute_member_id,old.attachment_url);
  if substantive_change then
    new.approval_status := 'pending';
    new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
  elsif new.approval_status is distinct from old.approval_status then
    if old.approval_status='pending' and new.approval_status in ('approved','rejected')
       and actor_role in ('admin','approver') then
      if new.approval_status='rejected' then
        new.rejection_reason := nullif(btrim(new.rejection_reason), '');
        if length(new.rejection_reason) > 500 then
          raise exception 'Rejection reason is too long';
        end if;
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    elsif old.approval_status='approved' and new.approval_status='pending'
       and actor_role in ('admin','approver') then
      new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
    elsif old.approval_status='rejected' and new.approval_status='pending' and actor_role='admin' then
      new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
    else
      raise exception 'Invalid leave review transition';
    end if;
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
  if p_decision='rejected' and length(btrim(coalesce(p_reason,''))) > 500 then
    raise exception 'Rejection reason is too long';
  end if;
  update public.leadership_leaves set approval_status=p_decision,
    rejection_reason=case when p_decision='rejected' then nullif(btrim(p_reason),'') else null end
  where id=p_leave_id;
  return true;
end;
$$;
revoke all on function public.review_leave(uuid,text,text) from public, anon;
grant execute on function public.review_leave(uuid,text,text) to authenticated;
