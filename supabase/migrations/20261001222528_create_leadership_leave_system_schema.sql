/*
# Leadership Leave Management System - Core Schema

## Overview
Creates the complete database schema for the Leadership Leave Management System
for Government Entity. Multi-user internal system with Admin/Viewer roles.

## New Tables
1. profiles - Extends auth.users with role info
2. sectors - Organizational sectors
3. departments - Departments within sectors
4. leave_types - Types of leaves
5. leadership_members - Leadership personnel records
6. leadership_leaves - Leave records (one-to-many)
7. audit_logs - Audit trail

## Security
- RLS on ALL tables
- All authenticated users can read
- Only admins can write (via is_admin() function)
- Audit logs readable only by admins
*/

-- ============================================================
-- 1. profiles table (must exist before is_admin function)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer', 'super_admin', 'department_admin', 'data_entry')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile when auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function: is_admin() - must come after profiles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = true
  );
$$;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
CREATE POLICY "profiles_admin_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 2. sectors table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sectors_select_authenticated" ON public.sectors;
CREATE POLICY "sectors_select_authenticated" ON public.sectors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sectors_admin_insert" ON public.sectors;
CREATE POLICY "sectors_admin_insert" ON public.sectors
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sectors_admin_update" ON public.sectors;
CREATE POLICY "sectors_admin_update" ON public.sectors
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sectors_admin_delete" ON public.sectors;
CREATE POLICY "sectors_admin_delete" ON public.sectors
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 3. departments table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  name_ar text NOT NULL,
  name_en text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select_authenticated" ON public.departments;
CREATE POLICY "departments_select_authenticated" ON public.departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "departments_admin_insert" ON public.departments;
CREATE POLICY "departments_admin_insert" ON public.departments
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "departments_admin_update" ON public.departments;
CREATE POLICY "departments_admin_update" ON public.departments
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "departments_admin_delete" ON public.departments;
CREATE POLICY "departments_admin_delete" ON public.departments
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 4. leave_types table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_types_select_authenticated" ON public.leave_types;
CREATE POLICY "leave_types_select_authenticated" ON public.leave_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leave_types_admin_insert" ON public.leave_types;
CREATE POLICY "leave_types_admin_insert" ON public.leave_types
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leave_types_admin_update" ON public.leave_types;
CREATE POLICY "leave_types_admin_update" ON public.leave_types
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leave_types_admin_delete" ON public.leave_types;
CREATE POLICY "leave_types_admin_delete" ON public.leave_types
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 5. leadership_members table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leadership_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  file_number text NOT NULL UNIQUE,
  rank text NOT NULL,
  job_title text NOT NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  workplace text,
  phone_number text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.leadership_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leadership_select_authenticated" ON public.leadership_members;
CREATE POLICY "leadership_select_authenticated" ON public.leadership_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leadership_admin_insert" ON public.leadership_members;
CREATE POLICY "leadership_admin_insert" ON public.leadership_members
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leadership_admin_update" ON public.leadership_members;
CREATE POLICY "leadership_admin_update" ON public.leadership_members
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leadership_admin_delete" ON public.leadership_members;
CREATE POLICY "leadership_admin_delete" ON public.leadership_members
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_leadership_members_sector ON public.leadership_members(sector_id);
CREATE INDEX IF NOT EXISTS idx_leadership_members_department ON public.leadership_members(department_id);
CREATE INDEX IF NOT EXISTS idx_leadership_members_active ON public.leadership_members(is_active);
CREATE INDEX IF NOT EXISTS idx_leadership_members_rank ON public.leadership_members(rank);

-- ============================================================
-- 6. leadership_leaves table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leadership_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leadership_member_id uuid NOT NULL REFERENCES public.leadership_members(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  return_date date,
  total_days int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'returning_soon', 'completed', 'cancelled')),
  notes text,
  substitute_member_id uuid REFERENCES public.leadership_members(id) ON DELETE SET NULL,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT valid_date_range CHECK (start_date <= end_date),
  CONSTRAINT valid_return_date CHECK (return_date IS NULL OR return_date >= end_date)
);

ALTER TABLE public.leadership_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaves_select_authenticated" ON public.leadership_leaves;
CREATE POLICY "leaves_select_authenticated" ON public.leadership_leaves
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leaves_admin_insert" ON public.leadership_leaves;
CREATE POLICY "leaves_admin_insert" ON public.leadership_leaves
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leaves_admin_update" ON public.leadership_leaves;
CREATE POLICY "leaves_admin_update" ON public.leadership_leaves
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leaves_admin_delete" ON public.leadership_leaves;
CREATE POLICY "leaves_admin_delete" ON public.leadership_leaves
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_leaves_member ON public.leadership_leaves(leadership_member_id);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON public.leadership_leaves(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON public.leadership_leaves(status);
CREATE INDEX IF NOT EXISTS idx_leaves_start_date ON public.leadership_leaves(start_date);
CREATE INDEX IF NOT EXISTS idx_leaves_end_date ON public.leadership_leaves(end_date);

-- ============================================================
-- 7. audit_logs table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_admin_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ============================================================
-- 8. leadership_current_status view
-- ============================================================

CREATE OR REPLACE VIEW public.leadership_current_status AS
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

-- ============================================================
-- 9. updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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
