CREATE OR REPLACE FUNCTION public.create_submission_routes_atomic(
  p_image_id UUID,
  p_crag_id UUID,
  p_route_type TEXT,
  p_routes JSONB
)
RETURNS TABLE (climb_id UUID, name TEXT, grade TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  route_item JSONB;
  route_name TEXT;
  route_grade TEXT;
  route_slug TEXT;
  route_description TEXT;
  route_points JSONB;
  route_sequence_order INTEGER;
  route_image_width INTEGER;
  route_image_height INTEGER;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_route_type IS NULL OR btrim(p_route_type) = '' THEN
    RAISE EXCEPTION 'Route type is required';
  END IF;

  IF p_routes IS NULL OR jsonb_typeof(p_routes) <> 'array' OR jsonb_array_length(p_routes) = 0 THEN
    RAISE EXCEPTION 'At least one route is required';
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
    RETURNING climbs.id, climbs.name, climbs.grade
    INTO climb_id, name, grade;

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
      p_image_id,
      climb_id,
      route_points,
      'red',
      route_sequence_order,
      route_image_width,
      route_image_height
    );

    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_submission_routes_atomic(UUID, UUID, TEXT, JSONB) TO service_role;
