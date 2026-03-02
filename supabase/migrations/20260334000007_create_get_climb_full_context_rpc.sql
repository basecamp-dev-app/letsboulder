CREATE OR REPLACE FUNCTION public.get_climb_full_context(
  p_climb_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
WITH climb_target AS (
  SELECT
    c.id,
    c.name,
    c.grade,
    c.route_type,
    c.description
  FROM public.climbs c
  WHERE c.id = p_climb_id
),
primary_image AS (
  SELECT
    i.id,
    i.url,
    i.crag_id,
    i.width,
    i.height,
    i.natural_width,
    i.natural_height,
    i.created_by,
    i.contribution_credit_platform,
    i.contribution_credit_handle
  FROM public.route_lines rl
  JOIN public.images i
    ON i.id = rl.image_id
  WHERE rl.climb_id = p_climb_id
  ORDER BY rl.sequence_order ASC NULLS LAST, rl.created_at ASC
  LIMIT 1
),
primary_routes AS (
  SELECT
    rl.id,
    rl.points,
    rl.color,
    rl.image_width,
    rl.image_height,
    rl.climb_id,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'grade', c.grade,
      'route_type', c.route_type,
      'description', c.description
    ) AS climb
  FROM public.route_lines rl
  JOIN primary_image pi
    ON pi.id = rl.image_id
  JOIN public.climbs c
    ON c.id = rl.climb_id
  ORDER BY rl.sequence_order ASC NULLS LAST, rl.created_at ASC
),
related_faces AS (
  SELECT DISTINCT ON (COALESCE(ci.linked_image_id::TEXT, 'url:' || ci.url))
    ci.id AS crag_image_id,
    ci.url,
    ci.linked_image_id,
    ci.width,
    ci.height,
    ci.created_at
  FROM public.crag_images ci
  JOIN primary_image pi
    ON pi.crag_id IS NOT NULL
   AND pi.crag_id = ci.crag_id
   AND (
     ci.source_image_id = pi.id
     OR (ci.source_image_id IS NULL AND ci.linked_image_id = pi.id)
   )
  ORDER BY COALESCE(ci.linked_image_id::TEXT, 'url:' || ci.url), ci.created_at ASC
),
all_face_image_ids AS (
  SELECT pi.id AS image_id
  FROM primary_image pi
  UNION
  SELECT rf.linked_image_id
  FROM related_faces rf
  WHERE rf.linked_image_id IS NOT NULL
),
route_counts AS (
  SELECT
    rl.image_id,
    COUNT(*)::INTEGER AS route_count
  FROM public.route_lines rl
  JOIN all_face_image_ids afi
    ON afi.image_id = rl.image_id
  GROUP BY rl.image_id
),
faces_agg AS (
  SELECT COALESCE(
    jsonb_agg(face_json ORDER BY face_index ASC),
    '[]'::JSONB
  ) AS faces
  FROM (
    SELECT
      0 AS face_index,
      jsonb_build_object(
        'id', 'image:' || pi.id,
        'index', 0,
        'image_id', pi.id,
        'is_primary', TRUE,
        'url', pi.url,
        'linked_image_id', pi.id,
        'crag_image_id', NULL,
        'face_directions', NULL,
        'metadata', jsonb_build_object(
          'width', COALESCE(pi.natural_width, pi.width),
          'height', COALESCE(pi.natural_height, pi.height)
        ),
        'has_routes', COALESCE(rc.route_count, 0) > 0
      ) AS face_json
    FROM primary_image pi
    LEFT JOIN route_counts rc
      ON rc.image_id = pi.id

    UNION ALL

    SELECT
      ROW_NUMBER() OVER (ORDER BY rf.created_at ASC) AS face_index,
      jsonb_build_object(
        'id', 'crag-image:' || rf.crag_image_id,
        'index', ROW_NUMBER() OVER (ORDER BY rf.created_at ASC),
        'image_id', rf.linked_image_id,
        'is_primary', FALSE,
        'url', rf.url,
        'linked_image_id', CASE WHEN rf.linked_image_id = pi.id THEN NULL ELSE rf.linked_image_id END,
        'crag_image_id', rf.crag_image_id,
        'face_directions', NULL,
        'metadata', jsonb_build_object(
          'width', COALESCE(li.natural_width, li.width, rf.width),
          'height', COALESCE(li.natural_height, li.height, rf.height)
        ),
        'has_routes', COALESCE(rc.route_count, 0) > 0
      ) AS face_json
    FROM related_faces rf
    CROSS JOIN primary_image pi
    LEFT JOIN public.images li
      ON li.id = rf.linked_image_id
    LEFT JOIN route_counts rc
      ON rc.image_id = rf.linked_image_id
  ) faces_union
),
summary AS (
  SELECT
    COALESCE((SELECT jsonb_array_length(fa.faces) FROM faces_agg fa), 0) AS total_faces,
    COALESCE((SELECT SUM(rc.route_count)::INTEGER FROM route_counts rc), 0) AS total_routes
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM climb_target) THEN NULL
  ELSE jsonb_build_object(
    'climb', (SELECT to_jsonb(ct) FROM climb_target ct),
    'primary_image', COALESCE((SELECT to_jsonb(pi) FROM primary_image pi), 'null'::JSONB),
    'primary_route_lines', COALESCE((SELECT jsonb_agg(to_jsonb(pr)) FROM primary_routes pr), '[]'::JSONB),
    'faces', COALESCE((SELECT fa.faces FROM faces_agg fa), '[]'::JSONB),
    'summary', jsonb_build_object(
      'total_faces', (SELECT s.total_faces FROM summary s),
      'total_routes', (SELECT s.total_routes FROM summary s)
    )
  )
END;
$function$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_climb_full_context(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_climb_full_context(UUID) TO service_role';
END $$;
