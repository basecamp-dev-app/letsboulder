ALTER TABLE public.crag_images
  ADD COLUMN legacy_published_at timestamptz;

DROP POLICY IF EXISTS "Public read crag_images" ON public.crag_images;
CREATE POLICY "Public read published crag_images" ON public.crag_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.crags AS crag
      WHERE crag.id = crag_images.crag_id
        AND crag.deleted_at IS NULL
    )
    AND (
      (crag_images.linked_image_id IS NULL AND crag_images.legacy_published_at IS NOT NULL)
      OR EXISTS (
        SELECT 1
      FROM public.images AS image
      JOIN public.crags AS image_crag ON image_crag.id = image.crag_id
      WHERE image.id = crag_images.linked_image_id
        AND image_crag.deleted_at IS NULL
          AND image.status = 'approved'
          AND image.processing_status = 'ready'
          AND image.moderation_status IN ('approved', 'skipped')
          AND image.visibility = 'public'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.mark_legacy_crag_image_published(p_crag_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.crag_images AS crag_image
  SET legacy_published_at = COALESCE(crag_image.legacy_published_at, now())
  WHERE crag_image.id = p_crag_image_id
    AND crag_image.linked_image_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.crags AS crag
      WHERE crag.id = crag_image.crag_id
        AND crag.deleted_at IS NULL
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible unlinked legacy crag image not found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_legacy_crag_image_published(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_legacy_crag_image_published(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_crag_faces_complete_summary(p_image_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
WITH target AS (
  SELECT i.id, i.crag_id, i.url, i.width, i.height, i.natural_width, i.natural_height, i.face_directions
  FROM public.images AS i
  JOIN public.crags AS crag ON crag.id = i.crag_id AND crag.deleted_at IS NULL
  WHERE i.id = p_image_id
    AND i.status = 'approved'
    AND i.processing_status = 'ready'
    AND i.moderation_status IN ('approved', 'skipped')
    AND i.visibility = 'public'
),
related_faces_raw AS (
  SELECT ci.id AS crag_image_id, ci.url, ci.linked_image_id, ci.width, ci.height, ci.face_directions, ci.created_at
  FROM public.crag_images AS ci
  JOIN target AS t ON ci.crag_id = t.crag_id
    AND (ci.source_image_id = t.id OR (ci.source_image_id IS NULL AND ci.linked_image_id = t.id))
  JOIN public.crags AS crag ON crag.id = ci.crag_id AND crag.deleted_at IS NULL
   LEFT JOIN public.images AS linked_image ON linked_image.id = ci.linked_image_id
   LEFT JOIN public.crags AS linked_crag ON linked_crag.id = linked_image.crag_id
  WHERE (ci.linked_image_id IS NULL AND ci.legacy_published_at IS NOT NULL)
    OR (
       linked_image.status = 'approved'
       AND linked_crag.deleted_at IS NULL
      AND linked_image.processing_status = 'ready'
      AND linked_image.moderation_status IN ('approved', 'skipped')
      AND linked_image.visibility = 'public'
    )
),
related_faces AS (
  SELECT DISTINCT ON (COALESCE(rfr.linked_image_id::text, 'url:' || rfr.url))
    rfr.crag_image_id, rfr.url, rfr.linked_image_id, rfr.width, rfr.height, rfr.face_directions, rfr.created_at
  FROM related_faces_raw AS rfr
  ORDER BY COALESCE(rfr.linked_image_id::text, 'url:' || rfr.url), rfr.created_at ASC
),
all_image_ids AS (
  SELECT t.id AS image_id FROM target AS t
  UNION
  SELECT rf.linked_image_id FROM related_faces AS rf WHERE rf.linked_image_id IS NOT NULL
),
routes_by_image AS (
  SELECT rl.image_id,
    jsonb_agg(jsonb_build_object(
      'id', rl.id, 'climb_id', climb.id, 'name', climb.name, 'grade', climb.grade,
      'route_type', climb.route_type, 'description', climb.description, 'color', rl.color,
      'points', rl.points, 'image_width', rl.image_width, 'image_height', rl.image_height,
      'sequence_order', rl.sequence_order
    ) ORDER BY rl.sequence_order ASC, rl.created_at ASC) AS routes,
    count(*)::integer AS route_count
  FROM public.route_lines AS rl
  JOIN public.climbs AS climb ON climb.id = rl.climb_id AND climb.deleted_at IS NULL
  JOIN public.crags AS crag ON crag.id = climb.crag_id AND crag.deleted_at IS NULL
  JOIN all_image_ids AS ai ON ai.image_id = rl.image_id
  GROUP BY rl.image_id
),
primary_face AS (
  SELECT jsonb_build_object(
    'image_id', t.id, 'index', 0, 'is_primary', true, 'url', t.url, 'linked_image_id', t.id,
    'crag_image_id', NULL, 'face_directions', t.face_directions,
    'metadata', jsonb_build_object('width', COALESCE(t.natural_width, t.width), 'height', COALESCE(t.natural_height, t.height)),
    'routes', COALESCE(rbi.routes, '[]'::jsonb), 'has_routes', COALESCE(rbi.route_count, 0) > 0
  ) AS face_json
  FROM target AS t LEFT JOIN routes_by_image AS rbi ON rbi.image_id = t.id
),
supplementary_faces AS (
  SELECT jsonb_build_object(
    'image_id', rf.linked_image_id, 'index', row_number() OVER (ORDER BY rf.created_at ASC), 'is_primary', false,
    'url', COALESCE(li.url, rf.url), 'linked_image_id', CASE WHEN rf.linked_image_id = p_image_id THEN NULL ELSE rf.linked_image_id END,
    'crag_image_id', rf.crag_image_id, 'face_directions', rf.face_directions,
    'metadata', jsonb_build_object('width', COALESCE(li.natural_width, li.width, rf.width), 'height', COALESCE(li.natural_height, li.height, rf.height)),
    'routes', COALESCE(rbi.routes, '[]'::jsonb), 'has_routes', COALESCE(rbi.route_count, 0) > 0
  ) AS face_json
  FROM related_faces AS rf
  LEFT JOIN public.images AS li ON li.id = rf.linked_image_id
  LEFT JOIN routes_by_image AS rbi ON rbi.image_id = rf.linked_image_id
),
faces_agg AS (
  SELECT COALESCE(jsonb_agg(face_json ORDER BY (face_json->>'index')::integer ASC), '[]'::jsonb) AS faces
  FROM (SELECT face_json FROM primary_face UNION ALL SELECT face_json FROM supplementary_faces) AS faces
),
summary AS (
  SELECT COALESCE((SELECT jsonb_array_length(faces) FROM faces_agg), 0) AS total_faces,
    COALESCE((SELECT sum(route_count)::integer FROM routes_by_image), 0) AS total_routes
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM target) THEN NULL ELSE jsonb_build_object(
  'crag_id', (SELECT crag_id FROM target), 'primary_image_id', (SELECT id FROM target),
  'faces', (SELECT faces FROM faces_agg),
  'summary', jsonb_build_object('total_faces', (SELECT total_faces FROM summary), 'total_routes', (SELECT total_routes FROM summary))
) END;
$function$;

REVOKE ALL ON FUNCTION public.get_crag_faces_complete_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crag_faces_complete_summary(uuid) TO anon, authenticated, service_role;
