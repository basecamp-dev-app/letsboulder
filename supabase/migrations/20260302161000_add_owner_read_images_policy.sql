DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'images'
      AND policyname = 'Owner read own images'
  ) THEN
    CREATE POLICY "Owner read own images"
      ON public.images
      FOR SELECT
      USING (auth.uid() = created_by);
  END IF;
END $$;
