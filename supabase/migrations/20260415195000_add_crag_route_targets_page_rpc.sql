CREATE OR REPLACE FUNCTION public.get_crag_route_targets_page(
  p_crag_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  effective_climb_id UUID,
  climb_slug TEXT,
  preview_image_id UUID,
  preview_image_url TEXT,
  navigation_route_id UUID,
  navigation_image_id UUID,
  navigation_image_url TEXT,
  route_image_ids UUID[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
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
  canonical_climb_meta AS (
    SELECT DISTINCT ON (base_climbs.effective_climb_id)
      base_climbs.effective_climb_id,
      base_climbs.id AS selected_climb_id,
      COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route') AS normalized_name,
      base_climbs.slug
    FROM base_climbs
    ORDER BY
      base_climbs.effective_climb_id,
      CASE WHEN base_climbs.id = base_climbs.effective_climb_id THEN 0 ELSE 1 END,
      COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route') ASC,
      base_climbs.id ASC
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
      )::int AS send_count
    FROM effective_climbs
    LEFT JOIN public.user_climbs
      ON user_climbs.climb_id = effective_climbs.effective_climb_id
    GROUP BY effective_climbs.effective_climb_id
  ),
  ranked_effective_climbs AS (
    SELECT
      canonical_climb_meta.effective_climb_id,
      canonical_climb_meta.slug,
      canonical_climb_meta.normalized_name,
      COALESCE(send_meta.send_count, 0) AS send_count,
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
      END AS weighted_rating
    FROM canonical_climb_meta
    LEFT JOIN rating_meta
      ON rating_meta.effective_climb_id = canonical_climb_meta.effective_climb_id
    CROSS JOIN crag_rating
    LEFT JOIN send_meta
      ON send_meta.effective_climb_id = canonical_climb_meta.effective_climb_id
  ),
  paged_effective_climbs AS (
    SELECT
      ranked_rows.page_rank,
      ranked_rows.effective_climb_id,
      ranked_rows.slug,
      ranked_rows.normalized_name
    FROM (
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            ranked_effective_climbs.send_count DESC,
            ranked_effective_climbs.weighted_rating DESC NULLS LAST,
            ranked_effective_climbs.normalized_name ASC
        ) AS page_rank,
        ranked_effective_climbs.effective_climb_id,
        ranked_effective_climbs.slug,
        ranked_effective_climbs.normalized_name
      FROM ranked_effective_climbs
    ) AS ranked_rows
    ORDER BY ranked_rows.page_rank ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 0)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ),
  page_climb_ids AS (
    SELECT
      base_climbs.id AS climb_id,
      base_climbs.effective_climb_id
    FROM base_climbs
    JOIN paged_effective_climbs
      ON paged_effective_climbs.effective_climb_id = base_climbs.effective_climb_id
  ),
  page_route_lines AS (
    SELECT
      page_climb_ids.effective_climb_id,
      route_lines.id AS route_id,
      route_lines.image_id,
      route_lines.sequence_order,
      route_lines.created_at,
      images.url,
      ROW_NUMBER() OVER (
        PARTITION BY page_climb_ids.effective_climb_id
        ORDER BY route_lines.sequence_order ASC NULLS LAST, route_lines.created_at ASC, route_lines.id ASC
      ) AS route_rank
    FROM page_climb_ids
    JOIN public.route_lines
      ON route_lines.climb_id = page_climb_ids.climb_id
    JOIN public.images
      ON images.id = route_lines.image_id
    WHERE images.crag_id = p_crag_id
  ),
  primary_route_lines AS (
    SELECT
      page_route_lines.effective_climb_id,
      page_route_lines.route_id,
      page_route_lines.image_id,
      page_route_lines.url
    FROM page_route_lines
    WHERE page_route_lines.route_rank = 1
  ),
  route_image_meta AS (
    SELECT
      page_route_lines.effective_climb_id,
      ARRAY_AGG(DISTINCT page_route_lines.image_id) AS route_image_ids
    FROM page_route_lines
    GROUP BY page_route_lines.effective_climb_id
  )
  SELECT
    paged_effective_climbs.effective_climb_id,
    paged_effective_climbs.slug AS climb_slug,
    primary_route_lines.image_id AS preview_image_id,
    primary_route_lines.url AS preview_image_url,
    primary_route_lines.route_id AS navigation_route_id,
    primary_route_lines.image_id AS navigation_image_id,
    primary_route_lines.url AS navigation_image_url,
    COALESCE(route_image_meta.route_image_ids, ARRAY[]::UUID[]) AS route_image_ids
  FROM paged_effective_climbs
  LEFT JOIN primary_route_lines
    ON primary_route_lines.effective_climb_id = paged_effective_climbs.effective_climb_id
  LEFT JOIN route_image_meta
    ON route_image_meta.effective_climb_id = paged_effective_climbs.effective_climb_id
  ORDER BY
    paged_effective_climbs.page_rank ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_crag_route_targets_page(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crag_route_targets_page(UUID, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_crag_route_targets_page(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_route_targets_page(UUID, INTEGER, INTEGER) TO service_role;
