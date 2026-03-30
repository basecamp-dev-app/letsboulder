-- Fix: Grant permissions for create_unified_submission_atomic
-- Part 2: Grant execute permissions

GRANT EXECUTE ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) TO service_role;