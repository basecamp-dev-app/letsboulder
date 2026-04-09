DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB, TIMESTAMPTZ) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.patch_submission_draft_images_atomic(UUID, JSONB, TIMESTAMPTZ) TO service_role';
END $$;
