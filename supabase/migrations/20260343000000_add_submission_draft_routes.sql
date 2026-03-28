CREATE TABLE IF NOT EXISTS public.submission_draft_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.submission_drafts(id) ON DELETE CASCADE,
  draft_image_id UUID NOT NULL REFERENCES public.submission_draft_images(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Unnamed route',
  grade TEXT NOT NULL DEFAULT '6A',
  description TEXT NULL,
  climb_type TEXT NOT NULL DEFAULT 'sport',
  points JSONB NOT NULL DEFAULT '[]'::JSONB,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  image_width INTEGER NULL,
  image_height INTEGER NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_draft_routes_climb_type_check CHECK (climb_type IN ('sport', 'boulder', 'trad', 'deep-water-solo')),
  CONSTRAINT submission_draft_routes_points_is_array CHECK (jsonb_typeof(points) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_submission_draft_routes_draft_id
  ON public.submission_draft_routes(draft_id);

CREATE INDEX IF NOT EXISTS idx_submission_draft_routes_image_order
  ON public.submission_draft_routes(draft_image_id, sequence_order, created_at);

ALTER TABLE public.submission_draft_routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_routes'
      AND policyname = 'Users read own or shared submission_draft_routes'
  ) THEN
    CREATE POLICY "Users read own or shared submission_draft_routes"
      ON public.submission_draft_routes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_routes.draft_id
            AND (
              d.user_id = auth.uid()
              OR public.is_submission_draft_collaborator(d.id, auth.uid())
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_routes'
      AND policyname = 'Users write own or shared submission_draft_routes'
  ) THEN
    CREATE POLICY "Users write own or shared submission_draft_routes"
      ON public.submission_draft_routes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_routes.draft_id
            AND d.status = 'draft'
            AND (
              d.user_id = auth.uid()
              OR public.is_submission_draft_collaborator(d.id, auth.uid())
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_routes.draft_id
            AND d.status = 'draft'
            AND (
              d.user_id = auth.uid()
              OR public.is_submission_draft_collaborator(d.id, auth.uid())
            )
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_submission_draft_routes(
  p_draft_id UUID,
  p_draft_image_id UUID,
  p_routes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $sync_submission_draft_routes$
DECLARE
  current_user_id UUID := auth.uid();
  draft_row public.submission_drafts%ROWTYPE;
  image_exists BOOLEAN := false;
  updated_at_value TIMESTAMPTZ;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_draft_id IS NULL OR p_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Draft ID and image ID are required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' THEN
    RAISE EXCEPTION 'routes payload must be an array';
  END IF;

  SELECT *
  INTO draft_row
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft submissions can be edited';
  END IF;

  IF NOT public.user_can_edit_submission_draft(p_draft_id, current_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.submission_draft_images di
    WHERE di.id = p_draft_image_id
      AND di.draft_id = p_draft_id
  ) INTO image_exists;

  IF NOT COALESCE(image_exists, false) THEN
    RAISE EXCEPTION 'Draft image not found';
  END IF;

  WITH payload AS (
    SELECT
      COALESCE(NULLIF(item->>'id', ''), gen_random_uuid()::TEXT)::UUID AS id,
      COALESCE(NULLIF(BTRIM(item->>'name'), ''), 'Unnamed route') AS name,
      COALESCE(NULLIF(BTRIM(item->>'grade'), ''), '6A') AS grade,
      NULLIF(BTRIM(item->>'description'), '') AS description,
      CASE
        WHEN REPLACE(LOWER(COALESCE(item->>'climbType', 'sport')), '_', '-') IN ('sport', 'boulder', 'trad', 'deep-water-solo')
          THEN REPLACE(LOWER(COALESCE(item->>'climbType', 'sport')), '_', '-')
        ELSE 'sport'
      END AS climb_type,
      CASE
        WHEN jsonb_typeof(item->'points') = 'array' THEN item->'points'
        ELSE '[]'::JSONB
      END AS points,
      COALESCE((item->>'sequenceOrder')::INTEGER, ordinality - 1) AS sequence_order,
      NULLIF(item->>'imageWidth', '')::INTEGER AS image_width,
      NULLIF(item->>'imageHeight', '')::INTEGER AS image_height
    FROM jsonb_array_elements(p_routes) WITH ORDINALITY AS payload(item, ordinality)
  ), deleted AS (
    DELETE FROM public.submission_draft_routes dr
    WHERE dr.draft_id = p_draft_id
      AND dr.draft_image_id = p_draft_image_id
      AND NOT EXISTS (
        SELECT 1 FROM payload p WHERE p.id = dr.id
      )
  ), upserted AS (
    INSERT INTO public.submission_draft_routes (
      id,
      draft_id,
      draft_image_id,
      name,
      grade,
      description,
      climb_type,
      points,
      sequence_order,
      image_width,
      image_height,
      created_by,
      updated_by
    )
    SELECT
      p.id,
      p_draft_id,
      p_draft_image_id,
      p.name,
      p.grade,
      p.description,
      p.climb_type,
      p.points,
      p.sequence_order,
      p.image_width,
      p.image_height,
      current_user_id,
      current_user_id
    FROM payload p
    WHERE jsonb_array_length(p.points) >= 2
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      grade = EXCLUDED.grade,
      description = EXCLUDED.description,
      climb_type = EXCLUDED.climb_type,
      points = EXCLUDED.points,
      sequence_order = EXCLUDED.sequence_order,
      image_width = EXCLUDED.image_width,
      image_height = EXCLUDED.image_height,
      updated_by = current_user_id,
      updated_at = NOW(),
      draft_id = EXCLUDED.draft_id,
      draft_image_id = EXCLUDED.draft_image_id
    RETURNING id
  )
  UPDATE public.submission_drafts
  SET updated_at = NOW(),
      last_edited_by = current_user_id
  WHERE id = p_draft_id
  RETURNING updated_at INTO updated_at_value;

  RETURN jsonb_build_object(
    'draft_id', p_draft_id,
    'draft_image_id', p_draft_image_id,
    'updated_at', updated_at_value,
    'routes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', dr.id,
        'draft_image_id', dr.draft_image_id,
        'name', dr.name,
        'grade', dr.grade,
        'description', dr.description,
        'climb_type', dr.climb_type,
        'points', dr.points,
        'sequence_order', dr.sequence_order,
        'image_width', dr.image_width,
        'image_height', dr.image_height,
        'created_at', dr.created_at,
        'updated_at', dr.updated_at
      ) ORDER BY dr.sequence_order, dr.created_at), '[]'::JSONB)
      FROM public.submission_draft_routes dr
      WHERE dr.draft_id = p_draft_id
        AND dr.draft_image_id = p_draft_image_id
    )
  );
END;
$sync_submission_draft_routes$;

REVOKE ALL ON FUNCTION public.sync_submission_draft_routes(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_submission_draft_routes(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_submission_draft_routes(UUID, UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.promote_draft_to_submission(
  p_draft_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_row public.submission_drafts%ROWTYPE;
  image_row public.submission_draft_images%ROWTYPE;
  route_row public.submission_draft_routes%ROWTYPE;
  metadata_version INTEGER := 1;
  current_user_id UUID := auth.uid();
  default_draft_image_id UUID;
  default_live_image_id UUID;
  current_live_image_id UUID;
  current_crag_image_id UUID;
  route_name TEXT;
  route_description TEXT;
  route_grade TEXT;
  route_type_default TEXT := 'sport';
  route_type_normalized TEXT;
  route_slug TEXT;
  base_route_slug TEXT;
  created_climb_id UUID;
  created_route_line_id UUID;
  all_live_image_ids UUID[] := ARRAY[]::UUID[];
  all_climb_ids UUID[] := ARRAY[]::UUID[];
  all_route_line_ids UUID[] := ARRAY[]::UUID[];
  orientation_json JSONB := '[]'::JSONB;
  orientation_text TEXT[] := ARRAY[]::TEXT[];
  anonymous_submission BOOLEAN := false;
  image_id_map JSONB := '{}'::JSONB;
  created_submission_id UUID := gen_random_uuid();
  upload_session_uuid UUID;
  image_location_mode TEXT := 'custom';
  image_latitude DOUBLE PRECISION;
  image_longitude DOUBLE PRECISION;
BEGIN
  SELECT * INTO draft_row FROM public.submission_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF draft_row.status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only draft submissions can be published'; END IF;
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.user_can_edit_submission_draft(draft_row.id, current_user_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF draft_row.crag_id IS NULL THEN RAISE EXCEPTION 'Draft crag is required before publishing'; END IF;

  IF jsonb_typeof(COALESCE(draft_row.metadata, '{}'::JSONB)) = 'object' THEN
    metadata_version := COALESCE((draft_row.metadata->>'version')::INTEGER, 1);
    anonymous_submission := COALESCE((draft_row.metadata->'submission'->>'isAnonymousSubmission')::BOOLEAN, false);
    default_draft_image_id := NULLIF(draft_row.metadata->'navigation'->>'defaultImageId', '')::UUID;
    route_type_default := COALESCE(NULLIF(BTRIM(draft_row.metadata->'submission'->>'routeType'), ''), 'sport');
  END IF;

  IF default_draft_image_id IS NULL THEN
    SELECT id INTO default_draft_image_id
    FROM public.submission_draft_images
    WHERE draft_id = draft_row.id
    ORDER BY display_order
    LIMIT 1;
  END IF;

  IF default_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Draft requires at least one image before publishing';
  END IF;

  FOR image_row IN
    SELECT * FROM public.submission_draft_images di WHERE di.draft_id = draft_row.id ORDER BY di.display_order
  LOOP
    IF metadata_version >= 2 THEN
      orientation_json := COALESCE(draft_row.metadata->'images'->(image_row.id::TEXT)->'orientation', '[]'::JSONB);
      image_location_mode := COALESCE(NULLIF(BTRIM(draft_row.metadata->'images'->(image_row.id::TEXT)->>'locationMode'), ''), CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END);
      IF image_location_mode NOT IN ('shared', 'custom') THEN
        image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      END IF;
      IF image_location_mode = 'shared' THEN
        image_latitude := NULL;
        image_longitude := NULL;
      ELSE
        image_latitude := image_row.latitude;
        image_longitude := image_row.longitude;
      END IF;
    ELSE
      orientation_json := COALESCE(draft_row.metadata->'faceDirectionsByImage'->(image_row.display_order::TEXT), draft_row.metadata->'faceDirections', '[]'::JSONB);
      image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      image_latitude := image_row.latitude;
      image_longitude := image_row.longitude;
    END IF;

    orientation_text := ARRAY(
      SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(orientation_json) = 'array' THEN orientation_json ELSE '[]'::JSONB END)
    );

    upload_session_uuid := (regexp_match(image_row.storage_path, 'images/originals/([0-9a-fA-F-]+)'))[1]::UUID;

    INSERT INTO public.images (
      id, url, storage_bucket, storage_path, crag_id, submission_id, latitude, longitude, capture_date, width, height,
      natural_width, natural_height, face_direction, face_directions, created_by, parent_image_id, is_primary,
      is_anonymous_submission, visibility, moderation_status, processing_status, status, face_order, location_mode
    ) VALUES (
      upload_session_uuid, format('private://%s/%s', image_row.storage_bucket, image_row.storage_path), image_row.storage_bucket,
      image_row.storage_path, draft_row.crag_id, created_submission_id, image_latitude, image_longitude, image_row.capture_date,
      image_row.width, image_row.height, image_row.width, image_row.height,
      CASE WHEN array_length(orientation_text, 1) IS NULL THEN NULL ELSE orientation_text[1] END,
      COALESCE(orientation_text, ARRAY[]::TEXT[]), current_user_id, NULL, image_row.id = default_draft_image_id,
      anonymous_submission, 'public', 'approved', 'ready', 'approved', image_row.display_order, image_location_mode
    )
    ON CONFLICT (id) DO UPDATE SET
      url = EXCLUDED.url,
      storage_bucket = EXCLUDED.storage_bucket,
      storage_path = EXCLUDED.storage_path,
      crag_id = EXCLUDED.crag_id,
      submission_id = EXCLUDED.submission_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      capture_date = EXCLUDED.capture_date,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      natural_width = EXCLUDED.natural_width,
      natural_height = EXCLUDED.natural_height,
      face_direction = EXCLUDED.face_direction,
      face_directions = EXCLUDED.face_directions,
      created_by = EXCLUDED.created_by,
      is_primary = EXCLUDED.is_primary,
      is_anonymous_submission = EXCLUDED.is_anonymous_submission,
      visibility = EXCLUDED.visibility,
      moderation_status = EXCLUDED.moderation_status,
      processing_status = EXCLUDED.processing_status,
      status = EXCLUDED.status,
      face_order = EXCLUDED.face_order,
      location_mode = EXCLUDED.location_mode
    RETURNING id INTO current_live_image_id;

    INSERT INTO public.crag_images (
      crag_id, url, width, height, source_image_id, linked_image_id, face_directions, latitude, longitude
    ) VALUES (
      draft_row.crag_id, format('private://%s/%s', image_row.storage_bucket, image_row.storage_path), image_row.width, image_row.height,
      NULL, current_live_image_id, COALESCE(orientation_text, ARRAY[]::TEXT[]), image_latitude, image_longitude
    ) RETURNING id INTO current_crag_image_id;

    IF image_row.id = default_draft_image_id THEN
      default_live_image_id := current_live_image_id;
    END IF;

    all_live_image_ids := array_append(all_live_image_ids, current_live_image_id);
    image_id_map := image_id_map || jsonb_build_object(image_row.id::TEXT, current_live_image_id::TEXT);

    UPDATE public.submission_draft_images
    SET linked_image_id = current_live_image_id,
        linked_crag_image_id = current_crag_image_id,
        submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = image_row.id;
  END LOOP;

  IF default_live_image_id IS NULL THEN
    RAISE EXCEPTION 'Default live image mapping is missing';
  END IF;

  FOR route_row IN
    SELECT * FROM public.submission_draft_routes dr
    WHERE dr.draft_id = draft_row.id
    ORDER BY dr.draft_image_id, dr.sequence_order, dr.created_at
  LOOP
    current_live_image_id := NULLIF(COALESCE(image_id_map->>route_row.draft_image_id::TEXT, ''), '')::UUID;
    IF current_live_image_id IS NULL THEN
      CONTINUE;
    END IF;

    route_name := COALESCE(NULLIF(BTRIM(route_row.name), ''), 'Unnamed');
    route_grade := COALESCE(NULLIF(BTRIM(route_row.grade), ''), '6A');
    route_description := NULLIF(BTRIM(COALESCE(route_row.description, '')), '');
    route_type_normalized := REPLACE(LOWER(COALESCE(NULLIF(BTRIM(route_row.climb_type), ''), route_type_default)), '_', '-');

    base_route_slug := COALESCE(NULLIF(public.slugify(route_name), 'unnamed'), 'route');
    route_slug := base_route_slug;
    WHILE EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = draft_row.crag_id AND slug = route_slug) LOOP
      route_slug := base_route_slug || '-' || substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
    END LOOP;

    created_climb_id := gen_random_uuid();
    INSERT INTO public.climbs (id, name, grade, status, route_type, description, user_id, crag_id, slug)
    VALUES (created_climb_id, route_name, route_grade, 'approved', route_type_normalized, route_description, current_user_id, draft_row.crag_id, route_slug);

    INSERT INTO public.route_lines (image_id, climb_id, points, color, sequence_order, image_width, image_height)
    VALUES (current_live_image_id, created_climb_id, route_row.points, 'red', route_row.sequence_order, COALESCE(route_row.image_width, image_row.width, 1200), COALESCE(route_row.image_height, image_row.height, 1200))
    RETURNING id INTO created_route_line_id;

    all_climb_ids := array_append(all_climb_ids, created_climb_id);
    all_route_line_ids := array_append(all_route_line_ids, created_route_line_id);
  END LOOP;

  UPDATE public.submission_drafts
  SET status = 'submitted',
      metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'publishedImageId', default_live_image_id,
        'publishedAt', NOW(),
        'publishedClimbIds', to_jsonb(all_climb_ids),
        'publishedRouteLineIds', to_jsonb(all_route_line_ids),
        'allPublishedImageIds', to_jsonb(all_live_image_ids),
        'submissionId', created_submission_id
      ),
      updated_at = NOW()
  WHERE id = draft_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'submitted',
    'draft_id', draft_row.id,
    'image_id', default_live_image_id,
    'default_image_id', default_live_image_id,
    'image_ids', to_jsonb(all_live_image_ids),
    'climb_ids', to_jsonb(all_climb_ids),
    'route_line_ids', to_jsonb(all_route_line_ids),
    'published_at', NOW(),
    'submission_id', created_submission_id
  );
END;
$$;

INSERT INTO public.submission_draft_routes (
  id,
  draft_id,
  draft_image_id,
  name,
  grade,
  description,
  climb_type,
  points,
  sequence_order,
  image_width,
  image_height,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  COALESCE(NULLIF(BTRIM(route_item->>'id'), ''), gen_random_uuid()::TEXT)::UUID,
  di.draft_id,
  di.id,
  COALESCE(NULLIF(BTRIM(route_item->>'name'), ''), 'Unnamed route'),
  COALESCE(NULLIF(BTRIM(route_item->>'grade'), ''), '6A'),
  NULLIF(BTRIM(route_item->>'description'), ''),
  CASE
    WHEN REPLACE(LOWER(COALESCE(route_item->>'climbType', 'sport')), '_', '-') IN ('sport', 'boulder', 'trad', 'deep-water-solo')
      THEN REPLACE(LOWER(COALESCE(route_item->>'climbType', 'sport')), '_', '-')
    ELSE 'sport'
  END,
  CASE
    WHEN jsonb_typeof(route_item->'points') = 'array' THEN route_item->'points'
    ELSE '[]'::JSONB
  END,
  COALESCE((route_item->>'sequenceOrder')::INTEGER, route_index - 1),
  NULLIF(route_item->>'imageWidth', '')::INTEGER,
  NULLIF(route_item->>'imageHeight', '')::INTEGER,
  sd.user_id,
  sd.user_id,
  COALESCE(di.created_at, NOW()),
  COALESCE(di.updated_at, NOW())
FROM public.submission_draft_images di
JOIN public.submission_drafts sd ON sd.id = di.draft_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(di.route_data->'completedRoutes', '[]'::JSONB)) WITH ORDINALITY AS routes(route_item, route_index)
WHERE jsonb_typeof(COALESCE(di.route_data->'completedRoutes', '[]'::JSONB)) = 'array'
  AND jsonb_array_length(COALESCE(di.route_data->'completedRoutes', '[]'::JSONB)) > 0
  AND jsonb_typeof(COALESCE(route_item->'points', '[]'::JSONB)) = 'array'
  AND jsonb_array_length(COALESCE(route_item->'points', '[]'::JSONB)) >= 2
ON CONFLICT (id) DO NOTHING;
