ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS wiki_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.images
  ADD CONSTRAINT images_wiki_revision_nonnegative CHECK (wiki_revision >= 0);

CREATE TABLE public.published_edit_mutations (
  editor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_mutation_id uuid NOT NULL,
  image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  base_revision bigint NOT NULL,
  committed_revision bigint,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (editor_id, client_mutation_id),
  CONSTRAINT published_edit_mutations_base_revision_nonnegative CHECK (base_revision >= 0),
  CONSTRAINT published_edit_mutations_committed_revision_nonnegative
    CHECK (committed_revision IS NULL OR committed_revision >= 0),
  CONSTRAINT published_edit_mutations_result_consistent
    CHECK ((committed_revision IS NULL) = (result IS NULL))
);

CREATE INDEX published_edit_mutations_image_created_at_idx
  ON public.published_edit_mutations (image_id, created_at DESC);

ALTER TABLE public.published_edit_mutations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.published_edit_mutations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_published_submission_edit(
  p_image_id uuid,
  p_client_mutation_id uuid,
  p_operations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_editor_id uuid := auth.uid();
  v_image public.images%ROWTYPE;
  v_receipt public.published_edit_mutations%ROWTYPE;
  v_request_hash text;
  v_base_revision bigint;
  v_committed_revision bigint;
  v_metadata jsonb;
  v_create_routes jsonb := '[]'::jsonb;
  v_update_routes jsonb := '[]'::jsonb;
  v_grade_votes jsonb := '[]'::jsonb;
  v_item jsonb;
  v_client_route_id uuid;
  v_route_line_id uuid;
  v_climb_id uuid;
  v_name text;
  v_description text;
  v_grade text;
  v_route_type text;
  v_points jsonb;
  v_sequence_order integer;
  v_image_width integer;
  v_image_height integer;
  v_slug text;
  v_base_slug text;
  v_existing_route record;
  v_existing_vote text;
  v_face_directions text[];
  v_location_mode text;
  v_latitude double precision;
  v_longitude double precision;
  v_source_image_id uuid;
  v_related_image_id uuid;
  v_route_mappings jsonb := '[]'::jsonb;
  v_history_ids jsonb := '[]'::jsonb;
  v_history_id uuid;
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_votes_updated integer := 0;
  v_average_displacement double precision;
  v_start_displacement double precision;
  v_end_displacement double precision;
  v_risk_level text;
  v_moderation_state text;
  v_risk_reasons text[];
  v_field_targets text[];
  v_touched_climb_ids uuid[] := ARRAY[]::uuid[];
  v_changed boolean := false;
  v_metadata_changed boolean;
  v_affected_count integer;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'authenticated' OR v_editor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_image_id IS NULL OR p_client_mutation_id IS NULL THEN
    RAISE EXCEPTION 'Image ID and client mutation ID are required' USING ERRCODE = '22023';
  END IF;
  IF p_operations IS NULL OR jsonb_typeof(p_operations) <> 'object' THEN
    RAISE EXCEPTION 'Operations must be an object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_operations->'baseRevision') <> 'number'
    OR (p_operations->>'baseRevision')::numeric <> trunc((p_operations->>'baseRevision')::numeric)
    OR (p_operations->>'baseRevision')::numeric < 0 THEN
    RAISE EXCEPTION 'A non-negative integer base revision is required' USING ERRCODE = '22023';
  END IF;

  v_base_revision := (p_operations->>'baseRevision')::bigint;
  v_request_hash := md5(p_image_id::text || ':' || p_operations::text);
  v_metadata := p_operations->'imageMetadata';
  v_create_routes := COALESCE(p_operations->'createRoutes', '[]'::jsonb);
  v_update_routes := COALESCE(p_operations->'updateRoutes', '[]'::jsonb);
  v_grade_votes := COALESCE(p_operations->'gradeVotes', '[]'::jsonb);

  IF v_metadata IS NOT NULL AND jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Image metadata must be an object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_create_routes) <> 'array'
    OR jsonb_typeof(v_update_routes) <> 'array'
    OR jsonb_typeof(v_grade_votes) <> 'array' THEN
    RAISE EXCEPTION 'Route and grade operations must be arrays' USING ERRCODE = '22023';
  END IF;
  IF v_metadata IS NULL
    AND jsonb_array_length(v_create_routes) = 0
    AND jsonb_array_length(v_update_routes) = 0
    AND jsonb_array_length(v_grade_votes) = 0 THEN
    RAISE EXCEPTION 'At least one edit operation is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_create_routes) + jsonb_array_length(v_update_routes) > 40 THEN
    RAISE EXCEPTION 'You can edit up to 40 routes at once' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.published_edit_mutations (
    editor_id, client_mutation_id, image_id, request_hash, base_revision
  ) VALUES (
    v_editor_id, p_client_mutation_id, p_image_id, v_request_hash, v_base_revision
  ) ON CONFLICT (editor_id, client_mutation_id) DO NOTHING;

  SELECT * INTO v_receipt
  FROM public.published_edit_mutations
  WHERE editor_id = v_editor_id
    AND client_mutation_id = p_client_mutation_id
  FOR UPDATE;

  IF v_receipt.image_id IS DISTINCT FROM p_image_id
    OR v_receipt.request_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'Client mutation ID was already used for a different request'
      USING ERRCODE = '22023', DETAIL = 'mutation_id_conflict';
  END IF;
  IF v_receipt.result IS NOT NULL THEN
    RETURN v_receipt.result || jsonb_build_object('replayed', true);
  END IF;

  IF v_metadata->>'locationMode' = 'shared' THEN
    SELECT COALESCE(ci.source_image_id, p_image_id) INTO v_source_image_id
    FROM public.crag_images AS ci
    WHERE ci.linked_image_id = p_image_id
    LIMIT 1;
    v_source_image_id := COALESCE(v_source_image_id, p_image_id);
  END IF;
  FOR v_related_image_id IN
    SELECT affected_id FROM (
      SELECT p_image_id AS affected_id
      UNION
      SELECT v_source_image_id WHERE v_metadata->>'locationMode' = 'shared'
      UNION
      SELECT ci.linked_image_id FROM public.crag_images AS ci
      WHERE v_metadata->>'locationMode' = 'shared' AND ci.source_image_id = v_source_image_id
      UNION
      SELECT related_route.image_id
      FROM public.route_lines AS requested_route
      JOIN public.route_lines AS related_route ON related_route.climb_id = requested_route.climb_id
      WHERE requested_route.id IN (
        SELECT (route->>'routeLineId')::uuid FROM jsonb_array_elements(v_update_routes) AS route
      )
    ) AS affected
    WHERE affected_id IS NOT NULL
    ORDER BY affected_id
  LOOP
    PERFORM 1 FROM public.images WHERE id = v_related_image_id FOR UPDATE;
  END LOOP;
  SELECT * INTO v_image FROM public.images WHERE id = p_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002', DETAIL = 'not_found';
  END IF;
  IF NOT public.user_can_wiki_edit_submission(p_image_id, v_editor_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this submission'
      USING ERRCODE = '42501', DETAIL = 'permission_denied';
  END IF;
  IF v_image.wiki_revision <> v_base_revision THEN
    RAISE EXCEPTION 'Published submission changed while editing'
      USING ERRCODE = '40001', DETAIL = 'wiki_revision_conflict',
        HINT = v_image.wiki_revision::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_create_routes) AS route
    GROUP BY route->>'clientRouteId'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_update_routes) AS route
    GROUP BY route->>'routeLineId'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_grade_votes) AS vote
    GROUP BY vote->>'routeLineId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate route identifier' USING ERRCODE = '22023';
  END IF;

  IF v_metadata IS NOT NULL THEN
    IF jsonb_typeof(v_metadata->'faceDirections') <> 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_metadata->'faceDirections') AS direction
        WHERE upper(btrim(direction)) NOT IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')
      ) THEN
      RAISE EXCEPTION 'Invalid face direction provided' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(direction ORDER BY ord), ARRAY[]::text[])
    INTO v_face_directions
    FROM (
      SELECT upper(btrim(value)) AS direction, min(ordinality) AS ord
      FROM jsonb_array_elements_text(v_metadata->'faceDirections') WITH ORDINALITY AS item(value, ordinality)
      GROUP BY upper(btrim(value))
    ) AS normalized;

    v_location_mode := btrim(COALESCE(v_metadata->>'locationMode', ''));
    IF v_location_mode NOT IN ('shared', 'custom') THEN
      RAISE EXCEPTION 'Invalid location mode' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_latitude := NULLIF(v_metadata->>'latitude', '')::double precision;
      v_longitude := NULLIF(v_metadata->>'longitude', '')::double precision;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Latitude and longitude must be numbers or null' USING ERRCODE = '22023';
    END;
    IF v_latitude IS NOT NULL AND (v_latitude < -90 OR v_latitude > 90) THEN
      RAISE EXCEPTION 'Latitude must be between -90 and 90' USING ERRCODE = '22023';
    END IF;
    IF v_longitude IS NOT NULL AND (v_longitude < -180 OR v_longitude > 180) THEN
      RAISE EXCEPTION 'Longitude must be between -180 and 180' USING ERRCODE = '22023';
    END IF;
    IF v_location_mode = 'custom' AND (v_latitude IS NULL OR v_longitude IS NULL) THEN
      RAISE EXCEPTION 'Custom image locations require latitude and longitude' USING ERRCODE = '22023';
    END IF;

    IF v_location_mode = 'shared' THEN
      IF EXISTS (
        SELECT 1 FROM (
          SELECT v_source_image_id AS related_id
          UNION
          SELECT ci.linked_image_id FROM public.crag_images AS ci
          WHERE ci.source_image_id = v_source_image_id
        ) AS related
        WHERE related_id IS NOT NULL
          AND NOT public.user_can_wiki_edit_submission(related_id, v_editor_id)
      ) THEN
        RAISE EXCEPTION 'You do not have permission to synchronize a linked image'
          USING ERRCODE = '42501', DETAIL = 'permission_denied';
      END IF;
      UPDATE public.images
      SET latitude = NULL, longitude = NULL, location_mode = 'shared',
        last_edited_by = v_editor_id, wiki_revision = wiki_revision + 1
      WHERE id IN (
        SELECT related_id FROM (
          SELECT v_source_image_id AS related_id
          UNION
          SELECT ci.linked_image_id FROM public.crag_images AS ci
          WHERE ci.source_image_id = v_source_image_id
        ) AS related
      ) AND id <> p_image_id
        AND (latitude IS NOT NULL OR longitude IS NOT NULL OR location_mode IS DISTINCT FROM 'shared');
      GET DIAGNOSTICS v_affected_count = ROW_COUNT;
      v_changed := v_changed OR v_affected_count > 0;
      v_latitude := NULL;
      v_longitude := NULL;
    END IF;

    v_metadata_changed := v_image.latitude IS DISTINCT FROM v_latitude
      OR v_image.longitude IS DISTINCT FROM v_longitude
      OR v_image.location_mode IS DISTINCT FROM v_location_mode
      OR COALESCE(v_image.face_directions, ARRAY[]::text[]) IS DISTINCT FROM v_face_directions;
    UPDATE public.images
    SET latitude = v_latitude,
      longitude = v_longitude,
      location_mode = v_location_mode,
      face_directions = NULLIF(v_face_directions, ARRAY[]::text[]),
      face_direction = v_face_directions[1],
      last_edited_by = v_editor_id
    WHERE id = p_image_id AND v_metadata_changed;

    IF v_metadata_changed THEN
      INSERT INTO public.submission_edit_history (
        image_id, edited_by, edit_kind, summary, before_data, after_data
      ) VALUES (
        p_image_id, v_editor_id, 'image_metadata_updated', 'Updated image metadata',
        jsonb_build_object(
          'latitude', v_image.latitude, 'longitude', v_image.longitude,
          'location_mode', v_image.location_mode,
          'face_directions', COALESCE(to_jsonb(v_image.face_directions), '[]'::jsonb)
        ),
        jsonb_build_object(
          'latitude', v_latitude, 'longitude', v_longitude,
          'location_mode', v_location_mode,
          'face_directions', to_jsonb(v_face_directions)
        )
      ) RETURNING id INTO v_history_id;
      v_history_ids := v_history_ids || jsonb_build_array(v_history_id);
      v_changed := true;
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_create_routes)
  LOOP
    BEGIN
      v_client_route_id := (v_item->>'clientRouteId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid client route ID' USING ERRCODE = '22023';
    END;
    IF v_client_route_id IS NULL THEN
      RAISE EXCEPTION 'Client route ID is required' USING ERRCODE = '22023';
    END IF;
    v_name := btrim(COALESCE(v_item->>'name', ''));
    v_description := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');
    v_grade := btrim(COALESCE(v_item->>'grade', ''));
    v_route_type := replace(lower(btrim(COALESCE(v_item->>'climbType', 'boulder'))), '_', '-');
    v_points := v_item->'points';
    BEGIN
      v_sequence_order := (v_item->>'sequenceOrder')::integer;
      v_image_width := (v_item->>'imageWidth')::integer;
      v_image_height := (v_item->>'imageHeight')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid route order or dimensions' USING ERRCODE = '22023';
    END;
    IF v_name = '' OR char_length(v_name) > 200 THEN
      RAISE EXCEPTION 'Route name must contain 1 to 200 characters' USING ERRCODE = '22023';
    END IF;
    IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
      RAISE EXCEPTION 'Route description must be 500 characters or less' USING ERRCODE = '22023';
    END IF;
    IF v_route_type NOT IN ('sport', 'boulder', 'trad', 'deep-water-solo') THEN
      RAISE EXCEPTION 'Invalid route type' USING ERRCODE = '22023';
    END IF;
    IF v_grade <> ALL(ARRAY[
      '3A','3A+','3B','3B+','3C','3C+','4A','4A+','4B','4B+','4C','4C+',
      '5A','5A+','5B','5B+','5C','5C+','6A','6A+','6B','6B+','6C','6C+',
      '7A','7A+','7B','7B+','7C','7C+','8A','8A+','8B','8B+','8C','8C+',
      '9A','9A+','9B','9B+','9C','9C+'
    ]::text[]) THEN
      RAISE EXCEPTION 'Invalid grade' USING ERRCODE = '22023';
    END IF;
    IF v_sequence_order < 0 OR v_image_width <= 0 OR v_image_height <= 0 THEN
      RAISE EXCEPTION 'Route order and dimensions must be positive' USING ERRCODE = '22023';
    END IF;
    IF v_points IS NULL OR jsonb_typeof(v_points) <> 'array' OR jsonb_array_length(v_points) < 2
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_points) AS point
        WHERE jsonb_typeof(point->'x') <> 'number' OR jsonb_typeof(point->'y') <> 'number'
          OR (point->>'x')::double precision NOT BETWEEN 0 AND 1
          OR (point->>'y')::double precision NOT BETWEEN 0 AND 1
      ) THEN
      RAISE EXCEPTION 'Route points must be normalized values between 0 and 1' USING ERRCODE = '22023';
    END IF;

    v_base_slug := COALESCE(NULLIF(public.slugify(v_name), 'unnamed'), 'route');
    v_slug := v_base_slug;
    WHILE v_image.crag_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.climbs WHERE crag_id = v_image.crag_id AND slug = v_slug
    ) LOOP
      v_slug := v_base_slug || '-' || substring(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
    END LOOP;
    v_climb_id := extensions.gen_random_uuid();
    INSERT INTO public.climbs (
      id, name, grade, status, route_type, description, user_id, crag_id, place_id, slug
    ) VALUES (
      v_climb_id, v_name, v_grade, 'approved', v_route_type, v_description,
      v_image.created_by, v_image.crag_id, v_image.place_id,
      CASE WHEN v_image.crag_id IS NULL THEN NULL ELSE v_slug END
    );
    INSERT INTO public.route_lines (
      image_id, climb_id, points, color, sequence_order, image_width, image_height
    ) VALUES (
      p_image_id, v_climb_id, v_points, 'red', v_sequence_order, v_image_width, v_image_height
    ) RETURNING id INTO v_route_line_id;
    INSERT INTO public.grade_votes (climb_id, user_id, grade)
    VALUES (v_climb_id, v_editor_id, v_grade)
    ON CONFLICT (climb_id, user_id) DO UPDATE SET grade = EXCLUDED.grade, created_at = now();

    INSERT INTO public.submission_edit_history (
      image_id, edited_by, edit_kind, summary, before_data, after_data
    ) VALUES (
      p_image_id, v_editor_id, 'route_created', format('Added route "%s"', v_name), NULL,
      jsonb_build_object(
        'route_line_id', v_route_line_id, 'climb_id', v_climb_id,
        'name', v_name, 'grade', v_grade, 'description', v_description
      )
    ) RETURNING id INTO v_history_id;
    v_history_ids := v_history_ids || jsonb_build_array(v_history_id);
    v_route_mappings := v_route_mappings || jsonb_build_array(jsonb_build_object(
      'clientRouteId', v_client_route_id,
      'routeLineId', v_route_line_id,
      'climbId', v_climb_id
    ));
    v_created_count := v_created_count + 1;
    v_changed := true;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_update_routes)
  LOOP
    BEGIN
      v_route_line_id := (v_item->>'routeLineId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid route line ID' USING ERRCODE = '22023';
    END;
    v_name := btrim(COALESCE(v_item->>'name', ''));
    v_description := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');
    v_points := v_item->'points';
    BEGIN
      v_sequence_order := (v_item->>'sequenceOrder')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid route order' USING ERRCODE = '22023';
    END;
    IF v_name = '' OR char_length(v_name) > 200 THEN
      RAISE EXCEPTION 'Route name must contain 1 to 200 characters' USING ERRCODE = '22023';
    END IF;
    IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
      RAISE EXCEPTION 'Route description must be 500 characters or less' USING ERRCODE = '22023';
    END IF;
    IF v_sequence_order < 0 OR v_points IS NULL OR jsonb_typeof(v_points) <> 'array'
      OR jsonb_array_length(v_points) < 2 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_points) AS point
        WHERE jsonb_typeof(point->'x') <> 'number' OR jsonb_typeof(point->'y') <> 'number'
          OR (point->>'x')::double precision NOT BETWEEN 0 AND 1
          OR (point->>'y')::double precision NOT BETWEEN 0 AND 1
      ) THEN
      RAISE EXCEPTION 'Route points must be normalized values between 0 and 1' USING ERRCODE = '22023';
    END IF;

    SELECT rl.climb_id, rl.points, rl.sequence_order, c.name, c.description
    INTO v_existing_route
    FROM public.route_lines AS rl
    JOIN public.climbs AS c ON c.id = rl.climb_id
    WHERE rl.id = v_route_line_id AND rl.image_id = p_image_id
    FOR UPDATE OF rl, c;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Route not found or belongs to another image' USING ERRCODE = '22023';
    END IF;

    v_risk_level := 'safe';
    v_moderation_state := 'accepted';
    v_risk_reasons := ARRAY[]::text[];
    v_field_targets := ARRAY[]::text[];
    IF v_image.created_by IS DISTINCT FROM v_editor_id THEN
      IF (btrim(COALESCE(v_existing_route.name, '')) <> '' AND lower(v_name) IN ('route', 'unknown', 'test', 'todo', 'line'))
        OR (char_length(btrim(COALESCE(v_existing_route.name, ''))) >= 40 AND char_length(v_name) < 15)
        OR (btrim(COALESCE(v_existing_route.description, '')) <> '' AND v_description IS NULL)
        OR (char_length(btrim(COALESCE(v_existing_route.description, ''))) >= 40
          AND char_length(COALESCE(v_description, '')) < 15) THEN
        RAISE EXCEPTION 'This edit was blocked because it removes too much value from the route'
          USING ERRCODE = '42501', DETAIL = 'high_risk_edit';
      END IF;

      SELECT avg(sqrt(power((old_point.value->>'x')::double precision - (new_point.value->>'x')::double precision, 2)
        + power((old_point.value->>'y')::double precision - (new_point.value->>'y')::double precision, 2)))
      INTO v_average_displacement
      FROM jsonb_array_elements(v_existing_route.points) WITH ORDINALITY AS old_point(value, ordinality)
      JOIN jsonb_array_elements(v_points) WITH ORDINALITY AS new_point(value, ordinality)
        USING (ordinality);
      SELECT sqrt(power((v_existing_route.points->0->>'x')::double precision - (v_points->0->>'x')::double precision, 2)
        + power((v_existing_route.points->0->>'y')::double precision - (v_points->0->>'y')::double precision, 2)),
        sqrt(power((v_existing_route.points->-1->>'x')::double precision - (v_points->-1->>'x')::double precision, 2)
        + power((v_existing_route.points->-1->>'y')::double precision - (v_points->-1->>'y')::double precision, 2))
      INTO v_start_displacement, v_end_displacement;
      IF v_average_displacement > 0.35 OR v_start_displacement > 0.45 OR v_end_displacement > 0.45 THEN
        RAISE EXCEPTION 'This edit was blocked because it replaces too much route geometry'
          USING ERRCODE = '42501', DETAIL = 'high_risk_edit';
      ELSIF v_average_displacement > 0.12
        OR abs(jsonb_array_length(v_existing_route.points) - jsonb_array_length(v_points)) >= 4
        OR v_start_displacement > 0.12 OR v_end_displacement > 0.12 THEN
        v_risk_level := 'suspicious';
        v_moderation_state := 'flagged';
        v_risk_reasons := ARRAY['geometry_shifted'];
        v_field_targets := ARRAY['route_geometry'];
      END IF;
    END IF;

    IF v_existing_route.name IS DISTINCT FROM v_name
      OR v_existing_route.description IS DISTINCT FROM v_description
      OR v_existing_route.points IS DISTINCT FROM v_points
      OR v_existing_route.sequence_order IS DISTINCT FROM v_sequence_order THEN
      UPDATE public.climbs SET name = v_name, description = v_description, updated_at = now()
      WHERE id = v_existing_route.climb_id;
      IF v_existing_route.name IS DISTINCT FROM v_name
        OR v_existing_route.description IS DISTINCT FROM v_description THEN
        v_touched_climb_ids := array_append(v_touched_climb_ids, v_existing_route.climb_id);
      END IF;
      UPDATE public.route_lines SET points = v_points, sequence_order = v_sequence_order
      WHERE id = v_route_line_id;
      INSERT INTO public.submission_edit_history (
        image_id, edited_by, edit_kind, summary, before_data, after_data,
        risk_level, moderation_state, risk_reasons, field_targets
      ) VALUES (
        p_image_id, v_editor_id, 'route_updated', format('Updated route "%s"', v_name),
        jsonb_build_object(
          'route_line_id', v_route_line_id, 'climb_id', v_existing_route.climb_id,
          'name', v_existing_route.name, 'description', v_existing_route.description,
          'points', v_existing_route.points, 'sequence_order', v_existing_route.sequence_order
        ),
        jsonb_build_object(
          'route_line_id', v_route_line_id, 'climb_id', v_existing_route.climb_id,
          'name', v_name, 'description', v_description, 'points', v_points,
          'sequence_order', v_sequence_order
        ), v_risk_level, v_moderation_state, v_risk_reasons, v_field_targets
      ) RETURNING id INTO v_history_id;
      IF v_moderation_state = 'accepted' THEN
        v_history_ids := v_history_ids || jsonb_build_array(v_history_id);
      END IF;
      v_updated_count := v_updated_count + 1;
      v_changed := true;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_grade_votes)
  LOOP
    BEGIN
      v_route_line_id := (v_item->>'routeLineId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid route line ID' USING ERRCODE = '22023';
    END;
    v_grade := btrim(COALESCE(v_item->>'grade', ''));
    IF v_grade <> ALL(ARRAY[
      '3A','3A+','3B','3B+','3C','3C+','4A','4A+','4B','4B+','4C','4C+',
      '5A','5A+','5B','5B+','5C','5C+','6A','6A+','6B','6B+','6C','6C+',
      '7A','7A+','7B','7B+','7C','7C+','8A','8A+','8B','8B+','8C','8C+',
      '9A','9A+','9B','9B+','9C','9C+'
    ]::text[]) THEN
      RAISE EXCEPTION 'Invalid grade' USING ERRCODE = '22023';
    END IF;
    SELECT rl.climb_id INTO v_climb_id FROM public.route_lines AS rl
    WHERE rl.id = v_route_line_id AND rl.image_id = p_image_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grade vote route not found or belongs to another image' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_grade_votes) AS other
      JOIN public.route_lines AS other_route
        ON other_route.id = (other->>'routeLineId')::uuid
      WHERE other_route.climb_id = v_climb_id
        AND other->>'routeLineId' <> v_route_line_id::text
    ) THEN
      RAISE EXCEPTION 'Duplicate climb grade vote' USING ERRCODE = '22023';
    END IF;
    SELECT grade INTO v_existing_vote FROM public.grade_votes
    WHERE climb_id = v_climb_id AND user_id = v_editor_id;
    INSERT INTO public.grade_votes (climb_id, user_id, grade)
    VALUES (v_climb_id, v_editor_id, v_grade)
    ON CONFLICT (climb_id, user_id) DO UPDATE SET grade = EXCLUDED.grade, created_at = now()
    WHERE public.grade_votes.grade IS DISTINCT FROM EXCLUDED.grade;
    IF v_existing_vote IS DISTINCT FROM v_grade THEN
      v_votes_updated := v_votes_updated + 1;
      v_changed := true;
    END IF;
  END LOOP;

  IF cardinality(v_touched_climb_ids) > 0 THEN
    UPDATE public.images AS image
    SET wiki_revision = image.wiki_revision + 1, last_edited_by = v_editor_id
    WHERE image.id <> p_image_id AND EXISTS (
      SELECT 1 FROM public.route_lines AS route_line
      WHERE route_line.image_id = image.id
        AND route_line.climb_id = ANY(v_touched_climb_ids)
    );
  END IF;
  IF jsonb_array_length(v_history_ids) > 0 OR v_updated_count > 0 THEN
    PERFORM public.record_submission_contribution(p_image_id, v_editor_id);
  END IF;
  IF v_changed THEN
    UPDATE public.images
    SET wiki_revision = wiki_revision + 1, last_edited_by = v_editor_id
    WHERE id = p_image_id
    RETURNING wiki_revision INTO v_committed_revision;
  ELSE
    v_committed_revision := v_image.wiki_revision;
  END IF;

  v_result := jsonb_build_object(
    'imageId', p_image_id,
    'clientMutationId', p_client_mutation_id,
    'revision', v_committed_revision,
    'routeMappings', v_route_mappings,
    'historyIds', v_history_ids,
    'createdCount', v_created_count,
    'updatedCount', v_updated_count,
    'votesUpdated', v_votes_updated,
    'metadata', CASE WHEN v_metadata IS NULL THEN NULL ELSE jsonb_build_object(
      'latitude', v_latitude, 'longitude', v_longitude,
      'locationMode', v_location_mode, 'faceDirections', to_jsonb(v_face_directions)
    ) END,
    'replayed', false
  );

  UPDATE public.published_edit_mutations
  SET committed_revision = v_committed_revision, result = v_result
  WHERE editor_id = v_editor_id AND client_mutation_id = p_client_mutation_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_published_submission_edit(uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_published_submission_edit(uuid, uuid, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.create_submission_routes_service(
  p_user_id uuid,
  p_image_id uuid,
  p_crag_id uuid,
  p_route_type text,
  p_routes jsonb
)
RETURNS TABLE(climb_id uuid, name text, grade text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Service role and user ID are required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', p_user_id)::text,
    true
  );
  RETURN QUERY
  SELECT created.climb_id, created.name, created.grade
  FROM public.create_submission_routes_atomic(
    p_image_id, p_crag_id, p_route_type, p_routes
  ) AS created;
  UPDATE public.images
  SET wiki_revision = wiki_revision + 1, last_edited_by = p_user_id
  WHERE id = p_image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_submission_routes_service(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_submission_routes_service(uuid, uuid, uuid, text, jsonb)
  TO service_role;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.update_own_submitted_routes(uuid, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.update_submission_image_metadata(uuid, double precision, double precision, text[])
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.update_submission_image_metadata(uuid, double precision, double precision, text[], text)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.create_submission_routes_atomic(uuid, uuid, text, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.save_submission_grade_votes(uuid, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
  REVOKE INSERT ON TABLE public.route_lines FROM authenticated;
END;
$$;
