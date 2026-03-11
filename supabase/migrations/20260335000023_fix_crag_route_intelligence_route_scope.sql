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
      climbs.route_type
    FROM public.climbs
    WHERE climbs.status IN ('active', 'approved')
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
      base_climbs.id AS climb_id,
      ROUND(AVG(user_climbs.star_rating)::numeric, 2) AS rating_avg,
      COUNT(user_climbs.star_rating)::int AS rating_count
    FROM base_climbs
    LEFT JOIN public.user_climbs
      ON user_climbs.climb_id = base_climbs.id
      AND user_climbs.star_rating IS NOT NULL
    GROUP BY base_climbs.id
  ),
  crag_rating AS (
    SELECT
      AVG(user_climbs.star_rating)::numeric AS crag_avg_rating
    FROM base_climbs
    JOIN public.user_climbs
      ON user_climbs.climb_id = base_climbs.id
    WHERE user_climbs.star_rating IS NOT NULL
  ),
  send_meta AS (
    SELECT
      base_climbs.id AS climb_id,
      COUNT(user_climbs.id) FILTER (
        WHERE user_climbs.style IN ('top', 'flash', 'onsight')
      )::int AS send_count,
      COUNT(user_climbs.id) FILTER (
        WHERE user_climbs.style IN ('top', 'flash', 'onsight')
          AND user_climbs.created_at >= NOW() - INTERVAL '60 days'
      )::int AS recent_send_count_60d
    FROM base_climbs
    LEFT JOIN public.user_climbs
      ON user_climbs.climb_id = base_climbs.id
    GROUP BY base_climbs.id
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
    ON rating_meta.climb_id = base_climbs.id
  CROSS JOIN crag_rating
  LEFT JOIN send_meta
    ON send_meta.climb_id = base_climbs.id
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
