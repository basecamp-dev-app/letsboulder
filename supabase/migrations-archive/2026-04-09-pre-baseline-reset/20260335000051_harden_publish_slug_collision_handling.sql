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
    ELSE
      orientation_json := COALESCE(draft_row.metadata->'faceDirectionsByImage'->(image_row.display_order::TEXT), draft_row.metadata->'faceDirections', '[]'::JSONB);
    END IF;

    orientation_text := ARRAY(
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(orientation_json) = 'array' THEN orientation_json
          ELSE '[]'::JSONB
        END
      )
    );

    INSERT INTO public.images (
      url,
      storage_bucket,
      storage_path,
      crag_id,
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
      status
    )
    VALUES (
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.storage_bucket,
      image_row.storage_path,
      draft_row.crag_id,
      image_row.latitude,
      image_row.longitude,
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
      'approved'
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
      NULL,
      current_live_image_id,
      COALESCE(orientation_text, ARRAY[]::TEXT[])
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

      IF route_slug IS NOT NULL AND route_slug <> '' THEN
        WHILE EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = draft_row.crag_id AND slug = route_slug) LOOP
          route_slug := route_slug || '-' || route_index::TEXT;
        END LOOP;
      ELSE
        route_slug := COALESCE(
          NULLIF(public.slugify(route_name), 'unnamed'),
          'route-' || route_index::TEXT
        ) || '-' || route_index::TEXT;
      END IF;

      created_climb_id := gen_random_uuid();

      INSERT INTO public.climbs (
        id,
        name,
        slug,
        grade,
        description,
        route_type,
        status,
        user_id,
        crag_id,
        shared_climb_id
      )
      VALUES (
        created_climb_id,
        route_name,
        route_slug,
        route_grade,
        route_description,
        route_type_normalized,
        'approved',
        current_user_id,
        draft_row.crag_id,
        created_climb_id
      );

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
        'publishedImageId', default_live_image_id,
        'defaultImageId', default_draft_image_id,
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
    'image_id', default_live_image_id,
    'default_image_id', default_live_image_id,
    'image_ids', to_jsonb(all_live_image_ids),
    'climb_ids', to_jsonb(all_climb_ids),
    'route_line_ids', to_jsonb(all_route_line_ids)
  );
END;
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.promote_draft_to_submission(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(UUID) TO service_role';
END $$;
