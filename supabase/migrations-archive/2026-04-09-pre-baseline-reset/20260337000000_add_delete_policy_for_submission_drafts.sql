DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users delete own submission_drafts'
  ) THEN
    CREATE POLICY "Users delete own submission_drafts"
      ON public.submission_drafts
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
