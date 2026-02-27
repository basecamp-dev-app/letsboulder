DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB) TO service_role';
END $$;
