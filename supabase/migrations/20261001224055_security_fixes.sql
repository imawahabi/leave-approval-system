/*
# Security Fixes: Functions and View

## Overview
Fixes security advisor findings:
1. Revoke EXECUTE on is_admin() and handle_new_user() from anon and authenticated
2. Set search_path on update_updated_at_column()
3. Change view to SECURITY INVOKER
*/

-- Revoke execute on is_admin from anon (it's used internally in RLS, not via RPC)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;

-- Revoke execute on handle_new_user from anon and authenticated (trigger only)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Fix search_path on update_updated_at_column
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers (they were dropped by CASCADE)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sectors_updated_at ON public.sectors;
CREATE TRIGGER update_sectors_updated_at BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_departments_updated_at ON public.departments;
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_types_updated_at ON public.leave_types;
CREATE TRIGGER update_leave_types_updated_at BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leadership_members_updated_at ON public.leadership_members;
CREATE TRIGGER update_leadership_members_updated_at BEFORE UPDATE ON public.leadership_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leaves_updated_at ON public.leadership_leaves;
CREATE TRIGGER update_leaves_updated_at BEFORE UPDATE ON public.leadership_leaves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate view as SECURITY INVOKER
DROP VIEW IF EXISTS public.leadership_current_status;
CREATE VIEW public.leadership_current_status WITH (security_invoker = true) AS
SELECT
  lm.id,
  lm.full_name,
  lm.file_number,
  lm.rank,
  lm.job_title,
  lm.sector_id,
  s.name_ar AS sector_name,
  lm.department_id,
  d.name_ar AS department_name,
  lm.workplace,
  lm.is_active,
  ll.id AS current_leave_id,
  ll.leave_type_id,
  lt.name_ar AS current_leave_type,
  ll.start_date AS current_leave_start,
  ll.end_date AS current_leave_end,
  ll.return_date AS current_leave_return,
  ll.total_days AS current_leave_days,
  ll.status AS leave_status,
  ll.notes AS current_leave_notes
FROM public.leadership_members lm
LEFT JOIN public.sectors s ON lm.sector_id = s.id
LEFT JOIN public.departments d ON lm.department_id = d.id
LEFT JOIN public.leadership_leaves ll ON lm.id = ll.leadership_member_id
  AND ll.status != 'cancelled'
  AND ll.start_date <= CURRENT_DATE
  AND ll.end_date >= CURRENT_DATE
LEFT JOIN public.leave_types lt ON ll.leave_type_id = lt.id
WHERE lm.is_active = true;
