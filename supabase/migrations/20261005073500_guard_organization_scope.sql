-- Keep future permission scopes unambiguous when editing the hierarchy.
create function private.validate_organization_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  linked_unit public.assistant_undersecretaries%rowtype;
begin
  if new.parent_sector_id is not null and new.assistant_undersecretary_id is not null then
    select * into linked_unit from public.assistant_undersecretaries
    where id = new.assistant_undersecretary_id;
    if linked_unit.id is null or linked_unit.unit_kind <> 'undersecretary'
      or linked_unit.legacy_sector_id is distinct from new.id then
      raise exception 'A sector cannot have both a sector parent and an assistant parent';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_organization_scope() from public, anon, authenticated;
create trigger validate_organization_scope
  before insert or update of parent_sector_id, assistant_undersecretary_id on public.sectors
  for each row execute function private.validate_organization_scope();

create function private.audit_organization_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.parent_sector_id is distinct from new.parent_sector_id then
    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
    values(auth.uid(),'assign_sector_parent','sectors',new.id,
      jsonb_build_object('parent_sector_id',old.parent_sector_id),
      jsonb_build_object('parent_sector_id',new.parent_sector_id));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_organization_parent() from public, anon, authenticated;
create trigger audit_organization_parent
  after update of parent_sector_id on public.sectors
  for each row execute function private.audit_organization_parent();

create function private.audit_assistant_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.parent_id is distinct from new.parent_id
     or old.unit_kind is distinct from new.unit_kind then
    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
    values(auth.uid(),'assign_assistant_parent','assistant_undersecretaries',new.id,
      jsonb_build_object('parent_id',old.parent_id,'unit_kind',old.unit_kind),
      jsonb_build_object('parent_id',new.parent_id,'unit_kind',new.unit_kind));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_assistant_parent() from public, anon, authenticated;
create trigger audit_assistant_parent
  after update of parent_id, unit_kind on public.assistant_undersecretaries
  for each row execute function private.audit_assistant_parent();
