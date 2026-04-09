DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) TO service_role';
END $$;
