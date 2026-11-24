-- An optional organizational level above sectors. Existing sectors stay unassigned.
create table public.assistant_undersecretaries (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assistant_undersecretaries enable row level security;
revoke all on public.assistant_undersecretaries from anon;
grant select, insert, update, delete on public.assistant_undersecretaries to authenticated;

create policy assistant_undersecretaries_read on public.assistant_undersecretaries
  for select to authenticated
  using (private.current_role() in ('admin', 'supervisor', 'viewer'));
create policy assistant_undersecretaries_insert on public.assistant_undersecretaries
  for insert to authenticated with check (private.can_edit());
create policy assistant_undersecretaries_update on public.assistant_undersecretaries
  for update to authenticated using (private.can_edit()) with check (private.can_edit());
create policy assistant_undersecretaries_delete on public.assistant_undersecretaries
  for delete to authenticated using (private.is_admin());

create trigger update_assistant_undersecretaries_updated_at
  before update on public.assistant_undersecretaries
  for each row execute function public.update_updated_at_column();

alter table public.sectors
  add column assistant_undersecretary_id uuid
  references public.assistant_undersecretaries(id) on delete restrict;
create index idx_sectors_assistant_undersecretary
  on public.sectors(assistant_undersecretary_id);

-- Record hierarchy edits without changing the existing audit trigger for other tables.
create function private.audit_organizational_hierarchy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  action_name text;
  target_id uuid;
  before_values jsonb;
  after_values jsonb;
begin
  if tg_table_schema <> 'public' then raise exception 'Unsupported audit source'; end if;
  if tg_table_name = 'sectors' and tg_op = 'UPDATE' then
    if old.assistant_undersecretary_id is not distinct from new.assistant_undersecretary_id then return new; end if;
    action_name := 'assign_sector_undersecretary';
    target_id := new.id;
    before_values := jsonb_build_object('assistant_undersecretary_id',old.assistant_undersecretary_id);
    after_values := jsonb_build_object('assistant_undersecretary_id',new.assistant_undersecretary_id);
  elsif tg_table_name = 'assistant_undersecretaries' then
    action_name := case tg_op when 'INSERT' then 'create_assistant_undersecretary'
      when 'DELETE' then 'delete_assistant_undersecretary' else 'update_assistant_undersecretary' end;
    target_id := case when tg_op = 'DELETE' then old.id else new.id end;
    if tg_op <> 'INSERT' then
      before_values := jsonb_build_object('name_ar',old.name_ar,'name_en',old.name_en,
        'is_active',old.is_active,'sort_order',old.sort_order);
    end if;
    if tg_op <> 'DELETE' then
      after_values := jsonb_build_object('name_ar',new.name_ar,'name_en',new.name_en,
        'is_active',new.is_active,'sort_order',new.sort_order);
    end if;
  else
    raise exception 'Unsupported audit source';
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
  values(auth.uid(),action_name,tg_table_name,target_id,before_values,after_values);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_organizational_hierarchy() from public, anon, authenticated;

create trigger audit_assistant_undersecretaries_change
  after insert or update or delete on public.assistant_undersecretaries
  for each row execute function private.audit_organizational_hierarchy();
create trigger audit_sector_undersecretary_change
  after update of assistant_undersecretary_id on public.sectors
  for each row execute function private.audit_organizational_hierarchy();
