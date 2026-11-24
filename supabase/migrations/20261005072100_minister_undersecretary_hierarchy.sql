-- Add the missing levels without changing existing sector, department, or leader IDs.
alter table public.assistant_undersecretaries
  add column unit_kind text not null default 'assistant'
    check (unit_kind in ('undersecretary', 'assistant')),
  add column parent_id uuid references public.assistant_undersecretaries(id) on delete restrict;

alter table public.assistant_undersecretaries
  add constraint assistant_parent_kind_check
  check (unit_kind = 'assistant' or parent_id is null);

create index idx_assistant_undersecretaries_parent
  on public.assistant_undersecretaries(parent_id);

alter table public.sectors
  add column parent_sector_id uuid references public.sectors(id) on delete restrict;

alter table public.sectors
  add constraint sectors_not_own_parent check (parent_sector_id is distinct from id);

create index idx_sectors_parent_sector on public.sectors(parent_sector_id);

do $$
declare
  minister_sector_id uuid;
  undersecretary_sector_id uuid;
  undersecretary_id uuid;
  expected_count integer;
  changed_count integer;
begin
  with names(name_ar) as (values
    ('رئيس الجهة'), ('المدير العام'),
    ('قطاع شئون مكتب رئيس الجهة'), ('جهاز أمن الدولة')
  )
  select count(*) into expected_count from names n
  where (select count(*) from public.sectors s where s.name_ar = n.name_ar
    and s.assistant_undersecretary_id is null) = 1;
  if expected_count <> 4 then
    raise exception 'Minister/undersecretary records differ from reviewed hierarchy';
  end if;
  if (select count(*) from public.assistant_undersecretaries) <> 2
    or (select count(*) from public.assistant_undersecretaries
        where name_ar in ('شئون الأمن العام','شئون الخدمات الأمنية المساندة')
          and legacy_sector_id is not null and parent_id is null) <> 2
    or (select count(*) from public.sectors where parent_sector_id is not null) <> 0 then
    raise exception 'Existing assistant hierarchy differs from reviewed state';
  end if;

  select id into minister_sector_id from public.sectors where name_ar = 'رئيس الجهة';
  select id into undersecretary_sector_id from public.sectors where name_ar = 'المدير العام';

  insert into public.assistant_undersecretaries
    (name_ar, legacy_sector_id, unit_kind, sort_order)
  values ('المدير العام', undersecretary_sector_id, 'undersecretary', 0)
  returning id into undersecretary_id;

  update public.assistant_undersecretaries
  set parent_id = undersecretary_id
  where name_ar in ('شئون الأمن العام','شئون الخدمات الأمنية المساندة');
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then raise exception 'Expected exactly two assistant links'; end if;

  update public.sectors
  set assistant_undersecretary_id = undersecretary_id
  where id = undersecretary_sector_id;

  update public.sectors
  set parent_sector_id = minister_sector_id
  where id in (undersecretary_sector_id,
    (select id from public.sectors where name_ar = 'قطاع شئون مكتب رئيس الجهة'),
    (select id from public.sectors where name_ar = 'جهاز أمن الدولة'));
  get diagnostics changed_count = row_count;
  if changed_count <> 3 then raise exception 'Expected exactly three minister children'; end if;
end $$;
