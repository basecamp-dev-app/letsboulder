-- Fix: Preserve GPS coordinates when publishing with "shared" location mode
-- Previously, "shared" mode incorrectly set coordinates to NULL, causing published
-- images without routes to not appear as pins on crag maps.

CREATE OR REPLACE FUNCTION public.promote_draft_to_submission(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  draft_row public.submission_drafts%ROWTYPE;
  image_row public.submission_draft_images%ROWTYPE;
  authoritative_row public.images%ROWTYPE;
  route_row public.submission_draft_routes%ROWTYPE;
  crag_row public.crags%ROWTYPE;
  metadata_version integer := 1;
  current_user_id uuid := auth.uid();
  default_draft_image_id uuid;
  default_live_image_id uuid;
  current_live_image_id uuid;
  current_crag_image_id uuid;
  route_name text;
  route_description text;
  route_grade text;
  route_type_default text := 'sport';
  route_type_normalized text;
  route_slug text;
  base_route_slug text;
  created_climb_id uuid;
  created_route_line_id uuid;
  all_live_image_ids uuid[] := ARRAY[]::uuid[];
  all_climb_ids uuid[] := ARRAY[]::uuid[];
  all_route_line_ids uuid[] := ARRAY[]::uuid[];
  orientation_json jsonb := '[]'::jsonb;
  orientation_text text[] := ARRAY[]::text[];
  anonymous_submission boolean := false;
  image_id_map jsonb := '{}'::jsonb;
  created_submission_id uuid := gen_random_uuid();
  image_location_mode text := 'custom';
  image_latitude double precision;
  image_longitude double precision;
  published_at timestamptz := now();
  affected_count integer;
BEGIN
  SELECT * INTO draft_row
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft not found', DETAIL = 'not_found';
  END IF;
  IF current_user_id IS NULL OR current_user_id IS DISTINCT FROM draft_row.user_id THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;

  IF draft_row.status = 'submitted'
    AND draft_row.metadata ? 'publishedImageId'
    AND draft_row.metadata ? 'publishedAt'
    AND draft_row.metadata ? 'publishedClimbIds'
    AND draft_row.metadata ? 'publishedRouteLineIds'
    AND draft_row.metadata ? 'allPublishedImageIds'
    AND draft_row.metadata ? 'submissionId' THEN
    RETURN jsonb_build_object(
      'success', true, 'status', 'submitted', 'draft_id', draft_row.id,
      'image_id', draft_row.metadata->'publishedImageId',
      'default_image_id', draft_row.metadata->'publishedImageId',
      'image_ids', draft_row.metadata->'allPublishedImageIds',
      'climb_ids', draft_row.metadata->'publishedClimbIds',
      'route_line_ids', draft_row.metadata->'publishedRouteLineIds',
      'published_at', draft_row.metadata->'publishedAt',
      'submission_id', draft_row.metadata->'submissionId'
    );
  END IF;
  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft is not editable', DETAIL = 'draft_not_editable';
  END IF;
  IF draft_row.crag_id IS NULL THEN
    RAISE EXCEPTION 'Draft crag is required before publishing';
  END IF;

  -- Draft attachments are locked before authoritative images. This same order
  -- is used by both deletion RPCs below.
  FOR image_row IN
    SELECT * FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.id
    FOR UPDATE
  LOOP
    IF image_row.linked_image_id IS NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = 'A draft photo is missing its upload record.',
        DETAIL = 'media_not_ready';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT di.linked_image_id)
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Each draft photo must use a distinct upload record.',
      DETAIL = 'media_not_ready';
  END IF;

  PERFORM 1
  FROM public.submission_draft_routes dr
  WHERE dr.draft_id = draft_row.id
  ORDER BY dr.id
  FOR UPDATE;

  FOR current_live_image_id IN
    SELECT DISTINCT di.linked_image_id
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.linked_image_id
  LOOP
    PERFORM 1 FROM public.images i
    WHERE i.id = current_live_image_id
    FOR UPDATE;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.submission_draft_images di
    LEFT JOIN public.images i ON i.id = di.linked_image_id
    WHERE di.draft_id = draft_row.id
      AND (
        i.id IS NULL
        OR NOT (
          i.created_by = draft_row.user_id
          OR EXISTS (
            SELECT 1
            FROM public.submission_draft_collaborators collaborator
            WHERE collaborator.draft_id = draft_row.id
              AND collaborator.user_id = i.created_by
          )
        )
        OR NOT (
          (i.original_bucket = di.storage_bucket AND i.original_key = di.storage_path)
          OR (i.storage_bucket = di.storage_bucket AND i.storage_path = di.storage_path)
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'A draft photo does not match its upload record.',
      DETAIL = 'media_not_ready';
  END IF;

  PERFORM public.assert_media_ready_for_publication(ARRAY(
    SELECT DISTINCT di.linked_image_id
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.linked_image_id
  ));

  SELECT * INTO crag_row
  FROM public.crags c
  WHERE c.id = draft_row.crag_id
  FOR UPDATE;
  IF NOT FOUND OR btrim(COALESCE(crag_row.slug, '')) = ''
    OR btrim(COALESCE(crag_row.country_code, '')) = '' THEN
    RAISE EXCEPTION 'Draft crag must have a slug and country code before publishing';
  END IF;

  IF jsonb_typeof(COALESCE(draft_row.metadata, '{}'::jsonb)) = 'object' THEN
    metadata_version := COALESCE((draft_row.metadata->>'version')::integer, 1);
    anonymous_submission := COALESCE((draft_row.metadata->'submission'->>'isAnonymousSubmission')::boolean, false);
    default_draft_image_id := NULLIF(draft_row.metadata->'navigation'->>'defaultImageId', '')::uuid;
    route_type_default := COALESCE(NULLIF(btrim(draft_row.metadata->'submission'->>'routeType'), ''), 'sport');
  END IF;
  IF default_draft_image_id IS NULL THEN
    SELECT id INTO default_draft_image_id
    FROM public.submission_draft_images
    WHERE draft_id = draft_row.id
    ORDER BY display_order, id
    LIMIT 1;
  END IF;
  IF default_draft_image_id IS NULL THEN
    RAISE EXCEPTION 'Draft requires at least one image before publishing';
  END IF;

  FOR image_row IN
    SELECT * FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.display_order, di.id
  LOOP
    IF metadata_version >= 2 THEN
      orientation_json := COALESCE(draft_row.metadata->'images'->(image_row.id::text)->'orientation', '[]'::jsonb);
      image_location_mode := COALESCE(
        NULLIF(btrim(draft_row.metadata->'images'->(image_row.id::text)->>'locationMode'), ''),
        CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END
      );
      IF image_location_mode NOT IN ('shared', 'custom') THEN
        image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      END IF;
      -- FIX: Both "shared" and "custom" modes now preserve the draft image's GPS coordinates.
      -- "shared" means the same coordinates apply to all images in the draft (not NULL).
      image_latitude := image_row.latitude;
      image_longitude := image_row.longitude;
    ELSE
      orientation_json := COALESCE(
        draft_row.metadata->'faceDirectionsByImage'->(image_row.display_order::text),
        draft_row.metadata->'faceDirections', '[]'::jsonb
      );
      image_location_mode := CASE WHEN image_row.latitude IS NOT NULL AND image_row.longitude IS NOT NULL THEN 'custom' ELSE 'shared' END;
      image_latitude := image_row.latitude;
      image_longitude := image_row.longitude;
    END IF;
    orientation_text := ARRAY(
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(orientation_json) = 'array' THEN orientation_json ELSE '[]'::jsonb END
      )
    );

    SELECT * INTO authoritative_row FROM public.images WHERE id = image_row.linked_image_id;
    current_live_image_id := authoritative_row.id;
    UPDATE public.images SET
      crag_id = draft_row.crag_id,
      place_id = draft_row.crag_id,
      submission_id = created_submission_id,
      latitude = image_latitude,
      longitude = image_longitude,
      capture_date = image_row.capture_date,
      width = COALESCE(image_row.width, public.images.width),
      height = COALESCE(image_row.height, public.images.height),
      natural_width = COALESCE(image_row.width, public.images.natural_width),
      natural_height = COALESCE(image_row.height, public.images.natural_height),
      face_direction = CASE WHEN cardinality(orientation_text) = 0 THEN NULL ELSE orientation_text[1] END,
      face_directions = COALESCE(orientation_text, ARRAY[]::text[]),
      is_primary = image_row.id = default_draft_image_id,
      is_anonymous_submission = anonymous_submission,
      face_order = image_row.display_order,
      location_mode = image_location_mode
    WHERE id = current_live_image_id;

    INSERT INTO public.crag_images (
      crag_id, url, width, height, source_image_id, linked_image_id,
      face_directions, latitude, longitude
    ) VALUES (
      draft_row.crag_id, authoritative_row.url,
      COALESCE(image_row.width, authoritative_row.width),
      COALESCE(image_row.height, authoritative_row.height),
      NULL, current_live_image_id, COALESCE(orientation_text, ARRAY[]::text[]),
      image_latitude, image_longitude
    ) RETURNING id INTO current_crag_image_id;

    IF image_row.id = default_draft_image_id THEN
      default_live_image_id := current_live_image_id;
    END IF;
    all_live_image_ids := array_append(all_live_image_ids, current_live_image_id);
    image_id_map := image_id_map || jsonb_build_object(image_row.id::text, current_live_image_id::text);
    UPDATE public.submission_draft_images SET
      linked_crag_image_id = current_crag_image_id,
      submitted_at = published_at,
      updated_at = published_at
    WHERE id = image_row.id;
  END LOOP;

  IF default_live_image_id IS NULL THEN
    RAISE EXCEPTION 'Default live image mapping is missing';
  END IF;

  FOR route_row IN
    SELECT * FROM public.submission_draft_routes dr
    WHERE dr.draft_id = draft_row.id
    ORDER BY dr.draft_image_id, dr.sequence_order, dr.created_at, dr.id
  LOOP
    current_live_image_id := NULLIF(COALESCE(image_id_map->>route_row.draft_image_id::text, ''), '')::uuid;
    IF current_live_image_id IS NULL THEN
      CONTINUE;
    END IF;
    route_name := COALESCE(NULLIF(btrim(route_row.name), ''), 'Unnamed');
    route_grade := COALESCE(NULLIF(btrim(route_row.grade), ''), '6A');
    route_description := NULLIF(btrim(COALESCE(route_row.description, '')), '');
    route_type_normalized := replace(lower(COALESCE(NULLIF(btrim(route_row.climb_type), ''), route_type_default)), '_', '-');
    base_route_slug := COALESCE(NULLIF(public.slugify(route_name), 'unnamed'), 'route');
    route_slug := base_route_slug;
    WHILE EXISTS (SELECT 1 FROM public.climbs WHERE crag_id = draft_row.crag_id AND slug = route_slug) LOOP
      route_slug := base_route_slug || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END LOOP;
    created_climb_id := gen_random_uuid();
    INSERT INTO public.climbs (id, name, grade, status, route_type, description, user_id, crag_id, place_id, slug)
    VALUES (created_climb_id, route_name, route_grade, 'approved', route_type_normalized,
      route_description, current_user_id, draft_row.crag_id, draft_row.crag_id, route_slug);
    INSERT INTO public.route_lines (image_id, climb_id, points, color, sequence_order, image_width, image_height)
    VALUES (current_live_image_id, created_climb_id, route_row.points, 'red', route_row.sequence_order,
      COALESCE(route_row.image_width, (
        SELECT di.width FROM public.submission_draft_images di WHERE di.id = route_row.draft_image_id
      ), 1200), COALESCE(route_row.image_height, (
        SELECT di.height FROM public.submission_draft_images di WHERE di.id = route_row.draft_image_id
      ), 1200))
    RETURNING id INTO created_route_line_id;
    all_climb_ids := array_append(all_climb_ids, created_climb_id);
    all_route_line_ids := array_append(all_route_line_ids, created_route_line_id);
  END LOOP;

  UPDATE public.submission_drafts SET
    status = 'submitted',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'publishedImageId', default_live_image_id,
      'publishedAt', published_at,
      'publishedClimbIds', to_jsonb(all_climb_ids),
      'publishedRouteLineIds', to_jsonb(all_route_line_ids),
      'allPublishedImageIds', to_jsonb(all_live_image_ids),
      'submissionId', created_submission_id
    ),
    updated_at = published_at
  WHERE id = draft_row.id AND status = 'draft';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while publishing', DETAIL = 'draft_conflict';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'status', 'submitted', 'draft_id', draft_row.id,
    'image_id', default_live_image_id, 'default_image_id', default_live_image_id,
    'image_ids', to_jsonb(all_live_image_ids), 'climb_ids', to_jsonb(all_climb_ids),
    'route_line_ids', to_jsonb(all_route_line_ids), 'published_at', published_at,
    'submission_id', created_submission_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_draft_to_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_draft_to_submission(uuid) TO authenticated, service_role;