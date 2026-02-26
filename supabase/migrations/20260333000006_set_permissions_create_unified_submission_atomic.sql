DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) TO service_role';
END $$;
