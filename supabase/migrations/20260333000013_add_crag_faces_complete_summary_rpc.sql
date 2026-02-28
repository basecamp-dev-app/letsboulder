CREATE OR REPLACE FUNCTION public.get_crag_faces_complete_summary(
  p_image_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
WITH target AS (
  SELECT
    i.id,
    i.crag_id,
    i.url,
    i.width,
    i.height,
    i.natural_width,
    i.natural_height,
    i.face_directions
  FROM public.images i
  WHERE i.id = p_image_id
),
related_faces_raw AS (
  SELECT
    ci.id AS crag_image_id,
    ci.url,
    ci.linked_image_id,
    ci.width,
    ci.height,
    ci.face_directions,
    ci.created_at
  FROM public.crag_images ci
  JOIN target t
    ON t.crag_id IS NOT NULL
   AND ci.crag_id = t.crag_id
   AND (
     ci.source_image_id = t.id
     OR (ci.source_image_id IS NULL AND ci.linked_image_id = t.id)
   )
),
related_faces AS (
  SELECT DISTINCT ON (COALESCE(rfr.linked_image_id::text, 'url:' || rfr.url))
    rfr.crag_image_id,
    rfr.url,
    rfr.linked_image_id,
    rfr.width,
    rfr.height,
    rfr.face_directions,
    rfr.created_at
  FROM related_faces_raw rfr
  ORDER BY COALESCE(rfr.linked_image_id::text, 'url:' || rfr.url), rfr.created_at ASC
),
all_image_ids AS (
  SELECT t.id AS image_id
  FROM target t
  UNION
  SELECT rf.linked_image_id
  FROM related_faces rf
  WHERE rf.linked_image_id IS NOT NULL
),
routes_by_image AS (
  SELECT
    rl.image_id,
    jsonb_agg(
      jsonb_build_object(
        'id', rl.id,
        'climb_id', rl.climb_id,
        'name', c.name,
        'grade', c.grade,
        'route_type', c.route_type,
        'description', c.description,
        'color', rl.color,
        'points', rl.points,
        'image_width', rl.image_width,
        'image_height', rl.image_height,
        'sequence_order', rl.sequence_order
      )
      ORDER BY rl.sequence_order ASC, rl.created_at ASC
    ) AS routes,
    COUNT(*)::INTEGER AS route_count
  FROM public.route_lines rl
  JOIN public.climbs c
    ON c.id = rl.climb_id
  JOIN all_image_ids ai
    ON ai.image_id = rl.image_id
  GROUP BY rl.image_id
),
primary_face AS (
  SELECT jsonb_build_object(
    'image_id', t.id,
    'index', 0,
    'is_primary', true,
    'url', t.url,
    'linked_image_id', t.id,
    'crag_image_id', NULL,
    'face_directions', t.face_directions,
    'metadata', jsonb_build_object(
      'width', COALESCE(t.natural_width, t.width),
      'height', COALESCE(t.natural_height, t.height)
    ),
    'routes', COALESCE(rbi.routes, '[]'::jsonb),
    'has_routes', COALESCE(rbi.route_count, 0) > 0
  ) AS face_json
  FROM target t
  LEFT JOIN routes_by_image rbi
    ON rbi.image_id = t.id
),
supplementary_faces AS (
  SELECT jsonb_build_object(
    'image_id', rf.linked_image_id,
    'index', ROW_NUMBER() OVER (ORDER BY rf.created_at ASC),
    'is_primary', false,
    'url', rf.url,
    'linked_image_id', CASE WHEN rf.linked_image_id = p_image_id THEN NULL ELSE rf.linked_image_id END,
    'crag_image_id', rf.crag_image_id,
    'face_directions', rf.face_directions,
    'metadata', jsonb_build_object(
      'width', COALESCE(li.natural_width, li.width, rf.width),
      'height', COALESCE(li.natural_height, li.height, rf.height)
    ),
    'routes', COALESCE(rbi.routes, '[]'::jsonb),
    'has_routes', COALESCE(rbi.route_count, 0) > 0
  ) AS face_json
  FROM related_faces rf
  LEFT JOIN public.images li
    ON li.id = rf.linked_image_id
  LEFT JOIN routes_by_image rbi
    ON rbi.image_id = rf.linked_image_id
),
faces_agg AS (
  SELECT COALESCE(jsonb_agg(face_json ORDER BY (face_json->>'index')::INTEGER ASC), '[]'::jsonb) AS faces
  FROM (
    SELECT face_json FROM primary_face
    UNION ALL
    SELECT face_json FROM supplementary_faces
  ) faces
),
summary AS (
  SELECT
    COALESCE((SELECT jsonb_array_length(faces) FROM faces_agg), 0) AS total_faces,
    COALESCE((SELECT SUM(route_count)::INTEGER FROM routes_by_image), 0) AS total_routes
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM target) THEN NULL
  ELSE jsonb_build_object(
    'crag_id', (SELECT crag_id FROM target),
    'primary_image_id', (SELECT id FROM target),
    'faces', (SELECT faces FROM faces_agg),
    'summary', jsonb_build_object(
      'total_faces', (SELECT total_faces FROM summary),
      'total_routes', (SELECT total_routes FROM summary)
    )
  )
END;
$function$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_crag_faces_complete_summary(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_crag_faces_complete_summary(UUID) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_crag_faces_complete_summary(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_crag_faces_complete_summary(UUID) TO service_role';
END $$;
