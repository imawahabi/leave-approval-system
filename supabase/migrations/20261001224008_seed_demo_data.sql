/*
# Seed Demo Leadership Members and Leaves

## Overview
Populates the system with 18 fictional leadership members across all sectors
and departments, with a mix of past, current, and upcoming leaves.

## Data
- 18 leadership members with various ranks (from المدير العام down to مساعد مدير عام)
- ~30 leave records covering past, active, upcoming, and cancelled statuses
- All data is fictional - no real personnel data
*/

-- First, let's get the sector and department IDs
DO $$
DECLARE
  s_public_security uuid;
  s_traffic uuid;
  s_citizenship uuid;
  s_residency uuid;
  s_emergencies uuid;
  s_admin uuid;
  d_ops uuid;
  d_invest uuid;
  d_gen_traffic uuid;
  d_licensing uuid;
  d_citizenship uuid;
  d_passports uuid;
  d_residency uuid;
  d_foreigners uuid;
  d_central_emerg uuid;
  d_rescue uuid;
  d_hr uuid;
  d_finance uuid;
  lt_annual uuid;
  lt_special uuid;
  lt_sick uuid;
  lt_mission uuid;
  lt_other uuid;
BEGIN
  SELECT id INTO s_public_security FROM public.sectors WHERE name_ar = 'قطاع العمليات';
  SELECT id INTO s_traffic FROM public.sectors WHERE name_ar = 'قطاع الخدمات الميدانية';
  SELECT id INTO s_citizenship FROM public.sectors WHERE name_ar = 'قطاع الوثائق والهوية';
  SELECT id INTO s_residency FROM public.sectors WHERE name_ar = 'قطاع الشؤون العامة';
  SELECT id INTO s_emergencies FROM public.sectors WHERE name_ar = 'قطاع الطوارئ';
  SELECT id INTO s_admin FROM public.sectors WHERE name_ar = 'القطاع الإداري';

  SELECT id INTO d_ops FROM public.departments WHERE name_ar = 'إدارة العمليات';
  SELECT id INTO d_invest FROM public.departments WHERE name_ar = 'إدارة المتابعة والتنسيق';
  SELECT id INTO d_gen_traffic FROM public.departments WHERE name_ar = 'إدارة الخدمات الميدانية';
  SELECT id INTO d_licensing FROM public.departments WHERE name_ar = 'إدارة التراخيص';
  SELECT id INTO d_citizenship FROM public.departments WHERE name_ar = 'إدارة الهوية';
  SELECT id INTO d_passports FROM public.departments WHERE name_ar = 'إدارة الوثائق';
  SELECT id INTO d_residency FROM public.departments WHERE name_ar = 'إدارة الخدمات العامة';
  SELECT id INTO d_foreigners FROM public.departments WHERE name_ar = 'إدارة شؤون المراجعين';
  SELECT id INTO d_central_emerg FROM public.departments WHERE name_ar = 'إدارة الطوارئ المركزية';
  SELECT id INTO d_rescue FROM public.departments WHERE name_ar = 'إدارة الاستجابة السريعة';
  SELECT id INTO d_hr FROM public.departments WHERE name_ar = 'إدارة شؤون الموظفين';
  SELECT id INTO d_finance FROM public.departments WHERE name_ar = 'إدارة الشؤون المالية';

  SELECT id INTO lt_annual FROM public.leave_types WHERE name_ar = 'إجازة دورية';
  SELECT id INTO lt_special FROM public.leave_types WHERE name_ar = 'إجازة خاصة';
  SELECT id INTO lt_sick FROM public.leave_types WHERE name_ar = 'إجازة مرضية';
  SELECT id INTO lt_mission FROM public.leave_types WHERE name_ar = 'مهمة رسمية';
  SELECT id INTO lt_other FROM public.leave_types WHERE name_ar = 'إجازة أخرى';

  -- Insert 18 leadership members
  INSERT INTO public.leadership_members (full_name, file_number, rank, job_title, sector_id, department_id, workplace, is_active) VALUES
    ('أحمد محمد السالم', '1001', 'المدير العام', 'مساعد المدير العام', s_admin, d_hr, 'الديوان العام', true),
    ('خالد عبدالله النجار', '1002', 'مساعد المدير العام', 'مساعد المدير العام للشؤون الأمنية', s_public_security, d_ops, 'مكتب المدير العام', true),
    ('عمر فاروق الحداد', '1003', 'مدير عام', 'مدير عام قطاع العمليات', s_public_security, d_ops, 'الإدارة العامة', true),
    ('يوسف إبراهيم القاضي', '1004', 'مساعد مدير عام', 'مساعد مدير عام العمليات', s_public_security, d_ops, 'العمليات', true),
    ('طارق زياد الحلبي', '1005', 'مدير عام', 'مدير عام قطاع الخدمات الميدانية', s_traffic, d_gen_traffic, 'الإدارة العامة للخدمات الميدانية', true),
    ('سامي وليد الشاذلي', '1006', 'مساعد مدير عام', 'مساعد مدير عام المرور', s_traffic, d_licensing, 'إدارة التراخيص', true),
    ('كريم عادل المنصوري', '1007', 'مدير إدارة', 'مدير إدارة المتابعة والتنسيق', s_public_security, d_invest, 'المتابعة', true),
    ('هشام نبيل السقاف', '1008', 'مدير عام', 'مدير عام قطاع الوثائق والهوية', s_citizenship, d_citizenship, 'إدارة الهوية', true),
    ('عماد رشيد الحلواني', '1009', 'مساعد مدير عام', 'مساعد مدير عام الوثائق', s_citizenship, d_passports, 'الوثائق', true),
    ('باسم فؤاد الخولي', '1010', 'مدير عام', 'مدير عام قطاع الشؤون العامة', s_residency, d_residency, 'الخدمات العامة', true),
    ('أيمن سمير البرعي', '1011', 'مساعد مدير عام', 'مساعد مدير عام شؤون المراجعين', s_residency, d_foreigners, 'شؤون المراجعين', true),
    ('جلال محمود السنهوري', '1012', 'مدير إدارة', 'مدير إدارة الطوارئ المركزية', s_emergencies, d_central_emerg, 'الطوارئ', true),
    ('رامي أشرف الحنفي', '1013', 'مساعد مدير إدارة', 'مدير إدارة الاستجابة السريعة', s_emergencies, d_rescue, 'الاستجابة السريعة', true),
    ('وليد حسن الشافعي', '1014', 'مدير عام', 'مدير عام الشؤون المالية', s_admin, d_finance, 'الشؤون المالية', true),
    ('شريف مجدي النحاس', '1015', 'مساعد مدير عام', 'مساعد مدير عام شؤون الموظفين', s_admin, d_hr, 'شؤون الموظفين', true),
    ('عمرو تامر الرفاعي', '1016', 'مدير إدارة', 'مدير إدارة العمليات', s_public_security, d_ops, 'العمليات', true),
    ('حسام وائل القصبي', '1017', 'رئيس قسم', 'نائب مدير إدارة الخدمات الميدانية', s_traffic, d_gen_traffic, 'الخدمات الميدانية', true),
    ('مازن هاني الشرقاوي', '1018', 'مشرف أول', 'مساعد مدير إدارة الهوية', s_citizenship, d_citizenship, 'الهوية', true)
  ON CONFLICT DO NOTHING;

  -- Insert leaves (past, current, upcoming, cancelled)
  -- Using fixed dates relative to Oct 1, 2026

  -- Past leaves (completed)
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-01-15', '2026-01-30', '2026-01-31', 16, 'completed', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1001'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-06-10', '2026-06-20', '2026-06-21', 11, 'completed', 'إجازة صيفية'
  FROM public.leadership_members lm WHERE lm.file_number = '1001'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_special, '2026-02-01', '2026-02-07', '2026-02-08', 7, 'completed', 'إجازة خاصة'
  FROM public.leadership_members lm WHERE lm.file_number = '1003'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_sick, '2026-03-10', '2026-03-14', NULL, 5, 'completed', 'إجازة مرضية'
  FROM public.leadership_members lm WHERE lm.file_number = '1005'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_mission, '2026-04-01', '2026-04-05', '2026-04-06', 5, 'completed', 'مهمة رسمية خارجية'
  FROM public.leadership_members lm WHERE lm.file_number = '1008'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-05-15', '2026-05-25', '2026-05-26', 11, 'completed', NULL
  FROM public.leadership_members lm WHERE lm.file_number = '1010'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-07-01', '2026-07-15', '2026-07-16', 15, 'completed', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1014'
  ON CONFLICT DO NOTHING;

  -- Current active leaves (around Oct 1, 2026)
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-09-28', '2026-10-10', '2026-10-11', 13, 'active', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1002'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-09-25', '2026-10-05', '2026-10-06', 11, 'active', NULL
  FROM public.leadership_members lm WHERE lm.file_number = '1006'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_sick, '2026-09-29', '2026-10-03', NULL, 5, 'active', 'إجازة مرضية'
  FROM public.leadership_members lm WHERE lm.file_number = '1009'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_special, '2026-09-20', '2026-10-15', '2026-10-16', 26, 'active', 'إجازة خاصة طويلة'
  FROM public.leadership_members lm WHERE lm.file_number = '1012'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-09-30', '2026-10-02', '2026-10-03', 3, 'active', 'إجازة قصيرة'
  FROM public.leadership_members lm WHERE lm.file_number = '1018'
  ON CONFLICT DO NOTHING;

  -- Returning soon (ending within 7 days)
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-09-15', '2026-10-01', '2026-10-02', 17, 'active', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1004'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_mission, '2026-09-25', '2026-10-04', '2026-10-05', 10, 'active', 'مهمة رسمية'
  FROM public.leadership_members lm WHERE lm.file_number = '1011'
  ON CONFLICT DO NOTHING;

  -- Upcoming leaves (starting within 7 days)
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-10-03', '2026-10-15', '2026-10-16', 13, 'upcoming', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1007'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-10-05', '2026-10-20', '2026-10-21', 16, 'upcoming', NULL
  FROM public.leadership_members lm WHERE lm.file_number = '1015'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_special, '2026-10-07', '2026-10-10', '2026-10-11', 4, 'upcoming', 'إجازة خاصة'
  FROM public.leadership_members lm WHERE lm.file_number = '1017'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-10-10', '2026-10-25', '2026-10-26', 16, 'upcoming', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1013'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_mission, '2026-10-02', '2026-10-06', '2026-10-07', 5, 'upcoming', 'مهمة رسمية'
  FROM public.leadership_members lm WHERE lm.file_number = '1016'
  ON CONFLICT DO NOTHING;

  -- Far upcoming (next week+)
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-10-20', '2026-11-05', '2026-11-06', 17, 'upcoming', 'إجازة سنوية'
  FROM public.leadership_members lm WHERE lm.file_number = '1003'
  ON CONFLICT DO NOTHING;

  -- Cancelled leave
  INSERT INTO public.leadership_leaves (leadership_member_id, leave_type_id, start_date, end_date, return_date, total_days, status, notes)
  SELECT lm.id, lt_annual, '2026-09-10', '2026-09-20', '2026-09-21', 11, 'cancelled', 'تم إلغاء الإجازة'
  FROM public.leadership_members lm WHERE lm.file_number = '1005'
  ON CONFLICT DO NOTHING;

  -- Archived member
  UPDATE public.leadership_members SET is_active = false WHERE file_number = '1018';
END $$;
