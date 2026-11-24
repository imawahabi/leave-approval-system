/*
# Seed Reference Data

## Overview
Populates sectors, departments, leave_types with initial data for the
Government Entity Leadership Leave Management System.

## Data
- 6 sectors (cutting across the ministry)
- 12 departments (2 per sector)
- 5 leave types (دورية، خاصة، مرضية، مهمة رسمية، أخرى)
*/

-- Sectors
INSERT INTO public.sectors (name_ar, name_en, sort_order) VALUES
  ('قطاع العمليات', 'Operations Sector', 1),
  ('قطاع الخدمات الميدانية', 'Field Services Sector', 2),
  ('قطاع الوثائق والهوية', 'Documents & Identity Sector', 3),
  ('قطاع الشؤون العامة', 'General Affairs Sector', 4),
  ('قطاع الطوارئ', 'Emergency Sector', 5),
  ('القطاع الإداري', 'Administrative Sector', 6)
ON CONFLICT DO NOTHING;

-- Departments (linked to sectors by name lookup)
INSERT INTO public.departments (sector_id, name_ar, name_en, sort_order)
SELECT s.id, dept.name_ar, dept.name_en, dept.sort_order
FROM public.sectors s
JOIN (VALUES
  ('قطاع العمليات', 'إدارة العمليات', 'Operations Dept', 1),
  ('قطاع العمليات', 'إدارة المتابعة والتنسيق', 'Follow-up & Coordination Dept', 2),
  ('قطاع الخدمات الميدانية', 'إدارة الخدمات الميدانية', 'Field Services Dept', 1),
  ('قطاع الخدمات الميدانية', 'إدارة التراخيص', 'Licensing Dept', 2),
  ('قطاع الوثائق والهوية', 'إدارة الهوية', 'Identity Dept', 1),
  ('قطاع الوثائق والهوية', 'إدارة الوثائق', 'Documents Dept', 2),
  ('قطاع الشؤون العامة', 'إدارة الخدمات العامة', 'General Services Dept', 1),
  ('قطاع الشؤون العامة', 'إدارة شؤون المراجعين', 'Visitors Affairs Dept', 2),
  ('قطاع الطوارئ', 'إدارة الطوارئ المركزية', 'Central Emergency Dept', 1),
  ('قطاع الطوارئ', 'إدارة الاستجابة السريعة', 'Rapid Response Dept', 2),
  ('القطاع الإداري', 'إدارة شؤون الموظفين', 'Human Resources Dept', 1),
  ('القطاع الإداري', 'إدارة الشؤون المالية', 'Financial Affairs Dept', 2)
) AS dept(sector_name, name_ar, name_en, sort_order)
ON s.name_ar = dept.sector_name
ON CONFLICT DO NOTHING;

-- Leave Types
INSERT INTO public.leave_types (name_ar, name_en, sort_order) VALUES
  ('إجازة دورية', 'Annual Leave', 1),
  ('إجازة خاصة', 'Special Leave', 2),
  ('إجازة مرضية', 'Sick Leave', 3),
  ('مهمة رسمية', 'Official Mission', 4),
  ('إجازة أخرى', 'Other Leave', 5)
ON CONFLICT DO NOTHING;
