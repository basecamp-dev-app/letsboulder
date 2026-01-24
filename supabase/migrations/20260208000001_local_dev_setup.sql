-- =====================================================
-- LOCAL DEVELOPMENT ONLY - DO NOT PUSH TO PRODUCTION
-- Created: 2026-01-24
-- =====================================================

-- This file sets up local development with admin access
-- Run locally: supabase migration up
-- SKIP on production: Remove before pushing to prod!

-- Set all profiles to admin for local development
UPDATE public.profiles SET is_admin = true;

-- Add gsyrocks_admin to auth metadata for users who need it
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"gsyrocks_admin": true}'
WHERE email = 'patrickshadow@gmail.com';
