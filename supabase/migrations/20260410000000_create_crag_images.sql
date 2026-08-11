CREATE TABLE IF NOT EXISTS public.crag_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crag_id UUID NOT NULL REFERENCES public.crags(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(trim(url)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crag_images_crag_id ON public.crag_images(crag_id);
CREATE INDEX IF NOT EXISTS idx_crag_images_created_at ON public.crag_images(created_at DESC);

CREATE OR REPLACE FUNCTION public.insert_pin_images_atomic(
  p_crag_id UUID,
  p_urls TEXT[]
)
RETURNS SETOF public.crag_images
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_crag_id IS NULL THEN
    RAISE EXCEPTION 'crag_id is required';
  END IF;

  IF p_urls IS NULL OR cardinality(p_urls) = 0 THEN
    RAISE EXCEPTION 'At least one image URL is required';
  END IF;

  RETURN QUERY
  INSERT INTO public.crag_images (crag_id, url)
  SELECT
    p_crag_id,
    trim(url_item)
  FROM unnest(p_urls) AS url_item
  WHERE trim(url_item) <> ''
  RETURNING *;
END;
$function$;

DO $$
BEGIN
  ALTER TABLE public.crag_images ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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
