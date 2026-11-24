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
      old.return_date,old.total_days,old.notes,old.substitute_member_id,old.attachment_url)
     or (old.approval_status='rejected' and new.approval_status='pending') then
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
