-- Test git action trigger
-- This migration adds a comment to test that the CI pipeline is triggered on push to main
-- 2026-04-06 v5

COMMENT ON FUNCTION public.delete_account_atomic IS 'Test migration - no functional change v5';
