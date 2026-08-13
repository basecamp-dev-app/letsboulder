-- Public route targets may only be derived from publicly deliverable media.
DROP FUNCTION IF EXISTS public.get_crag_route_targets_page(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_crag_route_targets_page(
  p_crag_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  effective_climb_id uuid,
  climb_slug text,
  preview_image_id uuid,
  navigation_route_id uuid,
  navigation_image_id uuid,
  route_image_ids uuid[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH base_climbs AS (
    SELECT DISTINCT
      climb.id,
      climb.name,
      climb.slug,
      COALESCE(climb.shared_climb_id, climb.id) AS effective_climb_id
    FROM public.climbs AS climb
    WHERE climb.deleted_at IS NULL
      AND (
        climb.crag_id = p_crag_id
        OR EXISTS (
          SELECT 1
          FROM public.route_lines AS route_line
          JOIN public.images AS image ON image.id = route_line.image_id
          WHERE route_line.climb_id = climb.id
            AND image.crag_id = p_crag_id
            AND image.status = 'approved'
            AND image.processing_status = 'ready'
            AND image.moderation_status IN ('approved', 'skipped')
            AND image.visibility = 'public'
        )
      )
  ),
  effective_climbs AS (
    SELECT DISTINCT effective_climb_id FROM base_climbs
  ),
  canonical_climb_meta AS (
    SELECT DISTINCT ON (base_climbs.effective_climb_id)
      base_climbs.effective_climb_id,
      base_climbs.slug,
      COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route') AS normalized_name
    FROM base_climbs
    ORDER BY base_climbs.effective_climb_id,
      CASE WHEN base_climbs.id = base_climbs.effective_climb_id THEN 0 ELSE 1 END,
      COALESCE(NULLIF(BTRIM(base_climbs.name), ''), 'Unnamed route'), base_climbs.id
  ),
  rating_meta AS (
    SELECT effective_climbs.effective_climb_id,
      ROUND(AVG(user_climb.star_rating)::numeric, 2) AS rating_avg,
      COUNT(user_climb.star_rating)::int AS rating_count
    FROM effective_climbs
    LEFT JOIN public.user_climbs AS user_climb
      ON user_climb.climb_id = effective_climbs.effective_climb_id
      AND user_climb.star_rating IS NOT NULL
    GROUP BY effective_climbs.effective_climb_id
  ),
  crag_rating AS (
    SELECT AVG(user_climb.star_rating)::numeric AS crag_avg_rating
    FROM effective_climbs
    JOIN public.user_climbs AS user_climb ON user_climb.climb_id = effective_climbs.effective_climb_id
    WHERE user_climb.star_rating IS NOT NULL
  ),
  send_meta AS (
    SELECT effective_climbs.effective_climb_id,
      COUNT(user_climb.id) FILTER (WHERE user_climb.style IN ('top', 'flash', 'onsight'))::int AS send_count
    FROM effective_climbs
    LEFT JOIN public.user_climbs AS user_climb ON user_climb.climb_id = effective_climbs.effective_climb_id
    GROUP BY effective_climbs.effective_climb_id
  ),
  paged_effective_climbs AS (
    SELECT ranked_rows.page_rank, ranked_rows.effective_climb_id, ranked_rows.slug
    FROM (
      SELECT ROW_NUMBER() OVER (
        ORDER BY COALESCE(send_meta.send_count, 0) DESC,
          CASE WHEN COALESCE(rating_meta.rating_count, 0) = 0 THEN NULL ELSE ROUND(
            (rating_meta.rating_count::numeric / (rating_meta.rating_count + 5)::numeric) * rating_meta.rating_avg
            + (5::numeric / (rating_meta.rating_count + 5)::numeric) * COALESCE(crag_rating.crag_avg_rating, rating_meta.rating_avg), 2
          ) END DESC NULLS LAST,
          canonical_climb_meta.normalized_name
      ) AS page_rank,
        canonical_climb_meta.effective_climb_id, canonical_climb_meta.slug
      FROM canonical_climb_meta
      LEFT JOIN rating_meta ON rating_meta.effective_climb_id = canonical_climb_meta.effective_climb_id
      CROSS JOIN crag_rating
      LEFT JOIN send_meta ON send_meta.effective_climb_id = canonical_climb_meta.effective_climb_id
    ) AS ranked_rows
    ORDER BY ranked_rows.page_rank
    LIMIT GREATEST(COALESCE(p_limit, 50), 0)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ),
  page_route_lines AS (
    SELECT base_climbs.effective_climb_id, route_line.id AS route_id, route_line.image_id,
      route_line.sequence_order, route_line.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY base_climbs.effective_climb_id
        ORDER BY route_line.sequence_order ASC NULLS LAST, route_line.created_at, route_line.id
      ) AS route_rank
    FROM base_climbs
    JOIN paged_effective_climbs ON paged_effective_climbs.effective_climb_id = base_climbs.effective_climb_id
    JOIN public.route_lines AS route_line ON route_line.climb_id = base_climbs.id
    JOIN public.images AS image ON image.id = route_line.image_id
    WHERE image.crag_id = p_crag_id
      AND image.status = 'approved'
      AND image.processing_status = 'ready'
      AND image.moderation_status IN ('approved', 'skipped')
      AND image.visibility = 'public'
  ),
  route_image_meta AS (
    SELECT ordered_images.effective_climb_id, ARRAY_AGG(ordered_images.image_id ORDER BY ordered_images.route_rank) AS route_image_ids
    FROM (
      SELECT DISTINCT ON (effective_climb_id, image_id)
        effective_climb_id, image_id, route_rank
      FROM page_route_lines
      ORDER BY effective_climb_id, image_id, route_rank
    ) AS ordered_images
    GROUP BY ordered_images.effective_climb_id
  )
  SELECT paged_effective_climbs.effective_climb_id, paged_effective_climbs.slug,
    primary_route_line.image_id, primary_route_line.route_id, primary_route_line.image_id,
    COALESCE(route_image_meta.route_image_ids, ARRAY[]::uuid[])
  FROM paged_effective_climbs
  LEFT JOIN page_route_lines AS primary_route_line
    ON primary_route_line.effective_climb_id = paged_effective_climbs.effective_climb_id
    AND primary_route_line.route_rank = 1
  LEFT JOIN route_image_meta ON route_image_meta.effective_climb_id = paged_effective_climbs.effective_climb_id
  ORDER BY paged_effective_climbs.page_rank;
$function$;

REVOKE ALL ON FUNCTION public.get_crag_route_targets_page(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_route_targets_page(uuid, integer, integer)
  TO anon, authenticated, service_role;
