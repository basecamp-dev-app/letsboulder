CREATE OR REPLACE FUNCTION public.save_submission_grade_votes(
  p_image_id uuid,
  p_grades jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_editor_id uuid := auth.uid();
  v_grade_item jsonb;
  v_route_line_id uuid;
  v_climb_id uuid;
  v_grade text;
  v_seen_route_line_ids uuid[] := ARRAY[]::uuid[];
  v_seen_climb_ids uuid[] := ARRAY[]::uuid[];
  v_votes_updated integer := 0;
BEGIN
  IF auth.role() <> 'authenticated' OR v_editor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required' USING ERRCODE = '22023';
  END IF;

  IF p_grades IS NULL OR jsonb_typeof(p_grades) <> 'array' OR jsonb_array_length(p_grades) = 0 THEN
    RAISE EXCEPTION 'At least one grade vote is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.images AS image
    WHERE image.id = p_image_id
  ) THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.user_can_wiki_edit_submission(p_image_id, v_editor_id) THEN
    RAISE EXCEPTION 'You do not have permission to update route grades for this submission'
      USING ERRCODE = '42501';
  END IF;

  FOR v_grade_item IN SELECT value FROM jsonb_array_elements(p_grades)
  LOOP
    IF jsonb_typeof(v_grade_item) <> 'object' THEN
      RAISE EXCEPTION 'Invalid grade vote payload' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_route_line_id := (v_grade_item->>'routeLineId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid route line ID' USING ERRCODE = '22023';
    END;

    IF v_route_line_id IS NULL THEN
      RAISE EXCEPTION 'Route line ID is required' USING ERRCODE = '22023';
    END IF;

    IF v_route_line_id = ANY(v_seen_route_line_ids) THEN
      RAISE EXCEPTION 'Duplicate route line ID' USING ERRCODE = '22023';
    END IF;

    v_grade := btrim(COALESCE(v_grade_item->>'grade', ''));
    IF v_grade <> ALL(ARRAY[
      '3A', '3A+', '3B', '3B+', '3C', '3C+',
      '4A', '4A+', '4B', '4B+', '4C', '4C+',
      '5A', '5A+', '5B', '5B+', '5C', '5C+',
      '6A', '6A+', '6B', '6B+', '6C', '6C+',
      '7A', '7A+', '7B', '7B+', '7C', '7C+',
      '8A', '8A+', '8B', '8B+', '8C', '8C+',
      '9A', '9A+', '9B', '9B+', '9C', '9C+'
    ]::text[]) THEN
      RAISE EXCEPTION 'Invalid grade' USING ERRCODE = '22023';
    END IF;

    SELECT route_line.climb_id
    INTO v_climb_id
    FROM public.route_lines AS route_line
    WHERE route_line.id = v_route_line_id
      AND route_line.image_id = p_image_id;

    IF v_climb_id IS NULL THEN
      RAISE EXCEPTION 'One or more routes are invalid for this submission'
        USING ERRCODE = '22023';
    END IF;

    IF v_climb_id = ANY(v_seen_climb_ids) THEN
      RAISE EXCEPTION 'Duplicate climb grade vote' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.grade_votes (climb_id, user_id, grade)
    VALUES (v_climb_id, v_editor_id, v_grade)
    ON CONFLICT (climb_id, user_id)
    DO UPDATE SET grade = EXCLUDED.grade, created_at = now();

    v_seen_route_line_ids := array_append(v_seen_route_line_ids, v_route_line_id);
    v_seen_climb_ids := array_append(v_seen_climb_ids, v_climb_id);
    v_votes_updated := v_votes_updated + 1;
  END LOOP;

  RETURN v_votes_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.save_submission_grade_votes(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_submission_grade_votes(uuid, jsonb)
  TO authenticated;

DROP POLICY IF EXISTS "Authenticated create grade vote" ON public.grade_votes;
CREATE POLICY "Authenticated create grade vote"
  ON public.grade_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated update own grade vote" ON public.grade_votes;
CREATE POLICY "Authenticated update own grade vote"
  ON public.grade_votes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated delete own grade vote" ON public.grade_votes;
CREATE POLICY "Authenticated delete own grade vote"
  ON public.grade_votes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
