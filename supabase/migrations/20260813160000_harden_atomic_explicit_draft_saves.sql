ALTER FUNCTION public.save_submission_draft_atomic(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  RENAME TO save_submission_draft_atomic_20260811_internal;

REVOKE ALL ON FUNCTION public.save_submission_draft_atomic_20260811_internal(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_image_metadata jsonb;
  v_location jsonb;
  v_canvas_source jsonb;
  v_result jsonb;
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
    OR p_metadata IS NULL OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_metadata->'version') IS DISTINCT FROM 'number'
    OR (p_metadata->>'version') !~ '^2$'
    OR jsonb_typeof(p_metadata->'navigation') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_metadata->'images') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_metadata->'submission') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid V2 draft metadata', DETAIL = 'invalid_payload';
  END IF;
  IF p_crag_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.crags AS crag WHERE crag.id = p_crag_id) THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft crag does not exist', DETAIL = 'invalid_payload';
  END IF;

  -- The V2 image metadata is a complete snapshot keyed by the same image IDs.
  IF (SELECT count(*) FROM jsonb_object_keys(p_metadata->'images'))
      IS DISTINCT FROM jsonb_array_length(p_images)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_images) AS payload(image)
      WHERE jsonb_typeof(payload.image) IS DISTINCT FROM 'object'
        OR jsonb_typeof(payload.image->'id') IS DISTINCT FROM 'string'
        OR (payload.image->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR jsonb_typeof(payload.image->'display_order') IS DISTINCT FROM 'number'
        OR (payload.image->>'display_order') !~ '^[0-9]+$'
        OR jsonb_typeof(payload.image->'route_data') IS DISTINCT FROM 'object'
        OR NOT (p_metadata->'images' ? (payload.image->>'id'))
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_metadata->'images') AS metadata_image(image_id)
      WHERE metadata_image.image_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_images) AS payload(image)
          WHERE payload.image->>'id' = metadata_image.image_id
        )
    ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid draft image metadata membership', DETAIL = 'invalid_payload';
  END IF;

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

  FOR v_image_metadata IN
    SELECT value FROM jsonb_each(p_metadata->'images')
  LOOP
    IF jsonb_typeof(v_image_metadata) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_image_metadata->'imageId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_image_metadata->'displayOrder') IS DISTINCT FROM 'number'
      OR (v_image_metadata->>'displayOrder') !~ '^[0-9]+$'
      OR (CASE WHEN (v_image_metadata->>'displayOrder') ~ '^[0-9]+$'
        THEN (v_image_metadata->>'displayOrder')::numeric > 2147483647 ELSE false END)
      OR jsonb_typeof(v_image_metadata->'locationMode') IS DISTINCT FROM 'string'
      OR v_image_metadata->>'locationMode' NOT IN ('shared', 'custom')
      OR jsonb_typeof(v_image_metadata->'gps') IS DISTINCT FROM 'object'
      OR (v_image_metadata ? 'orientation' AND jsonb_typeof(v_image_metadata->'orientation') IS DISTINCT FROM 'array')
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(v_image_metadata->'orientation') = 'array' THEN v_image_metadata->'orientation'
          ELSE '[]'::jsonb
        END) AS direction(value)
        WHERE jsonb_typeof(direction.value) IS DISTINCT FROM 'string'
          OR direction.value #>> '{}' NOT IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')
      ) THEN
      RAISE EXCEPTION USING MESSAGE = 'Invalid draft image metadata', DETAIL = 'invalid_payload';
    END IF;

    v_location := v_image_metadata->'gps';
    IF NOT (v_location ? 'latitude') OR NOT (v_location ? 'longitude')
      OR ((v_location->'latitude' = 'null'::jsonb) IS DISTINCT FROM (v_location->'longitude' = 'null'::jsonb))
      OR (v_location->'latitude' <> 'null'::jsonb AND (
        jsonb_typeof(v_location->'latitude') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_location->'longitude') IS DISTINCT FROM 'number'
        OR CASE WHEN jsonb_typeof(v_location->'latitude') = 'number'
          THEN (v_location->>'latitude')::numeric NOT BETWEEN -90 AND 90 ELSE false END
        OR CASE WHEN jsonb_typeof(v_location->'longitude') = 'number'
          THEN (v_location->>'longitude')::numeric NOT BETWEEN -180 AND 180 ELSE false END
      ))
      OR (v_image_metadata->>'locationMode' = 'custom' AND v_location->'latitude' = 'null'::jsonb) THEN
      RAISE EXCEPTION USING MESSAGE = 'Invalid draft image coordinates', DETAIL = 'invalid_payload';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_metadata->'images') AS metadata_image(image_id, value)
    JOIN jsonb_array_elements(p_images) AS payload(image)
      ON payload.image->>'id' = metadata_image.image_id
    WHERE metadata_image.value->>'imageId' IS DISTINCT FROM metadata_image.image_id
      OR (metadata_image.value->>'displayOrder')::integer
        IS DISTINCT FROM (payload.image->>'display_order')::integer
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft image metadata does not match image order', DETAIL = 'invalid_payload';
  END IF;

  IF NOT (p_metadata->'navigation' ? 'defaultImageId')
    OR (p_metadata->'navigation'->'defaultImageId' <> 'null'::jsonb AND (
      jsonb_typeof(p_metadata->'navigation'->'defaultImageId') IS DISTINCT FROM 'string'
      OR (p_metadata->'navigation'->>'defaultImageId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR NOT (p_metadata->'images' ? (p_metadata->'navigation'->>'defaultImageId'))
    )) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid default draft image', DETAIL = 'invalid_payload';
  END IF;

  v_location := p_metadata->'submission'->'location';
  IF NOT (p_metadata->'submission' ? 'location')
    OR (v_location <> 'null'::jsonb AND (
      jsonb_typeof(v_location) IS DISTINCT FROM 'object'
      OR NOT (v_location ? 'latitude') OR NOT (v_location ? 'longitude')
      OR ((v_location->'latitude' = 'null'::jsonb) IS DISTINCT FROM (v_location->'longitude' = 'null'::jsonb))
      OR (v_location->'latitude' <> 'null'::jsonb AND (
        jsonb_typeof(v_location->'latitude') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_location->'longitude') IS DISTINCT FROM 'number'
        OR CASE WHEN jsonb_typeof(v_location->'latitude') = 'number'
          THEN (v_location->>'latitude')::numeric NOT BETWEEN -90 AND 90 ELSE false END
        OR CASE WHEN jsonb_typeof(v_location->'longitude') = 'number'
          THEN (v_location->>'longitude')::numeric NOT BETWEEN -180 AND 180 ELSE false END
      ))
      OR EXISTS (
        SELECT 1 FROM jsonb_each(v_location) AS field(key, value)
        WHERE field.key IN ('countryId', 'countryCode', 'countryName', 'adminRegionName', 'unRegionName', 'continentName')
          AND field.value <> 'null'::jsonb
          AND jsonb_typeof(field.value) IS DISTINCT FROM 'string'
      )
    )) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid submission location', DETAIL = 'invalid_payload';
  END IF;

  IF jsonb_typeof(p_metadata->'submission'->'routeType') IS DISTINCT FROM 'string'
    OR replace(lower(p_metadata->'submission'->>'routeType'), '_', '-') NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo')
    OR jsonb_typeof(p_metadata->'submission'->'isAnonymousSubmission') IS DISTINCT FROM 'boolean'
    OR NOT (p_metadata->'submission' ? 'contributionCreditPlatform')
    OR NOT (p_metadata->'submission' ? 'contributionCreditHandle')
    OR (p_metadata->'submission'->'contributionCreditPlatform' <> 'null'::jsonb
      AND (jsonb_typeof(p_metadata->'submission'->'contributionCreditPlatform') IS DISTINCT FROM 'string'
        OR p_metadata->'submission'->>'contributionCreditPlatform' NOT IN ('instagram', 'tiktok', 'youtube', 'x', 'other')))
    OR (p_metadata->'submission'->'contributionCreditHandle' <> 'null'::jsonb
      AND jsonb_typeof(p_metadata->'submission'->'contributionCreditHandle') IS DISTINCT FROM 'string')
    OR (p_metadata->'submission' ? 'sectorId'
      AND p_metadata->'submission'->'sectorId' <> 'null'::jsonb
      AND (jsonb_typeof(p_metadata->'submission'->'sectorId') IS DISTINCT FROM 'string'
        OR (p_metadata->'submission'->>'sectorId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid submission metadata', DETAIL = 'invalid_payload';
  END IF;

  IF p_metadata->'submission'->'sectorId' <> 'null'::jsonb
    AND NOT EXISTS (
      SELECT 1 FROM public.sectors AS sector
      WHERE sector.id = (p_metadata->'submission'->>'sectorId')::uuid
        AND sector.crag_id = p_crag_id
    ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid submission sector', DETAIL = 'invalid_payload';
  END IF;

  v_canvas_source := p_metadata->'submission'->'canvasSource';
  IF NOT (p_metadata->'submission' ? 'canvasSource')
    OR (v_canvas_source <> 'null'::jsonb AND (
      jsonb_typeof(v_canvas_source) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_canvas_source->'kind') IS DISTINCT FROM 'string'
      OR v_canvas_source->>'kind' NOT IN ('draft-image', 'crag-image')
      OR (v_canvas_source->>'kind' = 'draft-image' AND (
        jsonb_typeof(v_canvas_source->'draftImageId') IS DISTINCT FROM 'string'
        OR NOT (p_metadata->'images' ? (v_canvas_source->>'draftImageId'))
      ))
      OR (v_canvas_source->>'kind' = 'crag-image' AND (
        jsonb_typeof(v_canvas_source->'cragImageId') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_canvas_source->'cragId') IS DISTINCT FROM 'string'
        OR (v_canvas_source->>'cragImageId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR (v_canvas_source->>'cragId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR NOT EXISTS (
          SELECT 1 FROM public.crag_images AS image
          WHERE image.id = (v_canvas_source->>'cragImageId')::uuid
            AND image.crag_id = (v_canvas_source->>'cragId')::uuid
        )
      ))
    )) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid canvas source', DETAIL = 'invalid_payload';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_route_sets) AS submitted(route_set)
    WHERE jsonb_typeof(submitted.route_set) IS DISTINCT FROM 'object'
      OR jsonb_typeof(submitted.route_set->'draftImageId') IS DISTINCT FROM 'string'
      OR (submitted.route_set->>'draftImageId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(submitted.route_set->'routes') IS DISTINCT FROM 'array'
  ) OR (SELECT count(*) FROM jsonb_array_elements(p_route_sets))
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
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_route_sets) AS submitted(route_set)
    CROSS JOIN LATERAL jsonb_array_elements(CASE
      WHEN jsonb_typeof(submitted.route_set->'routes') = 'array' THEN submitted.route_set->'routes'
      ELSE '[]'::jsonb
    END) AS routes(route)
    WHERE jsonb_typeof(routes.route) IS DISTINCT FROM 'object'
      OR (routes.route ? 'id' AND jsonb_typeof(routes.route->'id') IS DISTINCT FROM 'string')
      OR jsonb_typeof(routes.route->'name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(routes.route->'grade') IS DISTINCT FROM 'string'
      OR (routes.route ? 'description' AND routes.route->'description' <> 'null'::jsonb
        AND jsonb_typeof(routes.route->'description') IS DISTINCT FROM 'string')
      OR jsonb_typeof(routes.route->'climbType') IS DISTINCT FROM 'string'
      OR replace(lower(routes.route->>'climbType'), '_', '-') NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo')
      OR jsonb_typeof(routes.route->'points') IS DISTINCT FROM 'array'
      OR CASE WHEN jsonb_typeof(routes.route->'points') = 'array'
        THEN jsonb_array_length(routes.route->'points') < 2 ELSE false END
      OR (routes.route ? 'sequenceOrder' AND (
        jsonb_typeof(routes.route->'sequenceOrder') IS DISTINCT FROM 'number'
        OR (routes.route->>'sequenceOrder') !~ '^[0-9]+$'
        OR CASE WHEN (routes.route->>'sequenceOrder') ~ '^[0-9]+$'
          THEN (routes.route->>'sequenceOrder')::numeric > 2147483647 ELSE false END
      ))
      OR (routes.route ? 'imageWidth' AND routes.route->'imageWidth' <> 'null'::jsonb AND (
        jsonb_typeof(routes.route->'imageWidth') IS DISTINCT FROM 'number'
        OR (routes.route->>'imageWidth') !~ '^[1-9][0-9]*$'
        OR CASE WHEN (routes.route->>'imageWidth') ~ '^[1-9][0-9]*$'
          THEN (routes.route->>'imageWidth')::numeric > 2147483647 ELSE false END
      ))
      OR (routes.route ? 'imageHeight' AND routes.route->'imageHeight' <> 'null'::jsonb AND (
        jsonb_typeof(routes.route->'imageHeight') IS DISTINCT FROM 'number'
        OR (routes.route->>'imageHeight') !~ '^[1-9][0-9]*$'
        OR CASE WHEN (routes.route->>'imageHeight') ~ '^[1-9][0-9]*$'
          THEN (routes.route->>'imageHeight')::numeric > 2147483647 ELSE false END
      ))
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(routes.route->'points') = 'array' THEN routes.route->'points'
          ELSE '[]'::jsonb
        END) AS point(value)
        WHERE jsonb_typeof(point.value) IS DISTINCT FROM 'object'
          OR jsonb_typeof(point.value->'x') IS DISTINCT FROM 'number'
          OR jsonb_typeof(point.value->'y') IS DISTINCT FROM 'number'
          OR CASE WHEN jsonb_typeof(point.value->'x') = 'number'
            THEN (point.value->>'x')::numeric NOT BETWEEN 0 AND 1 ELSE false END
          OR CASE WHEN jsonb_typeof(point.value->'y') = 'number'
            THEN (point.value->>'y')::numeric NOT BETWEEN 0 AND 1 ELSE false END
      )
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid draft route payload', DETAIL = 'invalid_payload';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_route_sets) AS submitted(route_set)
    CROSS JOIN LATERAL jsonb_array_elements(submitted.route_set->'routes') AS routes(route)
    WHERE COALESCE(routes.route->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY routes.route->>'id'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_route_sets) AS submitted(route_set)
    CROSS JOIN LATERAL jsonb_array_elements(submitted.route_set->'routes') AS routes(route)
    JOIN public.submission_draft_routes AS existing
      ON existing.id = CASE
        WHEN COALESCE(routes.route->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (routes.route->>'id')::uuid
        ELSE NULL
      END
    WHERE COALESCE(routes.route->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (existing.draft_id IS DISTINCT FROM v_draft.id
        OR existing.draft_image_id IS DISTINCT FROM (submitted.route_set->>'draftImageId')::uuid)
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Invalid draft route identity', DETAIL = 'invalid_payload';
  END IF;

  v_result := public.save_submission_draft_atomic_20260811_internal(
    p_draft_id, p_expected_updated_at, p_images, p_route_sets, p_metadata, p_crag_id
  );

  -- Custom metadata GPS becomes the authoritative publication coordinate.
  UPDATE public.submission_draft_images AS image
  SET latitude = (metadata.value->'gps'->>'latitude')::double precision,
      longitude = (metadata.value->'gps'->>'longitude')::double precision
  FROM jsonb_each(p_metadata->'images') AS metadata(key, value)
  WHERE image.id = metadata.key::uuid
    AND image.draft_id = p_draft_id
    AND metadata.value->>'locationMode' = 'custom';

  -- Compatibility JSON is derived from durable rows for every submitted route set.
  UPDATE public.submission_draft_images AS image
  SET route_data = COALESCE(image.route_data, '{}'::jsonb) || jsonb_build_object(
    'completedRoutes', COALESCE((
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
      WHERE route.draft_id = p_draft_id
        AND route.draft_image_id = image.id
    ), '[]'::jsonb)
  )
  WHERE image.draft_id = p_draft_id
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_route_sets) AS submitted(route_set)
      WHERE submitted.route_set->>'draftImageId' = image.id::text
    );

  v_result := jsonb_set(v_result, '{images}', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', image.id,
      'display_order', image.display_order,
      'route_data', image.route_data,
      'updated_at', image.updated_at
    ) ORDER BY image.display_order, image.id)
    FROM public.submission_draft_images AS image
    WHERE image.draft_id = p_draft_id
  ), '[]'::jsonb));

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_submission_draft_atomic(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_submission_draft_atomic(uuid, timestamptz, jsonb, jsonb, jsonb, uuid)
  TO authenticated, service_role;
