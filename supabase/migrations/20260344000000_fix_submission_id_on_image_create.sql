-- Fix: Ensure submission_id is set when creating images
-- Part 1: Create function only (no GRANT statements)

CREATE OR REPLACE FUNCTION public.create_unified_submission_atomic(
  p_crag_id UUID,
  p_primary_image JSONB,
  p_supplementary_images JSONB[],
  p_routes JSONB,
  p_route_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  created_image_id UUID;
  supplementary_image_ids UUID[] := ARRAY[]::UUID[];
  supplementary_item JSONB;
  created_supplementary_image_id UUID;
  unified_submission_id UUID := gen_random_uuid();
  route_item JSONB;
  created_climb_id UUID;
  route_name TEXT;
  route_grade TEXT;
  route_slug TEXT;
  base_route_slug TEXT;
  route_description TEXT;
  route_type_normalized TEXT;
  route_points JSONB;
  route_image_width INTEGER;
  route_image_height INTEGER;
  primary_url TEXT;
  primary_storage_bucket TEXT;
  primary_storage_path TEXT;
  primary_face_directions JSONB;
  result JSONB;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_crag_id IS NULL THEN
    RAISE EXCEPTION 'Crag ID is required';
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
    url, storage_bucket, storage_path, latitude, longitude, capture_date,
    face_direction, face_directions, crag_id, submission_id, width, height,
    natural_width, natural_height, created_by
  )
  VALUES (
    primary_url, primary_storage_bucket, primary_storage_path,
    NULLIF(p_primary_image->>'image_lat', '')::NUMERIC,
    NULLIF(p_primary_image->>'image_lng', '')::NUMERIC,
    NULLIF(p_primary_image->>'capture_date', '')::TIMESTAMPTZ,
    primary_face_directions->>0, primary_face_directions, p_crag_id,
    unified_submission_id,
    NULLIF(p_primary_image->>'width', '')::INTEGER,
    NULLIF(p_primary_image->>'height', '')::INTEGER,
    NULLIF(p_primary_image->>'natural_width', '')::INTEGER,
    NULLIF(p_primary_image->>'natural_height', '')::INTEGER,
    current_user_id
  )
  RETURNING id INTO created_image_id;

  IF p_supplementary_images IS NOT NULL AND array_length(p_supplementary_images, 1) > 0 THEN
    FOR supplementary_item IN SELECT * FROM unnest(p_supplementary_images) WITH ORDINALITY AS sup(item, ord)
    LOOP
      IF supplementary_item IS NULL OR jsonb_typeof(supplementary_item) <> 'object' THEN
        RAISE EXCEPTION 'Each supplementary image must be a JSON object';
      END IF;

      INSERT INTO public.images (
        url, storage_bucket, storage_path, crag_id, submission_id, face_directions, created_by
      )
      VALUES (
        NULLIF(btrim(COALESCE(supplementary_item->>'url', '')), ''),
        NULLIF(btrim(COALESCE(supplementary_item->>'storage_bucket', '')), ''),
        NULLIF(btrim(COALESCE(supplementary_item->>'storage_path', '')), ''),
        p_crag_id, unified_submission_id,
        COALESCE(supplementary_item->'face_directions', '[]'::jsonb),
        current_user_id
      )
      RETURNING id INTO created_supplementary_image_id;
      supplementary_image_ids := array_append(supplementary_image_ids, created_supplementary_image_id);
    END LOOP;
  END IF;

  FOR route_item IN SELECT * FROM jsonb_array_elements(p_routes)
  LOOP
    route_name := COALESCE(NULLIF(btrim(route_item->>'name')), 'Unnamed');
    route_grade := COALESCE(NULLIF(btrim(route_item->>'grade')), '5C');
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_type_normalized := COALESCE(NULLIF(btrim(LOWER(route_item->>'route_type')), ''), p_route_type);
    route_points := COALESCE(route_item->'points', '[]'::jsonb);
    route_image_width := NULLIF(route_item->>'imageWidth', '')::INTEGER;
    route_image_height := NULLIF(route_item->>'imageHeight', '')::INTEGER;

    base_route_slug := COALESCE(NULLIF(public.slugify(route_name), 'unnamed'), 'route');
    route_slug := base_route_slug;
    WHILE EXISTS (SELECT 1 FROM climbs WHERE crag_id = p_crag_id AND slug = route_slug) LOOP
      route_slug := base_route_slug || '-' || substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
    END LOOP;

    INSERT INTO climbs (name, grade, route_type, description, crag_id, user_id, slug)
    VALUES (route_name, route_grade, route_type_normalized, route_description, p_crag_id, current_user_id, route_slug)
    RETURNING id INTO created_climb_id;

    INSERT INTO route_lines (image_id, climb_id, points, color, image_width, image_height)
    VALUES (created_image_id, created_climb_id, route_points, 'red',
      COALESCE(route_image_width, 1200), COALESCE(route_image_height, 1200));
  END LOOP;

  RETURN jsonb_build_object(
    'submission_id', unified_submission_id,
    'image_id', created_image_id,
    'image_ids', array_prepend(created_image_id, supplementary_image_ids)
  );
END;
$$;