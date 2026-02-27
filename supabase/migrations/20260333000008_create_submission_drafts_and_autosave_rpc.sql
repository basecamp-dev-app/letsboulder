CREATE TABLE IF NOT EXISTS public.submission_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crag_id UUID REFERENCES public.crags(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_drafts_user_status_updated
ON public.submission_drafts(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_drafts_crag_id
ON public.submission_drafts(crag_id);

CREATE TABLE IF NOT EXISTS public.submission_draft_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.submission_drafts(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  storage_bucket TEXT NOT NULL CHECK (char_length(trim(storage_bucket)) > 0),
  storage_path TEXT NOT NULL CHECK (char_length(trim(storage_path)) > 0),
  width INTEGER,
  height INTEGER,
  route_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  linked_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
  linked_crag_image_id UUID REFERENCES public.crag_images(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_draft_images_draft_order
ON public.submission_draft_images(draft_id, display_order);

CREATE INDEX IF NOT EXISTS idx_submission_draft_images_draft_id
ON public.submission_draft_images(draft_id);

CREATE OR REPLACE FUNCTION public.touch_submission_drafts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_submission_draft_images_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_submission_drafts_updated_at'
  ) THEN
    CREATE TRIGGER trg_submission_drafts_updated_at
      BEFORE UPDATE ON public.submission_drafts
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_submission_drafts_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_submission_draft_images_updated_at'
  ) THEN
    CREATE TRIGGER trg_submission_draft_images_updated_at
      BEFORE UPDATE ON public.submission_draft_images
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_submission_draft_images_updated_at();
  END IF;
END $$;

ALTER TABLE public.submission_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_draft_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users read own submission_drafts'
  ) THEN
    CREATE POLICY "Users read own submission_drafts"
      ON public.submission_drafts
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users create own submission_drafts'
  ) THEN
    CREATE POLICY "Users create own submission_drafts"
      ON public.submission_drafts
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_drafts' AND policyname = 'Users update own submission_drafts'
  ) THEN
    CREATE POLICY "Users update own submission_drafts"
      ON public.submission_drafts
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_draft_images' AND policyname = 'Users read own submission_draft_images'
  ) THEN
    CREATE POLICY "Users read own submission_draft_images"
      ON public.submission_draft_images
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_draft_images' AND policyname = 'Users create own submission_draft_images'
  ) THEN
    CREATE POLICY "Users create own submission_draft_images"
      ON public.submission_draft_images
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'submission_draft_images' AND policyname = 'Users update own submission_draft_images'
  ) THEN
    CREATE POLICY "Users update own submission_draft_images"
      ON public.submission_draft_images
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.patch_submission_draft_images_atomic(
  p_draft_id UUID,
  p_images JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  owner_user_id UUID;
  payload_count INTEGER;
  distinct_id_count INTEGER;
  distinct_order_count INTEGER;
  draft_image_count INTEGER;
  updated_count INTEGER;
  updated_at_value TIMESTAMPTZ;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_draft_id IS NULL THEN
    RAISE EXCEPTION 'Draft ID is required';
  END IF;

  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' OR jsonb_array_length(p_images) = 0 THEN
    RAISE EXCEPTION 'images payload must be a non-empty array';
  END IF;

  SELECT user_id INTO owner_user_id
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  IF owner_user_id <> current_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH payload AS (
    SELECT
      (item->>'id')::UUID AS id,
      (item->>'display_order')::INTEGER AS display_order,
      COALESCE(item->'route_data', '{}'::JSONB) AS route_data
    FROM jsonb_array_elements(p_images) AS item
  )
  SELECT
    COUNT(*),
    COUNT(DISTINCT id),
    COUNT(DISTINCT display_order)
  INTO payload_count, distinct_id_count, distinct_order_count
  FROM payload;

  IF payload_count <> distinct_id_count THEN
    RAISE EXCEPTION 'Duplicate image IDs in payload';
  END IF;

  IF payload_count <> distinct_order_count THEN
    RAISE EXCEPTION 'Duplicate display_order values in payload';
  END IF;

  SELECT COUNT(*) INTO draft_image_count
  FROM public.submission_draft_images
  WHERE draft_id = p_draft_id;

  IF draft_image_count <> payload_count THEN
    RAISE EXCEPTION 'Payload must include all draft images';
  END IF;

  IF EXISTS (
    WITH payload AS (
      SELECT (item->>'id')::UUID AS id
      FROM jsonb_array_elements(p_images) AS item
    )
    SELECT 1
    FROM payload p
    LEFT JOIN public.submission_draft_images di
      ON di.id = p.id AND di.draft_id = p_draft_id
    WHERE di.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more images do not belong to this draft';
  END IF;

  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn
    FROM public.submission_draft_images
    WHERE draft_id = p_draft_id
  )
  UPDATE public.submission_draft_images di
  SET display_order = -1 * ordered.rn
  FROM ordered
  WHERE di.id = ordered.id;

  WITH payload AS (
    SELECT
      (item->>'id')::UUID AS id,
      (item->>'display_order')::INTEGER AS display_order,
      COALESCE(item->'route_data', '{}'::JSONB) AS route_data
    FROM jsonb_array_elements(p_images) AS item
  )
  UPDATE public.submission_draft_images di
  SET
    display_order = p.display_order,
    route_data = p.route_data,
    updated_at = NOW()
  FROM payload p
  WHERE di.id = p.id
    AND di.draft_id = p_draft_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  UPDATE public.submission_drafts
  SET updated_at = NOW()
  WHERE id = p_draft_id
  RETURNING updated_at INTO updated_at_value;

  RETURN jsonb_build_object(
    'draft_id', p_draft_id,
    'updated_at', updated_at_value,
    'updated_count', updated_count,
    'images', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'display_order', display_order,
          'route_data', route_data,
          'updated_at', updated_at
        )
        ORDER BY display_order
      )
      FROM public.submission_draft_images
      WHERE draft_id = p_draft_id
    )
  );
END;
$function$;
