ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS face_order INTEGER;

ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS location_mode TEXT;

UPDATE public.images
SET location_mode = CASE
  WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'custom'
  ELSE 'shared'
END
WHERE location_mode IS NULL;

ALTER TABLE public.images
  ALTER COLUMN location_mode SET DEFAULT 'shared';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_location_mode_check'
  ) THEN
    ALTER TABLE public.images
      ADD CONSTRAINT images_location_mode_check
      CHECK (location_mode IN ('shared', 'custom'));
  END IF;
END $$;

WITH ordered_images AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY submission_id
      ORDER BY CASE WHEN is_primary THEN 0 ELSE 1 END, created_at ASC NULLS LAST, id ASC
    ) - 1 AS next_face_order
  FROM public.images
  WHERE submission_id IS NOT NULL
)
UPDATE public.images AS target
SET face_order = ordered_images.next_face_order
FROM ordered_images
WHERE target.id = ordered_images.id
  AND target.face_order IS NULL;

CREATE INDEX IF NOT EXISTS images_submission_id_face_order_idx
ON public.images (submission_id, face_order)
WHERE submission_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_submission_image_metadata(
  p_image_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_face_directions TEXT[],
  p_location_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  normalized_face_directions TEXT[];
  has_access BOOLEAN := false;
  resolved_location_mode TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  SELECT true
  INTO has_access
  FROM public.images i
  WHERE i.id = p_image_id
    AND (
      i.created_by = current_user_id
      OR EXISTS (
        SELECT 1
        FROM public.submission_collaborators sc
        WHERE sc.image_id = i.id
          AND sc.user_id = current_user_id
      )
    )
  LIMIT 1;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  resolved_location_mode := COALESCE(NULLIF(BTRIM(p_location_mode), ''), 'custom');
  IF resolved_location_mode NOT IN ('shared', 'custom') THEN
    RAISE EXCEPTION 'Invalid location mode';
  END IF;

  IF resolved_location_mode = 'custom' AND (p_latitude IS NULL OR p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Custom image locations require latitude and longitude';
  END IF;

  IF p_face_directions IS NULL OR array_length(p_face_directions, 1) IS NULL THEN
    normalized_face_directions := NULL;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM unnest(p_face_directions) AS direction
      WHERE direction IS NULL
        OR btrim(direction) = ''
        OR upper(btrim(direction)) NOT IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')
    ) THEN
      RAISE EXCEPTION 'Invalid face direction provided';
    END IF;

    SELECT COALESCE(array_agg(direction ORDER BY min_idx), ARRAY[]::TEXT[])
    INTO normalized_face_directions
    FROM (
      SELECT upper(btrim(direction)) AS direction, MIN(ord) AS min_idx
      FROM unnest(p_face_directions) WITH ORDINALITY AS t(direction, ord)
      GROUP BY upper(btrim(direction))
    ) normalized;

    IF array_length(normalized_face_directions, 1) IS NULL THEN
      normalized_face_directions := NULL;
    END IF;
  END IF;

  UPDATE public.images
  SET
    latitude = CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_latitude END,
    longitude = CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_longitude END,
    location_mode = resolved_location_mode,
    face_directions = normalized_face_directions,
    face_direction = CASE
      WHEN normalized_face_directions IS NULL OR array_length(normalized_face_directions, 1) IS NULL THEN NULL
      ELSE normalized_face_directions[1]
    END,
    last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN jsonb_build_object(
    'latitude', CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_latitude END,
    'longitude', CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_longitude END,
    'location_mode', resolved_location_mode,
    'face_directions', COALESCE(to_jsonb(normalized_face_directions), '[]'::JSONB)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_image_metadata(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.update_submission_image_order(
  p_submission_id UUID,
  p_image_ids JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  image_item JSONB;
  route_image_id UUID;
  target_image_id UUID;
  updated_count INTEGER := 0;
  has_access BOOLEAN := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Submission ID is required';
  END IF;

  IF p_image_ids IS NULL OR jsonb_typeof(p_image_ids) <> 'array' OR jsonb_array_length(p_image_ids) = 0 THEN
    RAISE EXCEPTION 'At least one image id is required';
  END IF;

  SELECT i.id
  INTO route_image_id
  FROM public.images i
  WHERE i.submission_id = p_submission_id
  ORDER BY CASE WHEN i.is_primary THEN 0 ELSE 1 END, COALESCE(i.face_order, 2147483647), i.created_at ASC NULLS LAST, i.id ASC
  LIMIT 1;

  IF route_image_id IS NULL THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  SELECT true
  INTO has_access
  FROM public.images i
  WHERE i.id = route_image_id
    AND (
      i.created_by = current_user_id
      OR EXISTS (
        SELECT 1
        FROM public.submission_collaborators sc
        WHERE sc.image_id = i.id
          AND sc.user_id = current_user_id
      )
    )
  LIMIT 1;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_image_ids) AS image_id_item
    WHERE jsonb_typeof(image_id_item) <> 'string'
  ) THEN
    RAISE EXCEPTION 'Image ids must be strings';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.images i
    WHERE i.submission_id = p_submission_id
  ) <> jsonb_array_length(p_image_ids) THEN
    RAISE EXCEPTION 'Image reorder payload must include every image in the submission';
  END IF;

  IF (
    SELECT COUNT(DISTINCT value)
    FROM jsonb_array_elements_text(p_image_ids) AS value
  ) <> jsonb_array_length(p_image_ids) THEN
    RAISE EXCEPTION 'Duplicate image ids are not allowed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(p_image_ids) AS value
    LEFT JOIN public.images i ON i.id = value::UUID AND i.submission_id = p_submission_id
    WHERE i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Image reorder payload contains an image outside this submission';
  END IF;

  FOR image_item IN SELECT value FROM jsonb_array_elements(p_image_ids)
  LOOP
    target_image_id := (image_item #>> '{}')::UUID;

    UPDATE public.images
    SET
      face_order = updated_count,
      last_edited_by = current_user_id
    WHERE id = target_image_id
      AND submission_id = p_submission_id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_submission_image_order(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_submission_image_order(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_image_order(UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.update_own_submitted_routes(
  p_image_id UUID,
  p_routes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  route_item JSONB;
  route_id UUID;
  climb_id UUID;
  route_name TEXT;
  route_description TEXT;
  route_points JSONB;
  route_sequence_order INTEGER;
  updated_count INTEGER := 0;
  has_access BOOLEAN := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0 THEN
    RAISE EXCEPTION 'At least one route is required';
  END IF;

  SELECT true
  INTO has_access
  FROM public.images i
  WHERE i.id = p_image_id
    AND (
      i.created_by = current_user_id
      OR EXISTS (
        SELECT 1
        FROM public.submission_collaborators sc
        WHERE sc.image_id = i.id
          AND sc.user_id = current_user_id
      )
    )
  LIMIT 1;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'You do not have permission to edit routes for this image';
  END IF;

  FOR route_item IN SELECT value FROM jsonb_array_elements(p_routes)
  LOOP
    BEGIN
      route_id := (route_item->>'id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid route id provided';
    END;

    route_name := btrim(COALESCE(route_item->>'name', ''));
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_points := route_item->'points';
    BEGIN
      route_sequence_order := COALESCE((route_item->>'sequenceOrder')::INTEGER, updated_count);
    EXCEPTION WHEN OTHERS THEN
      route_sequence_order := updated_count;
    END;

    IF route_name = '' THEN
      RAISE EXCEPTION 'Route name is required';
    END IF;

    IF char_length(route_name) > 200 THEN
      RAISE EXCEPTION 'Route name must be 200 characters or less';
    END IF;

    IF route_description IS NOT NULL AND char_length(route_description) > 500 THEN
      RAISE EXCEPTION 'Route description must be 500 characters or less';
    END IF;

    IF route_points IS NULL OR jsonb_typeof(route_points) <> 'array' OR jsonb_array_length(route_points) < 2 THEN
      RAISE EXCEPTION 'Route points must contain at least 2 points';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(route_points) AS pt
      WHERE jsonb_typeof(pt->'x') <> 'number'
        OR jsonb_typeof(pt->'y') <> 'number'
        OR (pt->>'x')::double precision < 0
        OR (pt->>'x')::double precision > 1
        OR (pt->>'y')::double precision < 0
        OR (pt->>'y')::double precision > 1
    ) THEN
      RAISE EXCEPTION 'Route points must be normalized values between 0 and 1';
    END IF;

    SELECT rl.climb_id
    INTO climb_id
    FROM public.route_lines rl
    WHERE rl.id = route_id
      AND rl.image_id = p_image_id;

    IF climb_id IS NULL THEN
      RAISE EXCEPTION 'Route not found or not editable';
    END IF;

    UPDATE public.climbs
    SET
      name = route_name,
      description = route_description,
      updated_at = NOW()
    WHERE id = climb_id;

    UPDATE public.route_lines
    SET
      points = route_points,
      sequence_order = route_sequence_order
    WHERE id = route_id;

    updated_count := updated_count + 1;
  END LOOP;

  UPDATE public.images
  SET last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_submitted_routes(UUID, JSONB) TO service_role;

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
  route_item JSONB;
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
  route_type_raw TEXT;
  route_type_normalized TEXT;
  route_points JSONB;
  route_sequence_order INTEGER;
  route_image_width INTEGER;
  route_image_height INTEGER;
  route_slug TEXT;
  base_route_slug TEXT;
  created_climb_id UUID;
  created_route_line_id UUID;
  all_live_image_ids UUID[] := ARRAY[]::UUID[];
  all_climb_ids UUID[] := ARRAY[]::UUID[];
  all_route_line_ids UUID[] := ARRAY[]::UUID[];
  route_index INTEGER := 0;
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
  SELECT *
  INTO draft_row
  FROM public.submission_drafts
  WHERE id = p_draft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only draft submissions can be published';
  END IF;

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_can_edit_submission_draft(draft_row.id, current_user_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF draft_row.crag_id IS NULL THEN
    RAISE EXCEPTION 'Draft crag is required before publishing';
  END IF;

  IF jsonb_typeof(COALESCE(draft_row.metadata, '{}'::JSONB)) = 'object' THEN
    metadata_version := COALESCE((draft_row.metadata->>'version')::INTEGER, 1);
    anonymous_submission := COALESCE((draft_row.metadata->'submission'->>'isAnonymousSubmission')::BOOLEAN, false);
    default_draft_image_id := NULLIF(draft_row.metadata->'navigation'->>'defaultImageId', '')::UUID;
    route_type_default := COALESCE(NULLIF(BTRIM(draft_row.metadata->'submission'->>'routeType'), ''), 'sport');
  END IF;

  IF default_draft_image_id IS NULL THEN
    SELECT id
    INTO default_draft_image_id
    FROM public.submission_draft_images
    WHERE draft_id = draft_row.id
    ORDER BY display_order
    LIMIT 1;
  END IF;

  IF default_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Draft requires at least one image before publishing';
  END IF;

  FOR image_row IN
    SELECT *
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.display_order
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
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(orientation_json) = 'array' THEN orientation_json
          ELSE '[]'::JSONB
        END
      )
    );

    upload_session_uuid := (regexp_match(image_row.storage_path, 'images/originals/([0-9a-fA-F-]+)'))[1]::UUID;

    INSERT INTO public.images (
      id,
      url,
      storage_bucket,
      storage_path,
      crag_id,
      submission_id,
      latitude,
      longitude,
      capture_date,
      width,
      height,
      natural_width,
      natural_height,
      face_direction,
      face_directions,
      created_by,
      parent_image_id,
      is_primary,
      is_anonymous_submission,
      visibility,
      moderation_status,
      processing_status,
      status,
      face_order,
      location_mode
    )
    VALUES (
      upload_session_uuid,
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.storage_bucket,
      image_row.storage_path,
      draft_row.crag_id,
      created_submission_id,
      image_latitude,
      image_longitude,
      image_row.capture_date,
      image_row.width,
      image_row.height,
      image_row.width,
      image_row.height,
      CASE WHEN array_length(orientation_text, 1) IS NULL THEN NULL ELSE orientation_text[1] END,
      COALESCE(orientation_text, ARRAY[]::TEXT[]),
      current_user_id,
      NULL,
      image_row.id = default_draft_image_id,
      anonymous_submission,
      'public',
      'approved',
      'ready',
      'approved',
      image_row.display_order,
      image_location_mode
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
      crag_id,
      url,
      width,
      height,
      source_image_id,
      linked_image_id,
      face_directions,
      latitude,
      longitude
    )
    VALUES (
      draft_row.crag_id,
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.width,
      image_row.height,
      NULL,
      current_live_image_id,
      COALESCE(orientation_text, ARRAY[]::TEXT[]),
      image_latitude,
      image_longitude
    )
    RETURNING id INTO current_crag_image_id;

    IF image_row.id = default_draft_image_id THEN
      default_live_image_id := current_live_image_id;
    END IF;

    all_live_image_ids := array_append(all_live_image_ids, current_live_image_id);
    image_id_map := image_id_map || jsonb_build_object(image_row.id::TEXT, current_live_image_id::TEXT);

    UPDATE public.submission_draft_images
    SET
      linked_image_id = current_live_image_id,
      linked_crag_image_id = current_crag_image_id,
      submitted_at = NOW(),
      updated_at = NOW()
    WHERE id = image_row.id;
  END LOOP;

  IF default_live_image_id IS NULL THEN
    RAISE EXCEPTION 'Default live image mapping is missing';
  END IF;

  FOR image_row IN
    SELECT *
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.display_order
  LOOP
    current_live_image_id := NULLIF(COALESCE(image_id_map->>image_row.id::TEXT, ''), '')::UUID;
    IF current_live_image_id IS NULL THEN
      RAISE EXCEPTION 'Missing image mapping for draft image %', image_row.id;
    END IF;

    route_index := 0;
    FOR route_item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(image_row.route_data->'completedRoutes', '[]'::JSONB))
    LOOP
      route_name := NULLIF(BTRIM(COALESCE(route_item->>'name', '')), '');
      IF route_name IS NULL OR route_name = '' THEN
        route_name := 'Unnamed';
      END IF;
      route_grade := BTRIM(COALESCE(route_item->>'grade', ''));
      route_description := NULLIF(BTRIM(COALESCE(route_item->>'description', '')), '');
      route_slug := NULLIF(BTRIM(COALESCE(route_item->>'slug', '')), '');
      route_points := route_item->'points';

      IF route_name = '' OR route_grade = '' THEN
        route_index := route_index + 1;
        CONTINUE;
      END IF;

      IF route_points IS NULL OR jsonb_typeof(route_points) <> 'array' OR jsonb_array_length(route_points) < 2 THEN
        route_index := route_index + 1;
        CONTINUE;
      END IF;

      BEGIN
        route_sequence_order := COALESCE((route_item->>'sequenceOrder')::INTEGER, route_index);
      EXCEPTION WHEN OTHERS THEN
        route_sequence_order := route_index;
      END;

      BEGIN
        route_image_width := COALESCE((route_item->>'imageWidth')::INTEGER, image_row.width, 1200);
      EXCEPTION WHEN OTHERS THEN
        route_image_width := COALESCE(image_row.width, 1200);
      END;

      BEGIN
        route_image_height := COALESCE((route_item->>'imageHeight')::INTEGER, image_row.height, 1200);
      EXCEPTION WHEN OTHERS THEN
        route_image_height := COALESCE(image_row.height, 1200);
      END;

      route_type_raw := NULLIF(BTRIM(COALESCE(route_item->>'climbType', route_type_default)), '');
      route_type_normalized := REPLACE(LOWER(COALESCE(route_type_raw, route_type_default)), '_', '-');

      base_route_slug := COALESCE(NULLIF(route_slug, ''), NULLIF(public.slugify(route_name), 'unnamed'), 'route');
      route_slug := base_route_slug;
      WHILE EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = draft_row.crag_id AND slug = route_slug) LOOP
        route_slug := base_route_slug || '-' || substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
      END LOOP;

      created_climb_id := gen_random_uuid();

      INSERT INTO public.climbs (
        id, name, grade, status, route_type, description, user_id, crag_id, slug
      ) VALUES (
        created_climb_id, route_name, route_grade, 'approved', route_type_normalized, route_description, current_user_id, draft_row.crag_id, route_slug
      );

      INSERT INTO public.route_lines (
        image_id, climb_id, points, color, sequence_order, image_width, image_height
      ) VALUES (
        current_live_image_id, created_climb_id, route_points, 'red', route_sequence_order, route_image_width, route_image_height
      ) RETURNING id INTO created_route_line_id;

      all_climb_ids := array_append(all_climb_ids, created_climb_id);
      all_route_line_ids := array_append(all_route_line_ids, created_route_line_id);
      route_index := route_index + 1;
    END LOOP;
  END LOOP;

  UPDATE public.submission_drafts
  SET
    status = 'submitted',
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
