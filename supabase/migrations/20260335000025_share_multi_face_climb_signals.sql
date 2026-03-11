ALTER TABLE public.climbs
  ADD COLUMN IF NOT EXISTS shared_climb_id UUID REFERENCES public.climbs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_climbs_shared_climb_id
  ON public.climbs(shared_climb_id);

UPDATE public.climbs
SET shared_climb_id = id
WHERE shared_climb_id IS NULL;

WITH published_draft_climbs AS (
  SELECT
    submission_drafts.id AS draft_id,
    (climb_id_text.value)::UUID AS climb_id
  FROM public.submission_drafts
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(submission_drafts.metadata->'publishedClimbIds', '[]'::JSONB)) AS climb_id_text(value)
), duplicate_groups AS (
  SELECT
    published_draft_climbs.draft_id,
    climbs.id AS climb_id,
    (MIN(climbs.id::TEXT) OVER (
      PARTITION BY published_draft_climbs.draft_id,
      lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g'))
    ))::UUID AS canonical_climb_id,
    COUNT(*) OVER (
      PARTITION BY published_draft_climbs.draft_id,
      lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g'))
    ) AS duplicate_count
  FROM published_draft_climbs
  JOIN public.climbs
    ON climbs.id = published_draft_climbs.climb_id
)
UPDATE public.climbs
SET shared_climb_id = duplicate_groups.canonical_climb_id
FROM duplicate_groups
WHERE duplicate_groups.climb_id = climbs.id
  AND duplicate_groups.duplicate_count > 1;

DELETE FROM public.grade_votes grade_votes_to_remove
USING public.climbs alias_climb,
      public.grade_votes canonical_grade_vote
WHERE grade_votes_to_remove.climb_id = alias_climb.id
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_grade_vote.climb_id = alias_climb.shared_climb_id
  AND canonical_grade_vote.user_id = grade_votes_to_remove.user_id;

UPDATE public.grade_votes
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE grade_votes.climb_id = climbs.id
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;

DELETE FROM public.user_climbs user_climbs_to_remove
USING public.climbs alias_climb,
      public.user_climbs canonical_user_climb
WHERE user_climbs_to_remove.climb_id = alias_climb.id
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_user_climb.climb_id = alias_climb.shared_climb_id
  AND canonical_user_climb.user_id = user_climbs_to_remove.user_id;

UPDATE public.user_climbs
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE user_climbs.climb_id = climbs.id
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;

CREATE OR REPLACE FUNCTION public.get_effective_climb_id(p_climb_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(climbs.shared_climb_id, climbs.id)
  FROM public.climbs
  WHERE climbs.id = p_climb_id;
$function$;

REVOKE ALL ON FUNCTION public.get_effective_climb_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_climb_id(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_effective_climb_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_climb_id(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_star_rating_summary(p_climb_id UUID)
RETURNS TABLE(avg_rating NUMERIC, rating_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH effective_climb AS (
    SELECT public.get_effective_climb_id(p_climb_id) AS climb_id
  )
  SELECT
    ROUND(AVG(user_climbs.star_rating)::numeric, 2) AS avg_rating,
    COUNT(user_climbs.star_rating)::int AS rating_count
  FROM effective_climb
  LEFT JOIN public.user_climbs
    ON user_climbs.climb_id = effective_climb.climb_id
   AND user_climbs.star_rating IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_star_rating_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_crag_route_intelligence(p_crag_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  slug TEXT,
  grade TEXT,
  route_type TEXT,
  directions TEXT[],
  has_topo BOOLEAN,
  topo_image_count INTEGER,
  rating_avg NUMERIC,
  rating_count INTEGER,
  weighted_rating NUMERIC,
  send_count INTEGER,
  recent_send_count_60d INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH base_climbs AS (
    SELECT DISTINCT
      climbs.id,
      climbs.name,
      climbs.slug,
      climbs.grade,
      climbs.route_type,
      COALESCE(climbs.shared_climb_id, climbs.id) AS effective_climb_id
    FROM public.climbs
    WHERE climbs.deleted_at IS NULL
      AND (
        climbs.crag_id = p_crag_id
        OR EXISTS (
          SELECT 1
          FROM public.route_lines
          JOIN public.images
            ON images.id = route_lines.image_id
          WHERE route_lines.climb_id = climbs.id
            AND images.crag_id = p_crag_id
        )
      )
  ),
  effective_climbs AS (
    SELECT DISTINCT base_climbs.effective_climb_id
    FROM base_climbs
  ),
  route_meta AS (
    SELECT
      base_climbs.id AS climb_id,
      COUNT(DISTINCT images.id)::int AS topo_image_count
    FROM base_climbs
    LEFT JOIN public.route_lines
      ON route_lines.climb_id = base_climbs.id
    LEFT JOIN public.images
      ON images.id = route_lines.image_id
      AND images.crag_id = p_crag_id
    GROUP BY base_climbs.id
  ),
  route_direction_values AS (
    SELECT
      route_lines.climb_id,
      images.face_direction AS direction
    FROM public.route_lines
    JOIN public.images
      ON images.id = route_lines.image_id
    JOIN base_climbs
      ON base_climbs.id = route_lines.climb_id
    WHERE images.crag_id = p_crag_id
      AND images.face_direction IS NOT NULL

    UNION ALL

    SELECT
      route_lines.climb_id,
      face_direction.direction
    FROM public.route_lines
    JOIN public.images
      ON images.id = route_lines.image_id
    JOIN base_climbs
      ON base_climbs.id = route_lines.climb_id
    CROSS JOIN LATERAL unnest(COALESCE(images.face_directions, ARRAY[]::TEXT[])) AS face_direction(direction)
    WHERE images.crag_id = p_crag_id
      AND face_direction.direction IS NOT NULL
      AND face_direction.direction <> ''
  ),
  route_directions AS (
    SELECT
      distinct_directions.climb_id,
      ARRAY_AGG(
        distinct_directions.direction
        ORDER BY
          CASE distinct_directions.direction
            WHEN 'N' THEN 1
            WHEN 'NE' THEN 2
            WHEN 'E' THEN 3
            WHEN 'SE' THEN 4
            WHEN 'S' THEN 5
            WHEN 'SW' THEN 6
            WHEN 'W' THEN 7
            WHEN 'NW' THEN 8
            ELSE 99
          END,
          distinct_directions.direction
      ) AS directions
    FROM (
      SELECT DISTINCT
        route_direction_values.climb_id,
        route_direction_values.direction
      FROM route_direction_values
      WHERE route_direction_values.direction IS NOT NULL
        AND route_direction_values.direction <> ''
    ) AS distinct_directions
    GROUP BY distinct_directions.climb_id
  ),
  rating_meta AS (
    SELECT
      effective_climbs.effective_climb_id,
      ROUND(AVG(user_climbs.star_rating)::numeric, 2) AS rating_avg,
      COUNT(user_climbs.star_rating)::int AS rating_count
    FROM effective_climbs
    LEFT JOIN public.user_climbs
      ON user_climbs.climb_id = effective_climbs.effective_climb_id
      AND user_climbs.star_rating IS NOT NULL
    GROUP BY effective_climbs.effective_climb_id
  ),
  crag_rating AS (
    SELECT
      AVG(user_climbs.star_rating)::numeric AS crag_avg_rating
    FROM effective_climbs
    JOIN public.user_climbs
      ON user_climbs.climb_id = effective_climbs.effective_climb_id
    WHERE user_climbs.star_rating IS NOT NULL
  ),
  send_meta AS (
    SELECT
      effective_climbs.effective_climb_id,
      COUNT(user_climbs.id) FILTER (
        WHERE user_climbs.style IN ('top', 'flash', 'onsight')
      )::int AS send_count,
      COUNT(user_climbs.id) FILTER (
        WHERE user_climbs.style IN ('top', 'flash', 'onsight')
          AND user_climbs.created_at >= NOW() - INTERVAL '60 days'
      )::int AS recent_send_count_60d
    FROM effective_climbs
    LEFT JOIN public.user_climbs
      ON user_climbs.climb_id = effective_climbs.effective_climb_id
    GROUP BY effective_climbs.effective_climb_id
  )
  SELECT
    base_climbs.id,
    COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route') AS name,
    base_climbs.slug,
    base_climbs.grade,
    base_climbs.route_type,
    COALESCE(route_directions.directions, ARRAY[]::TEXT[]) AS directions,
    COALESCE(route_meta.topo_image_count, 0) > 0 AS has_topo,
    COALESCE(route_meta.topo_image_count, 0) AS topo_image_count,
    rating_meta.rating_avg,
    COALESCE(rating_meta.rating_count, 0) AS rating_count,
    CASE
      WHEN COALESCE(rating_meta.rating_count, 0) = 0 THEN NULL
      ELSE ROUND(
        (
          (rating_meta.rating_count::numeric / (rating_meta.rating_count + 5)::numeric) * rating_meta.rating_avg
        ) + (
          (5::numeric / (rating_meta.rating_count + 5)::numeric) * COALESCE(crag_rating.crag_avg_rating, rating_meta.rating_avg)
        ),
        2
      )
    END AS weighted_rating,
    COALESCE(send_meta.send_count, 0) AS send_count,
    COALESCE(send_meta.recent_send_count_60d, 0) AS recent_send_count_60d
  FROM base_climbs
  LEFT JOIN route_meta
    ON route_meta.climb_id = base_climbs.id
  LEFT JOIN route_directions
    ON route_directions.climb_id = base_climbs.id
  LEFT JOIN rating_meta
    ON rating_meta.effective_climb_id = base_climbs.effective_climb_id
  CROSS JOIN crag_rating
  LEFT JOIN send_meta
    ON send_meta.effective_climb_id = base_climbs.effective_climb_id
  ORDER BY
    COALESCE(send_meta.send_count, 0) DESC,
    CASE
      WHEN COALESCE(rating_meta.rating_count, 0) = 0 THEN NULL
      ELSE ROUND(
        (
          (rating_meta.rating_count::numeric / (rating_meta.rating_count + 5)::numeric) * rating_meta.rating_avg
        ) + (
          (5::numeric / (rating_meta.rating_count + 5)::numeric) * COALESCE(crag_rating.crag_avg_rating, rating_meta.rating_avg)
        ),
        2
      )
    END DESC NULLS LAST,
    COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route') ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_crag_route_intelligence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crag_route_intelligence(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_crag_route_intelligence(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_route_intelligence(UUID) TO service_role;
