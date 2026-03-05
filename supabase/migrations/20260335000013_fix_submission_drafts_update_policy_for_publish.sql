DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_drafts'
      AND policyname = 'Owner or collaborator update draft submission_drafts'
  ) THEN
    DROP POLICY "Owner or collaborator update draft submission_drafts" ON public.submission_drafts;
  END IF;

  CREATE POLICY "Owner or collaborator update draft submission_drafts"
    ON public.submission_drafts
    FOR UPDATE
    USING (
      status = 'draft'
      AND (
        auth.uid() = user_id
        OR public.is_submission_draft_collaborator(submission_drafts.id, auth.uid())
      )
    )
    WITH CHECK (
      (
        auth.uid() = user_id
        AND status IN ('draft', 'submitted')
      )
      OR (
        public.is_submission_draft_collaborator(submission_drafts.id, auth.uid())
        AND status = 'draft'
      )
    );
END $$;
