ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS is_anonymous_submission BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_images_is_anonymous_submission
  ON public.images (is_anonymous_submission);

CREATE OR REPLACE FUNCTION public.update_own_submission_anonymity(
  p_image_id UUID,
  p_is_anonymous BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  next_is_anonymous BOOLEAN := COALESCE(p_is_anonymous, FALSE);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.id = p_image_id
      AND i.created_by = current_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  UPDATE public.images
  SET is_anonymous_submission = next_is_anonymous
  WHERE id = p_image_id;

  RETURN jsonb_build_object(
    'isAnonymousSubmission', next_is_anonymous
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_submission_anonymity(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_submission_anonymity(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_submission_anonymity(UUID, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.promote_draft_to_submission(
  p_draft_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  draft_row public.submission_drafts%ROWTYPE;
  primary_index INTEGER;
  primary_draft_image_id UUID;
  primary_live_image_id UUID;
  current_live_image_id UUID;
  current_crag_image_id UUID;
  published_image_id UUID;
  published_at TEXT;
  climb_ids_json JSONB;
  route_line_ids_json JSONB;
  image_ids_json JSONB;
  all_live_image_ids UUID[] := ARRAY[]::UUID[];
  all_climb_ids UUID[] := ARRAY[]::UUID[];
  all_route_line_ids UUID[] := ARRAY[]::UUID[];
  image_id_map JSONB := '{}'::JSONB;
  route_type_default TEXT;
  route_type_raw TEXT;
  route_type_normalized TEXT;
  image_row RECORD;
  route_item JSONB;
  route_index INTEGER;
  route_name TEXT;
  route_grade TEXT;
  route_description TEXT;
  route_slug TEXT;
  route_points JSONB;
  route_sequence_order INTEGER;
  route_image_width INTEGER;
  route_image_height INTEGER;
  created_climb_id UUID;
  created_route_line_id UUID;
  face_directions_by_image JSONB;
  legacy_face_directions JSONB;
  face_directions_json JSONB;
  face_directions_text TEXT[];
  anonymous_submission BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_draft_id IS NULL THEN
    RAISE EXCEPTION 'Draft ID is required';
  END IF;

  SELECT *
  INTO draft_row
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  anonymous_submission := COALESCE((draft_row.metadata->>'isAnonymousSubmission')::BOOLEAN, FALSE);

  IF draft_row.user_id <> current_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF draft_row.status = 'submitted' THEN
    published_image_id := NULLIF(COALESCE(draft_row.metadata->>'publishedImageId', draft_row.metadata->>'image_id', ''), '')::UUID;
    published_at := NULLIF(COALESCE(draft_row.metadata->>'publishedAt', draft_row.metadata->>'submittedAt', ''), '');
    image_ids_json := COALESCE(draft_row.metadata->'allPublishedImageIds', '[]'::JSONB);
    climb_ids_json := COALESCE(draft_row.metadata->'publishedClimbIds', draft_row.metadata->'climb_ids', '[]'::JSONB);
    route_line_ids_json := COALESCE(draft_row.metadata->'publishedRouteLineIds', draft_row.metadata->'route_line_ids', '[]'::JSONB);

    IF published_image_id IS NULL THEN
      SELECT di.linked_image_id
      INTO published_image_id
      FROM public.submission_draft_images di
      WHERE di.draft_id = draft_row.id
      ORDER BY di.display_order
      LIMIT 1;
    END IF;

    IF published_image_id IS NULL THEN
      RAISE EXCEPTION 'Draft was submitted but publish metadata is missing';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_submitted',
      'draft_id', draft_row.id,
      'image_id', published_image_id,
      'image_ids', COALESCE(image_ids_json, '[]'::JSONB),
      'climb_ids', COALESCE(climb_ids_json, '[]'::JSONB),
      'route_line_ids', COALESCE(route_line_ids_json, '[]'::JSONB),
      'published_at', published_at
    );
  END IF;

  IF draft_row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft submissions can be promoted';
  END IF;

  IF draft_row.crag_id IS NULL THEN
    RAISE EXCEPTION 'Draft must have a crag before publishing';
  END IF;

  SELECT COUNT(*) INTO route_index
  FROM public.submission_draft_images
  WHERE draft_id = draft_row.id;

  IF route_index = 0 THEN
    RAISE EXCEPTION 'Draft has no images to publish';
  END IF;

  primary_index := COALESCE((draft_row.metadata->>'primaryIndex')::INTEGER, 0);
  IF primary_index < 0 OR primary_index >= route_index THEN
    primary_index := 0;
  END IF;

  SELECT di.id
  INTO primary_draft_image_id
  FROM public.submission_draft_images di
  WHERE di.draft_id = draft_row.id
  ORDER BY di.display_order
  OFFSET primary_index
  LIMIT 1;

  IF primary_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Primary draft image is missing';
  END IF;

  face_directions_by_image := COALESCE(draft_row.metadata->'faceDirectionsByImage', '{}'::JSONB);
  legacy_face_directions := COALESCE(draft_row.metadata->'faceDirections', '[]'::JSONB);
  route_type_default := NULLIF(btrim(COALESCE(draft_row.metadata->>'routeType', '')), '');
  IF route_type_default IS NULL THEN
    route_type_default := 'sport';
  END IF;

  SELECT di.*
  INTO image_row
  FROM public.submission_draft_images di
  WHERE di.id = primary_draft_image_id
    AND di.draft_id = draft_row.id;

  IF jsonb_typeof(face_directions_by_image) = 'object'
    AND jsonb_typeof(COALESCE(face_directions_by_image->(image_row.display_order::TEXT), 'null'::JSONB)) = 'array' THEN
    face_directions_json := face_directions_by_image->(image_row.display_order::TEXT);
  ELSE
    face_directions_json := legacy_face_directions;
  END IF;

  face_directions_text := ARRAY(
    SELECT jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(face_directions_json) = 'array' THEN face_directions_json
        ELSE '[]'::JSONB
      END
    )
  );

  INSERT INTO public.images (
    url,
    storage_bucket,
    storage_path,
    crag_id,
    width,
    height,
    natural_width,
    natural_height,
    face_direction,
    face_directions,
    created_by,
    parent_image_id,
    is_primary,
    is_anonymous_submission
  )
  VALUES (
    format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
    image_row.storage_bucket,
    image_row.storage_path,
    draft_row.crag_id,
    image_row.width,
    image_row.height,
    image_row.width,
    image_row.height,
    CASE WHEN array_length(face_directions_text, 1) IS NULL THEN NULL ELSE face_directions_text[1] END,
    face_directions_text,
    current_user_id,
    NULL,
    TRUE,
    anonymous_submission
  )
  RETURNING id INTO primary_live_image_id;

  all_live_image_ids := array_append(all_live_image_ids, primary_live_image_id);
  image_id_map := image_id_map || jsonb_build_object(primary_draft_image_id::TEXT, primary_live_image_id::TEXT);

  UPDATE public.submission_draft_images
  SET
    linked_image_id = primary_live_image_id,
    linked_crag_image_id = NULL,
    submitted_at = NOW(),
    updated_at = NOW()
  WHERE id = primary_draft_image_id;

  FOR image_row IN
    SELECT *
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
      AND di.id <> primary_draft_image_id
    ORDER BY di.display_order
  LOOP
    IF jsonb_typeof(face_directions_by_image) = 'object'
      AND jsonb_typeof(COALESCE(face_directions_by_image->(image_row.display_order::TEXT), 'null'::JSONB)) = 'array' THEN
      face_directions_json := face_directions_by_image->(image_row.display_order::TEXT);
    ELSE
      face_directions_json := '[]'::JSONB;
    END IF;

    face_directions_text := ARRAY(
      SELECT jsonb_array_elements_text(COALESCE(face_directions_json, '[]'::JSONB))
    );

    INSERT INTO public.images (
      url,
      storage_bucket,
      storage_path,
      crag_id,
      width,
      height,
      natural_width,
      natural_height,
      face_direction,
      face_directions,
      created_by,
      parent_image_id,
      is_primary,
      is_anonymous_submission
    )
    VALUES (
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.storage_bucket,
      image_row.storage_path,
      draft_row.crag_id,
      image_row.width,
      image_row.height,
      image_row.width,
      image_row.height,
      CASE WHEN array_length(face_directions_text, 1) IS NULL THEN NULL ELSE face_directions_text[1] END,
      face_directions_text,
      current_user_id,
      primary_live_image_id,
      FALSE,
      anonymous_submission
    )
    RETURNING id INTO current_live_image_id;

    INSERT INTO public.crag_images (
      crag_id,
      url,
      width,
      height,
      source_image_id,
      linked_image_id,
      face_directions
    )
    VALUES (
      draft_row.crag_id,
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.width,
      image_row.height,
      primary_live_image_id,
      current_live_image_id,
      face_directions_text
    )
    RETURNING id INTO current_crag_image_id;

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
      route_name := btrim(COALESCE(route_item->>'name', ''));
      route_grade := btrim(COALESCE(route_item->>'grade', ''));
      route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
      route_slug := NULLIF(btrim(COALESCE(route_item->>'slug', '')), '');
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

      route_type_raw := NULLIF(btrim(COALESCE(route_item->>'climbType', route_type_default)), '');
      route_type_normalized := replace(lower(COALESCE(route_type_raw, route_type_default)), '_', '-');
      IF route_type_normalized = 'bouldering' THEN
        route_type_normalized := 'boulder';
      END IF;
      IF route_type_normalized NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo') THEN
        route_type_normalized := 'sport';
      END IF;

      INSERT INTO public.climbs (
        name,
        slug,
        grade,
        description,
        route_type,
        status,
        user_id,
        crag_id
      )
      VALUES (
        route_name,
        route_slug,
        route_grade,
        route_description,
        route_type_normalized,
        'approved',
        current_user_id,
        draft_row.crag_id
      )
      RETURNING id INTO created_climb_id;

      INSERT INTO public.route_lines (
        image_id,
        climb_id,
        points,
        color,
        sequence_order,
        image_width,
        image_height
      )
      VALUES (
        current_live_image_id,
        created_climb_id,
        route_points,
        'red',
        route_sequence_order,
        route_image_width,
        route_image_height
      )
      RETURNING id INTO created_route_line_id;

      all_climb_ids := array_append(all_climb_ids, created_climb_id);
      all_route_line_ids := array_append(all_route_line_ids, created_route_line_id);
      route_index := route_index + 1;
    END LOOP;
  END LOOP;

  UPDATE public.submission_drafts
  SET
    status = 'submitted',
    metadata = COALESCE(metadata, '{}'::JSONB)
      || jsonb_build_object(
        'publishedImageId', primary_live_image_id,
        'allPublishedImageIds', to_jsonb(all_live_image_ids),
        'publishedClimbIds', to_jsonb(all_climb_ids),
        'publishedRouteLineIds', to_jsonb(all_route_line_ids),
        'publishedAt', NOW(),
        'isAnonymousSubmission', anonymous_submission
      ),
    updated_at = NOW(),
    last_edited_by = current_user_id
  WHERE id = draft_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'submitted',
    'draft_id', draft_row.id,
    'image_id', primary_live_image_id,
    'image_ids', to_jsonb(all_live_image_ids),
    'climb_ids', to_jsonb(all_climb_ids),
    'route_line_ids', to_jsonb(all_route_line_ids),
    'published_at', NOW()
  );
END;
$function$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.promote_draft_to_submission(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(UUID) TO service_role';
END $$;

CREATE OR REPLACE FUNCTION public.get_climb_full_context(
  p_climb_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
WITH climb_target AS (
  SELECT
    c.id,
    c.name,
    c.grade,
    c.route_type,
    c.description
  FROM public.climbs c
  WHERE c.id = p_climb_id
),
primary_image AS (
  SELECT
    i.id,
    i.url,
    i.crag_id,
    i.width,
    i.height,
    i.natural_width,
    i.natural_height,
    i.created_by,
    i.contribution_credit_platform,
    i.contribution_credit_handle,
    i.face_directions,
    i.is_anonymous_submission
  FROM public.route_lines rl
  JOIN public.images i
    ON i.id = rl.image_id
  WHERE rl.climb_id = p_climb_id
  ORDER BY rl.sequence_order ASC NULLS LAST, rl.created_at ASC
  LIMIT 1
),
primary_routes AS (
  SELECT
    rl.id,
    rl.points,
    rl.color,
    rl.image_width,
    rl.image_height,
    rl.climb_id,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'grade', c.grade,
      'route_type', c.route_type,
      'description', c.description
    ) AS climb
  FROM public.route_lines rl
  JOIN primary_image pi
    ON pi.id = rl.image_id
  JOIN public.climbs c
    ON c.id = rl.climb_id
  ORDER BY rl.sequence_order ASC NULLS LAST, rl.created_at ASC
),
related_faces AS (
  SELECT DISTINCT ON (COALESCE(ci.linked_image_id::TEXT, 'url:' || ci.url))
    ci.id AS crag_image_id,
    ci.url,
    ci.linked_image_id,
    ci.width,
    ci.height,
    ci.face_directions,
    ci.created_at
  FROM public.crag_images ci
  JOIN primary_image pi
    ON pi.crag_id IS NOT NULL
   AND pi.crag_id = ci.crag_id
   AND (
     ci.source_image_id = pi.id
     OR (ci.source_image_id IS NULL AND ci.linked_image_id = pi.id)
   )
  ORDER BY COALESCE(ci.linked_image_id::TEXT, 'url:' || ci.url), ci.created_at ASC
),
all_face_image_ids AS (
  SELECT pi.id AS image_id
  FROM primary_image pi
  UNION
  SELECT rf.linked_image_id
  FROM related_faces rf
  WHERE rf.linked_image_id IS NOT NULL
),
route_counts AS (
  SELECT
    rl.image_id,
    COUNT(*)::INTEGER AS route_count
  FROM public.route_lines rl
  JOIN all_face_image_ids afi
    ON afi.image_id = rl.image_id
  GROUP BY rl.image_id
),
faces_agg AS (
  SELECT COALESCE(
    jsonb_agg(face_json ORDER BY face_index ASC),
    '[]'::JSONB
  ) AS faces
  FROM (
    SELECT
      0 AS face_index,
      jsonb_build_object(
        'id', 'image:' || pi.id,
        'index', 0,
        'image_id', pi.id,
        'is_primary', TRUE,
        'url', pi.url,
        'linked_image_id', pi.id,
        'crag_image_id', NULL,
        'face_directions', pi.face_directions,
        'metadata', jsonb_build_object(
          'width', COALESCE(pi.natural_width, pi.width),
          'height', COALESCE(pi.natural_height, pi.height)
        ),
        'has_routes', COALESCE(rc.route_count, 0) > 0
      ) AS face_json
    FROM primary_image pi
    LEFT JOIN route_counts rc
      ON rc.image_id = pi.id

    UNION ALL

    SELECT
      ROW_NUMBER() OVER (ORDER BY rf.created_at ASC) AS face_index,
      jsonb_build_object(
        'id', 'crag-image:' || rf.crag_image_id,
        'index', ROW_NUMBER() OVER (ORDER BY rf.created_at ASC),
        'image_id', rf.linked_image_id,
        'is_primary', FALSE,
        'url', rf.url,
        'linked_image_id', CASE WHEN rf.linked_image_id = pi.id THEN NULL ELSE rf.linked_image_id END,
        'crag_image_id', rf.crag_image_id,
        'face_directions', rf.face_directions,
        'metadata', jsonb_build_object(
          'width', COALESCE(li.natural_width, li.width, rf.width),
          'height', COALESCE(li.natural_height, li.height, rf.height)
        ),
        'has_routes', COALESCE(rc.route_count, 0) > 0
      ) AS face_json
    FROM related_faces rf
    CROSS JOIN primary_image pi
    LEFT JOIN public.images li
      ON li.id = rf.linked_image_id
    LEFT JOIN route_counts rc
      ON rc.image_id = rf.linked_image_id
  ) faces_union
),
summary AS (
  SELECT
    COALESCE((SELECT jsonb_array_length(fa.faces) FROM faces_agg fa), 0) AS total_faces,
    COALESCE((SELECT SUM(rc.route_count)::INTEGER FROM route_counts rc), 0) AS total_routes
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM climb_target) THEN NULL
  ELSE jsonb_build_object(
    'climb', (SELECT to_jsonb(ct) FROM climb_target ct),
    'primary_image', COALESCE((SELECT to_jsonb(pi) FROM primary_image pi), 'null'::JSONB),
    'primary_route_lines', COALESCE((SELECT jsonb_agg(to_jsonb(pr)) FROM primary_routes pr), '[]'::JSONB),
    'faces', COALESCE((SELECT fa.faces FROM faces_agg fa), '[]'::JSONB),
    'summary', jsonb_build_object(
      'total_faces', (SELECT s.total_faces FROM summary s),
      'total_routes', (SELECT s.total_routes FROM summary s)
    )
  )
END;
$function$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_climb_full_context(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO service_role';
END $$;
