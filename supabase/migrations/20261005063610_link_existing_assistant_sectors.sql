-- Preserve every existing sector, department and leader ID. The two old
-- "sectors" for assistant offices remain as compatibility anchors for leaders.
alter table public.assistant_undersecretaries
  add column legacy_sector_id uuid unique
  references public.sectors(id) on delete restrict;

do $$
declare
  security_sector_id uuid;
  support_sector_id uuid;
  security_under_id uuid;
  support_under_id uuid;
  matched_count integer;
  updated_count integer;
begin
  -- Fail before writing if the live names or current assignments differ.
  if exists (select 1 from public.assistant_undersecretaries) then
    raise exception 'Assistant undersecretaries already exist; review mapping first';
  end if;
  if exists (select 1 from public.sectors where assistant_undersecretary_id is not null) then
    raise exception 'Some sectors already have assistant undersecretaries; review mapping first';
  end if;

  with targets(name_ar) as (values
    ('شئون الأمن العام'),
    ('قطاع شئون الأمن الخاص والمؤسسات الإصلاحية'),
    ('قطاع شئون أمن الحدود وخفر السواحل'),
    ('قطاع شئون الأمن الجنائي'),
    ('قطاع شئون مديريات الأمن'),
    ('قطاع شئون المرور والعمليات'),
    ('شئون الخدمات الأمنية المساندة'),
    ('قطاع الموارد البشرية وتقنية المعلومات'),
    ('قطاع شئون الجنسية والإقامة'),
    ('قطاع شئون أمن المنافذ'),
    ('قطاع شئون المالية والخدمات المساندة'),
    ('قطاع شئون التعليم والتدريب')
  )
  select count(*) into matched_count
  from targets t
  where (select count(*) from public.sectors s where s.name_ar = t.name_ar) = 1;
  if matched_count <> 12 then
    raise exception 'Expected exactly 12 unique existing organizational records, found %', matched_count;
  end if;

  select id into security_sector_id from public.sectors where name_ar = 'شئون الأمن العام';
  select id into support_sector_id from public.sectors where name_ar = 'شئون الخدمات الأمنية المساندة';
  if (select count(*) from public.departments where sector_id = security_sector_id
      and name_ar = 'الإدارة العامة لشئون مساعد المدير العام للأمن العام') <> 1
    or (select count(*) from public.departments where sector_id = support_sector_id
      and name_ar = 'الإدارة العامة لشئون مساعد المدير العام للخدمات الأمنية المساندة') <> 1 then
    raise exception 'Assistant office departments differ from the reviewed hierarchy';
  end if;

  insert into public.assistant_undersecretaries(name_ar, legacy_sector_id, sort_order)
  values ('شئون الأمن العام', security_sector_id, 1)
  returning id into security_under_id;
  insert into public.assistant_undersecretaries(name_ar, legacy_sector_id, sort_order)
  values ('شئون الخدمات الأمنية المساندة', support_sector_id, 2)
  returning id into support_under_id;

  with targets(name_ar, under_id) as (values
    ('شئون الأمن العام', security_under_id),
    ('قطاع شئون الأمن الخاص والمؤسسات الإصلاحية', security_under_id),
    ('قطاع شئون أمن الحدود وخفر السواحل', security_under_id),
    ('قطاع شئون الأمن الجنائي', security_under_id),
    ('قطاع شئون مديريات الأمن', security_under_id),
    ('قطاع شئون المرور والعمليات', security_under_id),
    ('شئون الخدمات الأمنية المساندة', support_under_id),
    ('قطاع الموارد البشرية وتقنية المعلومات', support_under_id),
    ('قطاع شئون الجنسية والإقامة', support_under_id),
    ('قطاع شئون أمن المنافذ', support_under_id),
    ('قطاع شئون المالية والخدمات المساندة', support_under_id),
    ('قطاع شئون التعليم والتدريب', support_under_id)
  )
  update public.sectors s
  set assistant_undersecretary_id = t.under_id
  from targets t
  where s.name_ar = t.name_ar;
  get diagnostics updated_count = row_count;
  if updated_count <> 12 then
    raise exception 'Expected 12 sector assignments, updated %', updated_count;
  end if;
end $$;
