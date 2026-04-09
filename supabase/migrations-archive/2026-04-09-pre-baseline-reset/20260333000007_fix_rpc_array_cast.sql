CREATE OR REPLACE FUNCTION public.create_unified_submission_atomic(
  p_crag_id UUID,
  p_primary_image JSONB,
  p_supplementary_images JSONB[],
  p_routes JSONB,
  p_route_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  created_image_id UUID;
  created_climb_id UUID;
  created_route_line_id UUID;
  created_crag_image_id UUID;
  route_item JSONB;
  supplementary_item JSONB;
  route_name TEXT;
  route_grade TEXT;
  route_slug TEXT;
  route_description TEXT;
  route_points JSONB;
  route_sequence_order INTEGER;
  route_image_width INTEGER;
  route_image_height INTEGER;
  primary_url TEXT;
  primary_storage_bucket TEXT;
  primary_storage_path TEXT;
  primary_face_directions JSONB;
  created_climb_ids UUID[] := '{}';
  created_route_line_ids UUID[] := '{}';
  created_crag_image_ids UUID[] := '{}';
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_crag_id IS NULL THEN
    RAISE EXCEPTION 'Crag ID is required';
  END IF;

  IF p_primary_image IS NULL OR jsonb_typeof(p_primary_image) <> 'object' THEN
    RAISE EXCEPTION 'Primary image payload is required';
  END IF;

  IF p_route_type IS NULL OR btrim(p_route_type) = '' THEN
    RAISE EXCEPTION 'Route type is required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0 THEN
    RAISE EXCEPTION 'At least one route is required';
  END IF;

  primary_url := NULLIF(btrim(COALESCE(p_primary_image->>'url', '')), '');
  primary_storage_bucket := NULLIF(btrim(COALESCE(p_primary_image->>'storage_bucket', '')), '');
  primary_storage_path := NULLIF(btrim(COALESCE(p_primary_image->>'storage_path', '')), '');
  primary_face_directions := COALESCE(p_primary_image->'face_directions', '[]'::jsonb);

  IF primary_url IS NULL THEN
    RAISE EXCEPTION 'Primary image url is required';
  END IF;

  IF primary_storage_bucket IS NULL THEN
    RAISE EXCEPTION 'Primary image storage_bucket is required';
  END IF;

  IF primary_storage_path IS NULL THEN
    RAISE EXCEPTION 'Primary image storage_path is required';
  END IF;

  IF jsonb_typeof(primary_face_directions) <> 'array' OR jsonb_array_length(primary_face_directions) = 0 THEN
    RAISE EXCEPTION 'Primary image face_directions must be a non-empty array';
  END IF;

  INSERT INTO public.images (
    url,
    storage_bucket,
    storage_path,
    latitude,
    longitude,
    capture_date,
    face_direction,
    face_directions,
    crag_id,
    width,
    height,
    natural_width,
    natural_height,
    created_by
  )
  VALUES (
    primary_url,
    primary_storage_bucket,
    primary_storage_path,
    NULLIF(p_primary_image->>'image_lat', '')::NUMERIC,
    NULLIF(p_primary_image->>'image_lng', '')::NUMERIC,
    NULLIF(p_primary_image->>'capture_date', '')::TIMESTAMPTZ,
    p_primary_image->'face_directions'->>0,
    ARRAY(SELECT jsonb_array_elements_text(p_primary_image->'face_directions')),
    p_crag_id,
    NULLIF(p_primary_image->>'width', '')::INTEGER,
    NULLIF(p_primary_image->>'height', '')::INTEGER,
    NULLIF(p_primary_image->>'natural_width', '')::INTEGER,
    NULLIF(p_primary_image->>'natural_height', '')::INTEGER,
    current_user_id
  )
  RETURNING id INTO created_image_id;

  IF p_supplementary_images IS NOT NULL THEN
    FOREACH supplementary_item IN ARRAY p_supplementary_images
    LOOP
      IF supplementary_item IS NULL OR jsonb_typeof(supplementary_item) <> 'object' THEN
        RAISE EXCEPTION 'Each supplementary image must be a JSON object';
      END IF;

      IF NULLIF(btrim(COALESCE(supplementary_item->>'url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'Supplementary image url is required';
      END IF;

      INSERT INTO public.crag_images (
        crag_id,
        url,
        width,
        height,
        linked_image_id
      )
      VALUES (
        p_crag_id,
        btrim(supplementary_item->>'url'),
        NULLIF(supplementary_item->>'width', '')::INTEGER,
        NULLIF(supplementary_item->>'height', '')::INTEGER,
        created_image_id
      )
      RETURNING id INTO created_crag_image_id;

      created_crag_image_ids := array_append(created_crag_image_ids, created_crag_image_id);
    END LOOP;
  END IF;

  FOR route_item IN
    SELECT value FROM jsonb_array_elements(p_routes)
  LOOP
    route_name := btrim(COALESCE(route_item->>'name', ''));
    route_grade := COALESCE(route_item->>'grade', '');
    route_slug := NULLIF(btrim(COALESCE(route_item->>'slug', '')), '');
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_points := route_item->'points';

    IF route_name = '' THEN
      RAISE EXCEPTION 'Route name is required';
    END IF;

    IF route_grade = '' THEN
      RAISE EXCEPTION 'Route grade is required';
    END IF;

    IF route_points IS NULL OR jsonb_typeof(route_points) <> 'array' OR jsonb_array_length(route_points) < 2 THEN
      RAISE EXCEPTION 'Route points must contain at least 2 points';
    END IF;

    BEGIN
      route_sequence_order := (route_item->>'sequence_order')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Route sequence_order must be a valid integer';
    END;

    BEGIN
      route_image_width := (route_item->>'image_width')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Route image_width must be a valid integer';
    END;

    BEGIN
      route_image_height := (route_item->>'image_height')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Route image_height must be a valid integer';
    END;

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
      p_route_type,
      'approved',
      current_user_id,
      p_crag_id
    )
    RETURNING id INTO created_climb_id;

    created_climb_ids := array_append(created_climb_ids, created_climb_id);

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
      created_image_id,
      created_climb_id,
      route_points,
      'red',
      route_sequence_order,
      route_image_width,
      route_image_height
    )
    RETURNING id INTO created_route_line_id;

    created_route_line_ids := array_append(created_route_line_ids, created_route_line_id);
  END LOOP;

  RETURN jsonb_build_object(
    'image_id', created_image_id,
    'crag_id', p_crag_id,
    'climb_ids', to_jsonb(created_climb_ids),
    'route_line_ids', to_jsonb(created_route_line_ids),
    'crag_image_ids', to_jsonb(created_crag_image_ids),
    'climbs_created', COALESCE(array_length(created_climb_ids, 1), 0),
    'route_lines_created', COALESCE(array_length(created_route_line_ids, 1), 0),
    'supplementary_created', COALESCE(array_length(created_crag_image_ids, 1), 0)
  );
END;
$function$;
