ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS submission_id UUID;

CREATE INDEX IF NOT EXISTS images_submission_id_idx
ON public.images (submission_id)
WHERE submission_id IS NOT NULL;

WITH source_groups AS (
  SELECT
    root.id AS root_image_id,
    COALESCE(root.submission_id, gen_random_uuid()) AS next_submission_id
  FROM public.images root
  WHERE root.submission_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.crag_images ci
      WHERE ci.source_image_id = root.id OR ci.linked_image_id = root.id
    )
), linked_groups AS (
  SELECT
    sg.next_submission_id,
    sg.root_image_id AS image_id
  FROM source_groups sg
  UNION
  SELECT
    sg.next_submission_id,
    ci.linked_image_id AS image_id
  FROM source_groups sg
  JOIN public.crag_images ci
    ON ci.source_image_id = sg.root_image_id
  WHERE ci.linked_image_id IS NOT NULL
)
UPDATE public.images i
SET submission_id = lg.next_submission_id
FROM linked_groups lg
WHERE i.id = lg.image_id
  AND i.submission_id IS NULL;

WITH orphan_images AS (
  SELECT id, gen_random_uuid() AS next_submission_id
  FROM public.images
  WHERE submission_id IS NULL
)
UPDATE public.images i
SET submission_id = oi.next_submission_id
FROM orphan_images oi
WHERE i.id = oi.id
  AND i.submission_id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_submission_draft_promoted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_submission_draft_promoted$
DECLARE
  draft_latitude DOUBLE PRECISION;
  draft_longitude DOUBLE PRECISION;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    IF jsonb_typeof(COALESCE(NEW.metadata->'submission'->'location'->'latitude', 'null'::jsonb)) = 'number' THEN
      draft_latitude := (NEW.metadata->'submission'->'location'->>'latitude')::DOUBLE PRECISION;
    END IF;

    IF jsonb_typeof(COALESCE(NEW.metadata->'submission'->'location'->'longitude', 'null'::jsonb)) = 'number' THEN
      draft_longitude := (NEW.metadata->'submission'->'location'->>'longitude')::DOUBLE PRECISION;
    END IF;

    IF draft_latitude IS NULL AND jsonb_typeof(COALESCE(NEW.metadata->'location'->'latitude', 'null'::jsonb)) = 'number' THEN
      draft_latitude := (NEW.metadata->'location'->>'latitude')::DOUBLE PRECISION;
    END IF;

    IF draft_longitude IS NULL AND jsonb_typeof(COALESCE(NEW.metadata->'location'->'longitude', 'null'::jsonb)) = 'number' THEN
      draft_longitude := (NEW.metadata->'location'->>'longitude')::DOUBLE PRECISION;
    END IF;

    IF draft_latitude IS NULL OR draft_longitude IS NULL
      OR draft_latitude < -90 OR draft_latitude > 90
      OR draft_longitude < -180 OR draft_longitude > 180 THEN
      RAISE EXCEPTION 'Draft location is required before publishing';
    END IF;

    UPDATE public.images i
    SET
      latitude = COALESCE(di.latitude::DOUBLE PRECISION, draft_latitude),
      longitude = COALESCE(di.longitude::DOUBLE PRECISION, draft_longitude)
    FROM public.submission_draft_images di
    WHERE di.draft_id = NEW.id
      AND di.linked_image_id IS NOT NULL
      AND i.id = di.linked_image_id;

    UPDATE public.crag_images ci
    SET
      latitude = COALESCE(di.latitude::DOUBLE PRECISION, draft_latitude),
      longitude = COALESCE(di.longitude::DOUBLE PRECISION, draft_longitude)
    FROM public.submission_draft_images di
    WHERE di.draft_id = NEW.id
      AND di.linked_crag_image_id IS NOT NULL
      AND ci.id = di.linked_crag_image_id;

    INSERT INTO public.submission_collaborators (image_id, user_id, role, created_by)
    SELECT
      di.linked_image_id,
      c.user_id,
      c.role,
      COALESCE(c.created_by, NEW.user_id)
    FROM public.submission_draft_collaborators c
    CROSS JOIN public.submission_draft_images di
    WHERE c.draft_id = NEW.id
      AND di.draft_id = NEW.id
      AND di.linked_image_id IS NOT NULL
    ON CONFLICT (image_id, user_id) DO NOTHING;

    DELETE FROM public.submission_draft_collaborator_invites
    WHERE draft_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$handle_submission_draft_promoted$;

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
      status
    )
    VALUES (
      format('private://%s/%s', image_row.storage_bucket, image_row.storage_path),
      image_row.storage_bucket,
      image_row.storage_path,
      draft_row.crag_id,
      created_submission_id,
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
      image_row.latitude,
      image_row.longitude
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
