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
  draft_images_json JSONB;
  image_count INTEGER;
  primary_index INTEGER;
  primary_image JSONB;
  primary_routes JSONB;
  primary_face_directions JSONB;
  face_directions_by_image JSONB;
  legacy_face_directions JSONB;
  route_type_value TEXT;
  image_item JSONB;
  image_array_index INTEGER;
  supplementary_payloads JSONB[];
  supplementary_face_directions JSONB[];
  supplementary_face_json JSONB;
  supplementary_crag_image_ids UUID[];
  climb_ids_json JSONB;
  route_line_ids_json JSONB;
  submitted_image_id UUID;
  published_image_id UUID;
  published_at TEXT;
  has_supplementary_routes BOOLEAN := FALSE;
  unified_result JSONB;
  i INTEGER;
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

  IF draft_row.user_id <> current_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF draft_row.status = 'submitted' THEN
    published_image_id := NULLIF(COALESCE(draft_row.metadata->>'publishedImageId', draft_row.metadata->>'image_id', ''), '')::UUID;
    published_at := NULLIF(COALESCE(draft_row.metadata->>'publishedAt', draft_row.metadata->>'submittedAt', ''), '');
    climb_ids_json := COALESCE(draft_row.metadata->'publishedClimbIds', draft_row.metadata->'climb_ids', '[]'::JSONB);
    route_line_ids_json := COALESCE(draft_row.metadata->'publishedRouteLineIds', draft_row.metadata->'route_line_ids', '[]'::JSONB);

    IF published_image_id IS NULL THEN
      RAISE EXCEPTION 'Draft was submitted but publish metadata is missing';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_submitted',
      'draft_id', draft_row.id,
      'image_id', published_image_id,
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

  SELECT COALESCE(jsonb_agg(to_jsonb(di) ORDER BY di.display_order), '[]'::JSONB)
  INTO draft_images_json
  FROM public.submission_draft_images di
  WHERE di.draft_id = draft_row.id;

  image_count := jsonb_array_length(draft_images_json);
  IF image_count = 0 THEN
    RAISE EXCEPTION 'Draft has no images to publish';
  END IF;

  primary_index := COALESCE((draft_row.metadata->>'primaryIndex')::INTEGER, 0);
  IF primary_index < 0 OR primary_index >= image_count THEN
    primary_index := 0;
  END IF;

  primary_image := draft_images_json->primary_index;
  IF primary_image IS NULL THEN
    RAISE EXCEPTION 'Primary draft image is missing';
  END IF;

  primary_routes := COALESCE(primary_image->'route_data'->'completedRoutes', '[]'::JSONB);
  IF jsonb_typeof(primary_routes) <> 'array' OR jsonb_array_length(primary_routes) = 0 THEN
    RAISE EXCEPTION 'Primary draft image must contain at least one route before publishing';
  END IF;

  FOR image_item, image_array_index IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(draft_images_json) WITH ORDINALITY
  LOOP
    IF image_array_index = primary_index THEN
      CONTINUE;
    END IF;

    IF jsonb_typeof(COALESCE(image_item->'route_data'->'completedRoutes', '[]'::JSONB)) = 'array'
      AND jsonb_array_length(COALESCE(image_item->'route_data'->'completedRoutes', '[]'::JSONB)) > 0 THEN
      has_supplementary_routes := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF has_supplementary_routes THEN
    RAISE EXCEPTION 'This draft contains routes on supplementary faces. Please submit from the draft flow so each face is published safely.';
  END IF;

  face_directions_by_image := COALESCE(draft_row.metadata->'faceDirectionsByImage', '{}'::JSONB);
  legacy_face_directions := COALESCE(draft_row.metadata->'faceDirections', '[]'::JSONB);

  IF jsonb_typeof(face_directions_by_image) = 'object'
    AND jsonb_typeof(COALESCE(face_directions_by_image->(primary_index::TEXT), 'null'::JSONB)) = 'array' THEN
    primary_face_directions := face_directions_by_image->(primary_index::TEXT);
  ELSE
    primary_face_directions := legacy_face_directions;
  END IF;

  IF jsonb_typeof(primary_face_directions) <> 'array' OR jsonb_array_length(primary_face_directions) = 0 THEN
    RAISE EXCEPTION 'Primary face directions are required before publishing';
  END IF;

  route_type_value := NULLIF(btrim(COALESCE(draft_row.metadata->>'routeType', '')), '');
  IF route_type_value IS NULL THEN
    route_type_value := 'sport';
  END IF;

  supplementary_payloads := ARRAY[]::JSONB[];
  supplementary_face_directions := ARRAY[]::JSONB[];

  FOR image_item, image_array_index IN
    SELECT value, ordinality - 1
    FROM jsonb_array_elements(draft_images_json) WITH ORDINALITY
  LOOP
    IF image_array_index = primary_index THEN
      CONTINUE;
    END IF;

    supplementary_payloads := array_append(
      supplementary_payloads,
      jsonb_build_object(
        'url', format('private://%s/%s', image_item->>'storage_bucket', image_item->>'storage_path'),
        'width', NULLIF(image_item->>'width', '')::INTEGER,
        'height', NULLIF(image_item->>'height', '')::INTEGER,
        'face_directions', COALESCE(
          CASE
            WHEN jsonb_typeof(face_directions_by_image) = 'object'
              AND jsonb_typeof(COALESCE(face_directions_by_image->(image_array_index::TEXT), 'null'::JSONB)) = 'array'
            THEN face_directions_by_image->(image_array_index::TEXT)
            ELSE '[]'::JSONB
          END,
          '[]'::JSONB
        )
      )
    );

    supplementary_face_json := CASE
      WHEN jsonb_typeof(face_directions_by_image) = 'object'
        AND jsonb_typeof(COALESCE(face_directions_by_image->(image_array_index::TEXT), 'null'::JSONB)) = 'array'
      THEN face_directions_by_image->(image_array_index::TEXT)
      ELSE '[]'::JSONB
    END;

    supplementary_face_directions := array_append(supplementary_face_directions, COALESCE(supplementary_face_json, '[]'::JSONB));
  END LOOP;

  unified_result := public.create_unified_submission_atomic(
    draft_row.crag_id,
    jsonb_build_object(
      'url', format('private://%s/%s', primary_image->>'storage_bucket', primary_image->>'storage_path'),
      'storage_bucket', primary_image->>'storage_bucket',
      'storage_path', primary_image->>'storage_path',
      'image_lat', NULL,
      'image_lng', NULL,
      'capture_date', NULL,
      'width', NULLIF(primary_image->>'width', '')::INTEGER,
      'height', NULLIF(primary_image->>'height', '')::INTEGER,
      'natural_width', NULLIF(primary_image->>'width', '')::INTEGER,
      'natural_height', NULLIF(primary_image->>'height', '')::INTEGER,
      'face_directions', primary_face_directions
    ),
    supplementary_payloads,
    primary_routes,
    route_type_value
  );

  submitted_image_id := NULLIF(COALESCE(unified_result->>'image_id', ''), '')::UUID;
  IF submitted_image_id IS NULL THEN
    RAISE EXCEPTION 'Promote draft failed: image_id missing from unified submission response';
  END IF;

  supplementary_crag_image_ids := ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(unified_result->'crag_image_ids', '[]'::JSONB))::UUID
  );

  IF COALESCE(array_length(supplementary_crag_image_ids, 1), 0) > 0 THEN
    FOR i IN 1..LEAST(
      COALESCE(array_length(supplementary_crag_image_ids, 1), 0),
      COALESCE(array_length(supplementary_face_directions, 1), 0)
    ) LOOP
      UPDATE public.crag_images
      SET face_directions = ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(supplementary_face_directions[i], '[]'::JSONB))
      )
      WHERE id = supplementary_crag_image_ids[i];
    END LOOP;
  END IF;

  UPDATE public.submission_drafts
  SET
    status = 'submitted',
    metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
      'publishedImageId', submitted_image_id,
      'publishedAt', NOW(),
      'publishedClimbIds', COALESCE(unified_result->'climb_ids', '[]'::JSONB),
      'publishedRouteLineIds', COALESCE(unified_result->'route_line_ids', '[]'::JSONB)
    ),
    updated_at = NOW()
  WHERE id = draft_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'submitted',
    'draft_id', draft_row.id,
    'image_id', submitted_image_id,
    'climb_ids', COALESCE(unified_result->'climb_ids', '[]'::JSONB),
    'route_line_ids', COALESCE(unified_result->'route_line_ids', '[]'::JSONB),
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
