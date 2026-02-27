CREATE OR REPLACE FUNCTION public.get_image_faces_summary(
  p_image_id UUID
)
RETURNS TABLE (
  total_faces INTEGER,
  total_routes_combined INTEGER
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $function$
WITH target AS (
  SELECT id, crag_id
  FROM public.images
  WHERE id = p_image_id
),
related_faces AS (
  SELECT ci.id, ci.linked_image_id
  FROM public.crag_images ci
  JOIN target t
    ON ci.crag_id = t.crag_id
   AND (ci.source_image_id = t.id OR ci.linked_image_id = t.id)
),
all_image_ids AS (
  SELECT t.id AS image_id
  FROM target t
  UNION
  SELECT rf.linked_image_id
  FROM related_faces rf
  WHERE rf.linked_image_id IS NOT NULL
),
route_ids AS (
  SELECT DISTINCT rl.id
  FROM public.route_lines rl
  JOIN all_image_ids ai
    ON ai.image_id = rl.image_id
)
SELECT
  COALESCE((SELECT 1 + COUNT(*)::INTEGER FROM related_faces), 1) AS total_faces,
  COALESCE((SELECT COUNT(*)::INTEGER FROM route_ids), 0) AS total_routes_combined;
$function$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_image_faces_summary(UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_image_faces_summary(UUID) TO anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_image_faces_summary(UUID) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_image_faces_summary(UUID) TO service_role';
END $$;
