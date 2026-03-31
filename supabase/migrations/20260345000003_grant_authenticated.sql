-- Grant execute permission for create_unified_submission_atomic to authenticated

GRANT EXECUTE ON FUNCTION public.create_unified_submission_atomic(UUID, JSONB, JSONB[], JSONB, TEXT) TO authenticated;