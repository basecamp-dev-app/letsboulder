DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relname = 'submission_drafts'
      AND pg_class.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users delete own submission_drafts'
  ) THEN
    CREATE POLICY "Users delete own submission_drafts"
      ON public.submission_drafts
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relname = 'submission_draft_images'
      AND pg_class.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_draft_images' AND policyname = 'Users delete own submission_draft_images'
  ) THEN
    CREATE POLICY "Users delete own submission_draft_images"
      ON public.submission_draft_images
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;
