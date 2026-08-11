CREATE OR REPLACE FUNCTION public.touch_submission_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := GREATEST(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', OLD.updated_at) + interval '1 millisecond'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_submission_draft_atomic(
  p_draft_id uuid,
  p_expected_updated_at timestamptz,
  p_images jsonb,
  p_route_sets jsonb,
  p_metadata jsonb,
  p_crag_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_draft public.submission_drafts%ROWTYPE;
  v_updated_draft public.submission_drafts%ROWTYPE;
  v_image jsonb;
  v_route_set jsonb;
  v_route jsonb;
  v_route_id uuid;
  v_route_ids uuid[];
  v_route_index bigint;
  v_draft_image_id uuid;
  v_route_count integer;
  v_updated_count integer;
  v_written_route_id uuid;
  v_climb_type text;
  v_points jsonb;
  v_new_metadata jsonb;
  v_existing_submission jsonb;
  v_patch_submission jsonb;
  v_existing_location jsonb;
  v_patch_location jsonb;
BEGIN
  IF p_draft_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft ID is required', DETAIL = 'invalid_payload';
  END IF;

  SELECT * INTO v_draft
  FROM public.submission_drafts AS draft
  WHERE draft.id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft not found', DETAIL = 'not_found';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (
      v_actor_id IS NULL
      OR (
        v_actor_id IS DISTINCT FROM v_draft.user_id
        AND NOT public.is_submission_draft_collaborator(v_draft.id, v_actor_id)
      )
    ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;
  IF v_draft.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft is not editable', DETAIL = 'draft_not_editable';
  END IF;
  IF p_expected_updated_at IS NULL
    OR date_trunc('milliseconds', v_draft.updated_at)
      IS DISTINCT FROM date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Draft changed while saving',
      DETAIL = 'draft_conflict',
      HINT = v_draft.updated_at::text;
  END IF;

  PERFORM public.require_open_data_consent();

  PERFORM 1
  FROM public.submission_draft_images AS image
  WHERE image.draft_id = v_draft.id
  ORDER BY image.id
  FOR UPDATE;

  PERFORM 1
  FROM public.submission_draft_routes AS route
  WHERE route.draft_id = v_draft.id
  ORDER BY route.id
  FOR UPDATE;

  IF p_images IS NULL OR jsonb_typeof(p_images) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_images) = 0
    OR p_route_sets IS NULL OR jsonb_typeof(p_route_sets) IS DISTINCT FROM 'array'
    OR p_metadata IS NULL OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid draft save payload', DETAIL = 'invalid_payload';
  END IF;
  IF p_crag_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.crags AS crag WHERE crag.id = p_crag_id) THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft crag does not exist', DETAIL = 'invalid_payload';
  END IF;

  FOR v_image IN SELECT value FROM jsonb_array_elements(p_images)
  LOOP
    IF jsonb_typeof(v_image) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_image->'id') IS DISTINCT FROM 'string'
      OR (v_image->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_image->'display_order') IS DISTINCT FROM 'number'
      OR (v_image->>'display_order') !~ '^[0-9]+$'
      OR (CASE WHEN (v_image->>'display_order') ~ '^[0-9]+$'
        THEN (v_image->>'display_order')::numeric > 2147483647 ELSE false END)
      OR jsonb_typeof(v_image->'route_data') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING MESSAGE = 'Invalid draft image payload', DETAIL = 'invalid_payload';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM jsonb_array_elements(p_images))
      IS DISTINCT FROM (SELECT count(DISTINCT (image->>'id')::uuid) FROM jsonb_array_elements(p_images) AS payload(image))
    OR (SELECT count(*) FROM jsonb_array_elements(p_images))
      IS DISTINCT FROM (SELECT count(DISTINCT (image->>'display_order')::integer) FROM jsonb_array_elements(p_images) AS payload(image))
    OR (SELECT min((image->>'display_order')::integer) FROM jsonb_array_elements(p_images) AS payload(image)) <> 0
    OR (SELECT max((image->>'display_order')::integer) FROM jsonb_array_elements(p_images) AS payload(image))
      <> jsonb_array_length(p_images) - 1
    OR jsonb_array_length(p_images)
      <> (SELECT count(*) FROM public.submission_draft_images AS image WHERE image.draft_id = v_draft.id)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_images) AS payload(image)
      LEFT JOIN public.submission_draft_images AS existing
        ON existing.id = (payload.image->>'id')::uuid
       AND existing.draft_id = v_draft.id
      WHERE existing.id IS NULL
    ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Images must be a complete, unique, contiguously ordered draft snapshot',
      DETAIL = 'invalid_payload';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_route_sets) AS payload(route_set)
    WHERE jsonb_typeof(payload.route_set) IS DISTINCT FROM 'object'
      OR jsonb_typeof(payload.route_set->'draftImageId') IS DISTINCT FROM 'string'
      OR (payload.route_set->>'draftImageId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(payload.route_set->'routes') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid route set payload', DETAIL = 'invalid_payload';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_route_sets))
      IS DISTINCT FROM (
        SELECT count(DISTINCT (route_set->>'draftImageId')::uuid)
        FROM jsonb_array_elements(p_route_sets) AS payload(route_set)
      ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_route_sets) AS payload(route_set)
        LEFT JOIN public.submission_draft_images AS image
          ON image.id = (payload.route_set->>'draftImageId')::uuid
         AND image.draft_id = v_draft.id
        WHERE image.id IS NULL
      ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid route set payload', DETAIL = 'invalid_payload';
  END IF;

  WITH ordered AS (
    SELECT image.id, row_number() OVER (ORDER BY image.display_order, image.id) AS ordinal
    FROM public.submission_draft_images AS image
    WHERE image.draft_id = v_draft.id
  )
  UPDATE public.submission_draft_images AS image
  SET display_order = 1000000 + ordered.ordinal
  FROM ordered
  WHERE image.id = ordered.id;

  UPDATE public.submission_draft_images AS image
  SET display_order = (payload.image->>'display_order')::integer,
      route_data = payload.image->'route_data'
  FROM jsonb_array_elements(p_images) AS payload(image)
  WHERE image.id = (payload.image->>'id')::uuid
    AND image.draft_id = v_draft.id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  FOR v_route_set IN SELECT value FROM jsonb_array_elements(p_route_sets)
  LOOP
    v_draft_image_id := (v_route_set->>'draftImageId')::uuid;
      v_route_ids := ARRAY[]::uuid[];
    v_route_count := 0;

    FOR v_route, v_route_index IN
      SELECT value, ordinality
      FROM jsonb_array_elements(v_route_set->'routes') WITH ORDINALITY
    LOOP
      IF jsonb_typeof(v_route) IS DISTINCT FROM 'object'
        OR (v_route ? 'points' AND jsonb_typeof(v_route->'points') IS DISTINCT FROM 'array')
        OR (v_route ? 'sequenceOrder' AND (
          jsonb_typeof(v_route->'sequenceOrder') IS DISTINCT FROM 'number'
          OR (v_route->>'sequenceOrder') !~ '^[0-9]+$'
          OR (CASE WHEN (v_route->>'sequenceOrder') ~ '^[0-9]+$'
            THEN (v_route->>'sequenceOrder')::numeric > 2147483647 ELSE false END)
        ))
        OR (v_route ? 'imageWidth' AND v_route->'imageWidth' <> 'null'::jsonb AND (
          jsonb_typeof(v_route->'imageWidth') IS DISTINCT FROM 'number'
          OR (v_route->>'imageWidth') !~ '^[1-9][0-9]*$'
          OR (CASE WHEN (v_route->>'imageWidth') ~ '^[1-9][0-9]*$'
            THEN (v_route->>'imageWidth')::numeric > 2147483647 ELSE false END)
        ))
        OR (v_route ? 'imageHeight' AND v_route->'imageHeight' <> 'null'::jsonb AND (
          jsonb_typeof(v_route->'imageHeight') IS DISTINCT FROM 'number'
          OR (v_route->>'imageHeight') !~ '^[1-9][0-9]*$'
          OR (CASE WHEN (v_route->>'imageHeight') ~ '^[1-9][0-9]*$'
            THEN (v_route->>'imageHeight')::numeric > 2147483647 ELSE false END)
        )) THEN
        RAISE EXCEPTION USING MESSAGE = 'Invalid draft route payload', DETAIL = 'invalid_payload';
      END IF;

      v_route_id := CASE
        WHEN COALESCE(v_route->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (v_route->>'id')::uuid
        ELSE extensions.gen_random_uuid()
      END;
      IF array_position(v_route_ids, v_route_id) IS NOT NULL THEN
        RAISE EXCEPTION USING MESSAGE = 'Duplicate route ID in payload', DETAIL = 'invalid_payload';
      END IF;
      v_points := CASE WHEN jsonb_typeof(v_route->'points') = 'array' THEN v_route->'points' ELSE '[]'::jsonb END;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_points) AS point(value)
        WHERE jsonb_typeof(point.value) IS DISTINCT FROM 'object'
          OR jsonb_typeof(point.value->'x') IS DISTINCT FROM 'number'
          OR jsonb_typeof(point.value->'y') IS DISTINCT FROM 'number'
      ) THEN
        RAISE EXCEPTION USING MESSAGE = 'Invalid draft route points', DETAIL = 'invalid_payload';
      END IF;
      v_climb_type := replace(lower(COALESCE(v_route->>'climbType', 'sport')), '_', '-');
      IF v_climb_type NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo') THEN
        v_climb_type := 'sport';
      END IF;

      IF jsonb_array_length(v_points) >= 2 THEN
        v_route_ids := array_append(v_route_ids, v_route_id);
        v_written_route_id := NULL;
        INSERT INTO public.submission_draft_routes (
          id, draft_id, draft_image_id, name, grade, description, climb_type,
          points, sequence_order, image_width, image_height, created_by, updated_by
        ) VALUES (
          v_route_id, v_draft.id, v_draft_image_id,
          COALESCE(NULLIF(btrim(v_route->>'name'), ''), 'Unnamed route'),
          COALESCE(NULLIF(btrim(v_route->>'grade'), ''), '6A'),
          NULLIF(btrim(v_route->>'description'), ''), v_climb_type, v_points,
          COALESCE((v_route->>'sequenceOrder')::integer, v_route_index::integer - 1),
          NULLIF(v_route->>'imageWidth', '')::integer,
          NULLIF(v_route->>'imageHeight', '')::integer,
          v_actor_id, v_actor_id
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          grade = EXCLUDED.grade,
          description = EXCLUDED.description,
          climb_type = EXCLUDED.climb_type,
          points = EXCLUDED.points,
          sequence_order = EXCLUDED.sequence_order,
          image_width = EXCLUDED.image_width,
          image_height = EXCLUDED.image_height,
          updated_by = v_actor_id,
          updated_at = clock_timestamp()
        WHERE submission_draft_routes.draft_id = v_draft.id
          AND submission_draft_routes.draft_image_id = v_draft_image_id
        RETURNING id INTO v_written_route_id;

        IF v_written_route_id IS NULL THEN
          RAISE EXCEPTION USING
            MESSAGE = 'Route IDs cannot move between draft images',
            DETAIL = 'invalid_payload';
        END IF;
      END IF;
      v_route_count := v_route_count + 1;
    END LOOP;

    DELETE FROM public.submission_draft_routes AS route
    WHERE route.draft_id = v_draft.id
      AND route.draft_image_id = v_draft_image_id
      AND (v_route_count = 0 OR route.id <> ALL(v_route_ids));
  END LOOP;

  v_existing_submission := CASE
    WHEN jsonb_typeof(v_draft.metadata->'submission') = 'object' THEN v_draft.metadata->'submission'
    ELSE '{}'::jsonb
  END;
  v_patch_submission := CASE
    WHEN jsonb_typeof(p_metadata->'submission') = 'object' THEN p_metadata->'submission'
    ELSE '{}'::jsonb
  END;
  v_existing_location := CASE
    WHEN jsonb_typeof(v_existing_submission->'location') = 'object' THEN v_existing_submission->'location'
    ELSE '{}'::jsonb
  END;
  v_patch_location := CASE
    WHEN jsonb_typeof(v_patch_submission->'location') = 'object' THEN v_patch_submission->'location'
    ELSE '{}'::jsonb
  END;
  v_new_metadata := CASE
    WHEN jsonb_typeof(v_draft.metadata) = 'object' THEN v_draft.metadata
    ELSE '{}'::jsonb
  END || p_metadata;
  v_new_metadata := v_new_metadata || jsonb_build_object(
    'submission',
    (v_existing_submission || v_patch_submission)
      || jsonb_build_object('location', v_existing_location || v_patch_location)
  );

  UPDATE public.submission_drafts AS draft
  SET metadata = v_new_metadata,
      crag_id = p_crag_id,
      last_edited_by = v_actor_id
  WHERE draft.id = v_draft.id
    AND draft.status = 'draft'
  RETURNING * INTO v_updated_draft;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while saving', DETAIL = 'draft_conflict';
  END IF;

  RETURN jsonb_build_object(
    'draft_id', v_updated_draft.id,
    'updated_at', v_updated_draft.updated_at,
    'updated_count', v_updated_count,
    'images', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', image.id,
        'display_order', image.display_order,
        'route_data', image.route_data,
        'updated_at', image.updated_at
      ) ORDER BY image.display_order, image.id)
      FROM public.submission_draft_images AS image
      WHERE image.draft_id = v_draft.id
    ),
    'routeSets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'draftImageId', submitted.route_set->>'draftImageId',
        'routes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', route.id,
            'name', route.name,
            'grade', route.grade,
            'description', route.description,
            'climbType', route.climb_type,
            'points', route.points,
            'sequenceOrder', route.sequence_order,
            'imageWidth', route.image_width,
            'imageHeight', route.image_height
          ) ORDER BY route.sequence_order, route.created_at, route.id)
          FROM public.submission_draft_routes AS route
          WHERE route.draft_id = v_draft.id
            AND route.draft_image_id = (submitted.route_set->>'draftImageId')::uuid
        ), '[]'::jsonb)
      ) ORDER BY submitted.ordinality), '[]'::jsonb)
      FROM jsonb_array_elements(p_route_sets) WITH ORDINALITY AS submitted(route_set, ordinality)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_submission_draft_atomic(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_submission_draft_atomic(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  TO authenticated, service_role;
