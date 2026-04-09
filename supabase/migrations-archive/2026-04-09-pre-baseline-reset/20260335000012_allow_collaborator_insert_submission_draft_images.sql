DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_images'
      AND policyname = 'Users create own submission_draft_images'
  ) THEN
    DROP POLICY "Users create own submission_draft_images" ON public.submission_draft_images;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_images'
      AND policyname = 'Users create own or shared submission_draft_images'
  ) THEN
    DROP POLICY "Users create own or shared submission_draft_images" ON public.submission_draft_images;
  END IF;

  CREATE POLICY "Users create own or shared submission_draft_images"
    ON public.submission_draft_images
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.submission_drafts d
        WHERE d.id = submission_draft_images.draft_id
          AND d.status = 'draft'
          AND (
            d.user_id = auth.uid()
            OR public.is_submission_draft_collaborator(d.id, auth.uid())
          )
      )
    );
END $$;
