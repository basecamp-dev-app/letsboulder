-- =====================================================
-- Fix Supabase Linter Errors - Minimal Fix
-- Only enables RLS on public tables
-- Created: 2026-01-14
-- =====================================================

-- =====================================================
-- ADMIN_ACTIONS: Enable RLS with admin-only access
-- =====================================================

-- Enable RLS on admin_actions
DO $$ BEGIN
    ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Admin-only policy (using JWT role claim)
DO $$ BEGIN
    CREATE POLICY "Admins can manage admin actions" ON admin_actions
        FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- CRAG_REPORTS: Add admin policy for resolving
-- =====================================================

-- Admin policy for resolving reports
DO $$ BEGIN
    CREATE POLICY "Admins can resolve crag reports" ON public.crag_reports
        FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =====================================================
-- GRADES: Already has RLS from production_sync.sql
-- No action needed - linter error should be resolved
-- =====================================================
