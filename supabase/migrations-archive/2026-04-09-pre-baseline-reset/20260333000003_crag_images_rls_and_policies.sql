ALTER TABLE public.crag_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crag_images'
      AND policyname = 'Public read crag_images'
  ) THEN
    CREATE POLICY "Public read crag_images"
      ON public.crag_images
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crag_images'
      AND policyname = 'Authenticated create crag_images'
  ) THEN
    CREATE POLICY "Authenticated create crag_images"
      ON public.crag_images
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.insert_pin_images_atomic(UUID, TEXT[]) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.insert_pin_images_atomic(UUID, TEXT[]) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.insert_pin_images_atomic(UUID, TEXT[]) TO service_role';
END $$;
