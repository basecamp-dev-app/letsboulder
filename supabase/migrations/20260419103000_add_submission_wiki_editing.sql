CREATE TABLE IF NOT EXISTS public.submission_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edit_kind text NOT NULL,
  summary text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submission_contributors (
  image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_contributed_at timestamp with time zone NOT NULL DEFAULT now(),
  last_contributed_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (image_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_edit_history_image_created_at
  ON public.submission_edit_history (image_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_edit_history_user_created_at
  ON public.submission_edit_history (edited_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_contributors_user_id
  ON public.submission_contributors (user_id);

ALTER TABLE public.submission_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read submission edit history"
  ON public.submission_edit_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manage submission edit history"
  ON public.submission_edit_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read submission contributors"
  ON public.submission_contributors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manage submission contributors"
  ON public.submission_contributors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.user_can_wiki_edit_submission(p_image_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.id = p_image_id
      AND p_user_id IS NOT NULL
      AND i.created_by IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.record_submission_contribution(p_image_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF p_image_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT created_by
  INTO v_owner_id
  FROM public.images
  WHERE id = p_image_id
  LIMIT 1;

  IF v_owner_id IS NULL OR v_owner_id = p_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.submission_contributors (image_id, user_id)
  VALUES (p_image_id, p_user_id)
  ON CONFLICT (image_id, user_id)
  DO UPDATE SET last_contributed_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.log_submission_edit(
  p_image_id uuid,
  p_edited_by uuid,
  p_edit_kind text,
  p_summary text,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_image_id IS NULL OR p_edited_by IS NULL OR p_edit_kind IS NULL OR btrim(COALESCE(p_summary, '')) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.submission_edit_history (image_id, edited_by, edit_kind, summary, before_data, after_data)
  VALUES (p_image_id, p_edited_by, p_edit_kind, btrim(p_summary), p_before_data, p_after_data);

  PERFORM public.record_submission_contribution(p_image_id, p_edited_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_own_submitted_routes(p_image_id uuid, p_routes jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  route_item jsonb;
  route_id uuid;
  climb_id uuid;
  route_name text;
  route_description text;
  route_points jsonb;
  route_sequence_order integer;
  updated_count integer := 0;
  existing_route record;
  route_summary text;
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

  IF NOT public.user_can_wiki_edit_submission(p_image_id, current_user_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit routes for this image';
  END IF;

  FOR route_item IN SELECT value FROM jsonb_array_elements(p_routes)
  LOOP
    BEGIN
      route_id := (route_item->>'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid route id provided';
    END;

    route_name := btrim(COALESCE(route_item->>'name', ''));
    route_description := NULLIF(btrim(COALESCE(route_item->>'description', '')), '');
    route_points := route_item->'points';

    BEGIN
      route_sequence_order := COALESCE((route_item->>'sequenceOrder')::integer, updated_count);
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

    SELECT rl.climb_id, c.name, c.description, rl.points, rl.sequence_order
    INTO existing_route
    FROM public.route_lines rl
    JOIN public.climbs c ON c.id = rl.climb_id
    WHERE rl.id = route_id
      AND rl.image_id = p_image_id;

    climb_id := existing_route.climb_id;

    IF climb_id IS NULL THEN
      RAISE EXCEPTION 'Route not found or not editable';
    END IF;

    UPDATE public.climbs
    SET
      name = route_name,
      description = route_description,
      updated_at = now()
    WHERE id = climb_id;

    UPDATE public.route_lines
    SET
      points = route_points,
      sequence_order = route_sequence_order
    WHERE id = route_id;

    route_summary := NULL;
    IF COALESCE(existing_route.name, '') <> route_name THEN
      route_summary := format('Renamed route "%s" to "%s"', COALESCE(existing_route.name, 'Unnamed'), route_name);
    ELSIF COALESCE(existing_route.description, '') IS DISTINCT FROM COALESCE(route_description, '') THEN
      route_summary := format('Updated route description for "%s"', route_name);
    ELSIF COALESCE(existing_route.points, '[]'::jsonb) IS DISTINCT FROM route_points THEN
      route_summary := format('Updated route line for "%s"', route_name);
    ELSIF COALESCE(existing_route.sequence_order, -1) IS DISTINCT FROM route_sequence_order THEN
      route_summary := format('Updated route order for "%s"', route_name);
    ELSE
      route_summary := format('Updated route "%s"', route_name);
    END IF;

    PERFORM public.log_submission_edit(
      p_image_id,
      current_user_id,
      'route_updated',
      route_summary,
      jsonb_build_object(
        'route_line_id', route_id,
        'climb_id', climb_id,
        'name', existing_route.name,
        'description', existing_route.description,
        'points', existing_route.points,
        'sequence_order', existing_route.sequence_order
      ),
      jsonb_build_object(
        'route_line_id', route_id,
        'climb_id', climb_id,
        'name', route_name,
        'description', route_description,
        'points', route_points,
        'sequence_order', route_sequence_order
      )
    );

    updated_count := updated_count + 1;
  END LOOP;

  UPDATE public.images
  SET last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_submission_crag_metadata(
  p_image_id uuid,
  p_crag_name text,
  p_region_tag text,
  p_sub_area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  v_image record;
  v_crag record;
  v_country_code text;
  v_region_tag text;
  v_sub_area text;
  v_tag_id uuid;
  v_slug text;
  v_summary text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_crag_name IS NULL OR btrim(p_crag_name) = '' THEN
    RAISE EXCEPTION 'Crag name is required';
  END IF;

  IF p_region_tag IS NULL OR btrim(p_region_tag) = '' THEN
    RAISE EXCEPTION 'Region tag is required';
  END IF;

  v_region_tag := btrim(p_region_tag);
  v_sub_area := NULLIF(btrim(COALESCE(p_sub_area, '')), '');

  SELECT id, created_by, crag_id
  INTO v_image
  FROM public.images
  WHERE id = p_image_id
  LIMIT 1;

  IF v_image IS NULL THEN
    RAISE EXCEPTION 'Image not found';
  END IF;

  IF NOT public.user_can_wiki_edit_submission(p_image_id, current_user_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission';
  END IF;

  IF v_image.crag_id IS NULL THEN
    RAISE EXCEPTION 'Submission image is not linked to a crag';
  END IF;

  SELECT id, country_code, name, region_name, sub_area
  INTO v_crag
  FROM public.crags
  WHERE id = v_image.crag_id
  LIMIT 1;

  IF v_crag IS NULL THEN
    RAISE EXCEPTION 'Crag not found';
  END IF;

  v_country_code := NULLIF(upper(btrim(COALESCE(v_crag.country_code, ''))), '');
  v_slug := trim(both '-' from regexp_replace(lower(v_region_tag), '[^a-z0-9]+', '-', 'g'));

  IF v_slug = '' THEN
    v_slug := 'region';
  END IF;

  SELECT id
  INTO v_tag_id
  FROM public.location_tags
  WHERE kind = 'region'
    AND lower(name) = lower(v_region_tag)
    AND COALESCE(country_code, '') = COALESCE(v_country_code, '')
  LIMIT 1;

  IF v_tag_id IS NULL THEN
    BEGIN
      INSERT INTO public.location_tags (kind, name, slug, country_code)
      VALUES ('region', v_region_tag, v_slug, v_country_code)
      RETURNING id INTO v_tag_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id
      INTO v_tag_id
      FROM public.location_tags
      WHERE kind = 'region'
        AND lower(name) = lower(v_region_tag)
        AND COALESCE(country_code, '') = COALESCE(v_country_code, '')
      LIMIT 1;
    END;
  END IF;

  IF v_tag_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve region tag';
  END IF;

  UPDATE public.crags
  SET
    name = btrim(p_crag_name),
    region_name = v_region_tag,
    sub_area = v_sub_area,
    updated_at = now(),
    last_edited_by = current_user_id
  WHERE id = v_crag.id;

  DELETE FROM public.crag_location_tags
  WHERE crag_id = v_crag.id
    AND is_primary_region = true;

  INSERT INTO public.crag_location_tags (crag_id, tag_id, is_primary_region)
  VALUES (v_crag.id, v_tag_id, true)
  ON CONFLICT (crag_id, tag_id)
  DO UPDATE SET is_primary_region = true;

  IF COALESCE(v_crag.name, '') <> btrim(p_crag_name) THEN
    v_summary := 'Updated crag name';
  ELSIF COALESCE(v_crag.region_name, '') <> v_region_tag THEN
    v_summary := 'Changed region tag';
  ELSIF COALESCE(v_crag.sub_area, '') IS DISTINCT FROM COALESCE(v_sub_area, '') THEN
    v_summary := 'Changed sub-area';
  ELSE
    v_summary := 'Updated crag metadata';
  END IF;

  PERFORM public.log_submission_edit(
    p_image_id,
    current_user_id,
    'crag_metadata_updated',
    v_summary,
    jsonb_build_object(
      'crag_id', v_crag.id,
      'name', v_crag.name,
      'region_tag', v_crag.region_name,
      'sub_area', v_crag.sub_area
    ),
    jsonb_build_object(
      'crag_id', v_crag.id,
      'name', btrim(p_crag_name),
      'region_tag', v_region_tag,
      'sub_area', v_sub_area
    )
  );

  UPDATE public.images
  SET last_edited_by = current_user_id
  WHERE id = p_image_id;

  RETURN jsonb_build_object(
    'crag_id', v_crag.id,
    'name', btrim(p_crag_name),
    'region_tag', v_region_tag,
    'sub_area', v_sub_area,
    'last_edited_by', current_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_submission_image_metadata(
  p_image_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_face_directions text[],
  p_location_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_face_directions text[];
  resolved_location_mode text;
  existing_image record;
  summary text;
  next_latitude double precision;
  next_longitude double precision;
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

  IF NOT public.user_can_wiki_edit_submission(p_image_id, current_user_id) THEN
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

    SELECT COALESCE(array_agg(direction ORDER BY min_idx), ARRAY[]::text[])
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

  SELECT latitude, longitude, location_mode, face_directions
  INTO existing_image
  FROM public.images
  WHERE id = p_image_id
  LIMIT 1;

  next_latitude := CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_latitude END;
  next_longitude := CASE WHEN resolved_location_mode = 'shared' THEN NULL ELSE p_longitude END;

  UPDATE public.images
  SET
    latitude = next_latitude,
    longitude = next_longitude,
    location_mode = resolved_location_mode,
    face_directions = normalized_face_directions,
    face_direction = CASE
      WHEN normalized_face_directions IS NULL OR array_length(normalized_face_directions, 1) IS NULL THEN NULL
      ELSE normalized_face_directions[1]
    END,
    last_edited_by = current_user_id
  WHERE id = p_image_id;

  IF COALESCE(existing_image.location_mode, 'custom') <> resolved_location_mode THEN
    summary := format('Changed location mode to %s', resolved_location_mode);
  ELSIF COALESCE(to_jsonb(existing_image.face_directions), '[]'::jsonb) IS DISTINCT FROM COALESCE(to_jsonb(normalized_face_directions), '[]'::jsonb) THEN
    summary := 'Changed face directions';
  ELSIF existing_image.latitude IS DISTINCT FROM next_latitude OR existing_image.longitude IS DISTINCT FROM next_longitude THEN
    summary := 'Updated image location';
  ELSE
    summary := 'Updated image metadata';
  END IF;

  PERFORM public.log_submission_edit(
    p_image_id,
    current_user_id,
    'image_metadata_updated',
    summary,
    jsonb_build_object(
      'latitude', existing_image.latitude,
      'longitude', existing_image.longitude,
      'location_mode', existing_image.location_mode,
      'face_directions', COALESCE(to_jsonb(existing_image.face_directions), '[]'::jsonb)
    ),
    jsonb_build_object(
      'latitude', next_latitude,
      'longitude', next_longitude,
      'location_mode', resolved_location_mode,
      'face_directions', COALESCE(to_jsonb(normalized_face_directions), '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'latitude', next_latitude,
    'longitude', next_longitude,
    'location_mode', resolved_location_mode,
    'face_directions', COALESCE(to_jsonb(normalized_face_directions), '[]'::jsonb)
  );
END;
$$;

GRANT ALL ON TABLE public.submission_edit_history TO authenticated;
GRANT ALL ON TABLE public.submission_edit_history TO service_role;
GRANT ALL ON TABLE public.submission_contributors TO authenticated;
GRANT ALL ON TABLE public.submission_contributors TO service_role;

GRANT ALL ON FUNCTION public.user_can_wiki_edit_submission(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_can_wiki_edit_submission(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.record_submission_contribution(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_submission_contribution(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.log_submission_edit(uuid, uuid, text, text, jsonb, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_submission_edit(uuid, uuid, text, text, jsonb, jsonb) TO service_role;
