CREATE OR REPLACE FUNCTION public.rankings_grade_from_points(p_points integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT grade
  FROM (
    VALUES
      ('1A', 100), ('1A+', 116), ('1B', 132), ('1B+', 148), ('1C', 164), ('1C+', 180),
      ('2A', 196), ('2A+', 212), ('2B', 228), ('2B+', 244), ('2C', 260), ('2C+', 276),
      ('3A', 292), ('3A+', 308), ('3B', 324), ('3B+', 340), ('3C', 356), ('3C+', 372),
      ('4A', 388), ('4A+', 404), ('4B', 420), ('4B+', 436), ('4C', 452), ('4C+', 468),
      ('5A', 484), ('5A+', 500), ('5B', 516), ('5B+', 532), ('5C', 548), ('5C+', 564),
      ('6A', 580), ('6A+', 596), ('6B', 612), ('6B+', 628), ('6C', 644), ('6C+', 660),
      ('7A', 676), ('7A+', 692), ('7B', 708), ('7B+', 724), ('7C', 740), ('7C+', 756),
      ('8A', 772), ('8A+', 788), ('8B', 804), ('8B+', 820), ('8C', 836), ('8C+', 852),
      ('9A', 868), ('9A+', 884), ('9B', 900), ('9B+', 916), ('9C', 932), ('9C+', 948)
  ) AS grade_points(grade, points)
  ORDER BY ABS(points - p_points), points
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_rankings_leaderboard(
  p_gender text DEFAULT NULL,
  p_region_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'grade',
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_window_start timestamptz DEFAULT NULL
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  avg_grade text,
  climb_count bigint,
  total_users bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH filtered_climbs AS (
    SELECT
      uc.user_id,
      uc.style,
      uc.created_at,
      c.id AS climb_id,
      c.grade,
      p.username,
      p.first_name,
      p.last_name,
      p.display_name,
      p.avatar_url
    FROM public.user_climbs uc
    INNER JOIN public.climbs c ON c.id = uc.climb_id
    INNER JOIN public.profiles p ON p.id = uc.user_id
    WHERE uc.style IN ('top', 'flash')
      AND (p_window_start IS NULL OR uc.created_at >= p_window_start)
      AND p.is_public = true
      AND (p_gender IS NULL OR p.gender = p_gender)
      AND (
        p_region_id IS NULL OR EXISTS (
          SELECT 1
          FROM public.route_lines rl
          INNER JOIN public.images i ON i.id = rl.image_id
          INNER JOIN public.crags cr ON cr.id = i.crag_id
          WHERE rl.climb_id = c.id
            AND cr.region_id = p_region_id
        )
      )
  ),
  scored_users AS (
    SELECT
      fc.user_id,
      COALESCE(
        NULLIF(BTRIM(CONCAT(COALESCE(fc.first_name, ''), ' ', COALESCE(fc.last_name, ''))), ''),
        NULLIF(fc.display_name, ''),
        NULLIF(fc.username, ''),
        CONCAT('Climber ', LEFT(fc.user_id::text, 4))
      ) AS username,
      MAX(fc.avatar_url) AS avatar_url,
      COUNT(*)::bigint AS climb_count,
      ROUND(
        AVG(
          CASE
            WHEN fc.grade IS NULL THEN NULL
            ELSE (
              CASE UPPER(BTRIM(fc.grade))
                WHEN '1A' THEN 100 WHEN '1A+' THEN 116 WHEN '1B' THEN 132 WHEN '1B+' THEN 148
                WHEN '1C' THEN 164 WHEN '1C+' THEN 180 WHEN '2A' THEN 196 WHEN '2A+' THEN 212
                WHEN '2B' THEN 228 WHEN '2B+' THEN 244 WHEN '2C' THEN 260 WHEN '2C+' THEN 276
                WHEN '3A' THEN 292 WHEN '3A+' THEN 308 WHEN '3B' THEN 324 WHEN '3B+' THEN 340
                WHEN '3C' THEN 356 WHEN '3C+' THEN 372 WHEN '4A' THEN 388 WHEN '4A+' THEN 404
                WHEN '4B' THEN 420 WHEN '4B+' THEN 436 WHEN '4C' THEN 452 WHEN '4C+' THEN 468
                WHEN '5A' THEN 484 WHEN '5A+' THEN 500 WHEN '5B' THEN 516 WHEN '5B+' THEN 532
                WHEN '5C' THEN 548 WHEN '5C+' THEN 564 WHEN '6A' THEN 580 WHEN '6A+' THEN 596
                WHEN '6B' THEN 612 WHEN '6B+' THEN 628 WHEN '6C' THEN 644 WHEN '6C+' THEN 660
                WHEN '7A' THEN 676 WHEN '7A+' THEN 692 WHEN '7B' THEN 708 WHEN '7B+' THEN 724
                WHEN '7C' THEN 740 WHEN '7C+' THEN 756 WHEN '8A' THEN 772 WHEN '8A+' THEN 788
                WHEN '8B' THEN 804 WHEN '8B+' THEN 820 WHEN '8C' THEN 836 WHEN '8C+' THEN 852
                WHEN '9A' THEN 868 WHEN '9A+' THEN 884 WHEN '9B' THEN 900 WHEN '9B+' THEN 916
                WHEN '9C' THEN 932 WHEN '9C+' THEN 948
                ELSE NULL
              END
            ) + CASE WHEN fc.style = 'flash' THEN 10 ELSE 0 END
          END
        )
      )::integer AS avg_points
    FROM filtered_climbs fc
    GROUP BY fc.user_id, fc.username, fc.first_name, fc.last_name, fc.display_name
  ),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort = 'tops' THEN su.climb_count ELSE COALESCE(su.avg_points, 0) END DESC,
          su.climb_count DESC,
          su.user_id
      )::bigint AS rank,
      su.user_id,
      su.username,
      su.avatar_url,
      public.rankings_grade_from_points(COALESCE(su.avg_points, 0)) AS avg_grade,
      su.climb_count,
      COUNT(*) OVER ()::bigint AS total_users
    FROM scored_users su
  )
  SELECT
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.avatar_url,
    ranked.avg_grade,
    ranked.climb_count,
    ranked.total_users
  FROM ranked
  ORDER BY ranked.rank
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_limit, 1);
$function$;

CREATE OR REPLACE FUNCTION public.get_place_rankings_leaderboard(
  p_place_id uuid,
  p_sort text DEFAULT 'tops',
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_window_start timestamptz DEFAULT NULL
)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  username text,
  avatar_url text,
  avg_grade text,
  climb_count bigint,
  total_users bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH filtered_climbs AS (
    SELECT
      uc.user_id,
      uc.style,
      uc.created_at,
      c.grade,
      p.username,
      p.first_name,
      p.last_name,
      p.display_name,
      p.avatar_url
    FROM public.user_climbs uc
    INNER JOIN public.climbs c ON c.id = uc.climb_id
    INNER JOIN public.profiles p ON p.id = uc.user_id
    WHERE uc.style IN ('top', 'flash')
      AND c.place_id = p_place_id
      AND (p_window_start IS NULL OR uc.created_at >= p_window_start)
      AND p.is_public = true
  ),
  scored_users AS (
    SELECT
      fc.user_id,
      COALESCE(
        NULLIF(BTRIM(CONCAT(COALESCE(fc.first_name, ''), ' ', COALESCE(fc.last_name, ''))), ''),
        NULLIF(fc.display_name, ''),
        NULLIF(fc.username, ''),
        CONCAT('Climber ', LEFT(fc.user_id::text, 4))
      ) AS username,
      MAX(fc.avatar_url) AS avatar_url,
      COUNT(*)::bigint AS climb_count,
      ROUND(
        AVG(
          CASE
            WHEN fc.grade IS NULL THEN NULL
            ELSE (
              CASE UPPER(BTRIM(fc.grade))
                WHEN '1A' THEN 100 WHEN '1A+' THEN 116 WHEN '1B' THEN 132 WHEN '1B+' THEN 148
                WHEN '1C' THEN 164 WHEN '1C+' THEN 180 WHEN '2A' THEN 196 WHEN '2A+' THEN 212
                WHEN '2B' THEN 228 WHEN '2B+' THEN 244 WHEN '2C' THEN 260 WHEN '2C+' THEN 276
                WHEN '3A' THEN 292 WHEN '3A+' THEN 308 WHEN '3B' THEN 324 WHEN '3B+' THEN 340
                WHEN '3C' THEN 356 WHEN '3C+' THEN 372 WHEN '4A' THEN 388 WHEN '4A+' THEN 404
                WHEN '4B' THEN 420 WHEN '4B+' THEN 436 WHEN '4C' THEN 452 WHEN '4C+' THEN 468
                WHEN '5A' THEN 484 WHEN '5A+' THEN 500 WHEN '5B' THEN 516 WHEN '5B+' THEN 532
                WHEN '5C' THEN 548 WHEN '5C+' THEN 564 WHEN '6A' THEN 580 WHEN '6A+' THEN 596
                WHEN '6B' THEN 612 WHEN '6B+' THEN 628 WHEN '6C' THEN 644 WHEN '6C+' THEN 660
                WHEN '7A' THEN 676 WHEN '7A+' THEN 692 WHEN '7B' THEN 708 WHEN '7B+' THEN 724
                WHEN '7C' THEN 740 WHEN '7C+' THEN 756 WHEN '8A' THEN 772 WHEN '8A+' THEN 788
                WHEN '8B' THEN 804 WHEN '8B+' THEN 820 WHEN '8C' THEN 836 WHEN '8C+' THEN 852
                WHEN '9A' THEN 868 WHEN '9A+' THEN 884 WHEN '9B' THEN 900 WHEN '9B+' THEN 916
                WHEN '9C' THEN 932 WHEN '9C+' THEN 948
                ELSE NULL
              END
            ) + CASE WHEN fc.style = 'flash' THEN 10 ELSE 0 END
          END
        )
      )::integer AS avg_points
    FROM filtered_climbs fc
    GROUP BY fc.user_id, fc.username, fc.first_name, fc.last_name, fc.display_name
  ),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort = 'tops' THEN su.climb_count ELSE COALESCE(su.avg_points, 0) END DESC,
          su.climb_count DESC,
          su.user_id
      )::bigint AS rank,
      su.user_id,
      su.username,
      su.avatar_url,
      public.rankings_grade_from_points(COALESCE(su.avg_points, 0)) AS avg_grade,
      su.climb_count,
      COUNT(*) OVER ()::bigint AS total_users
    FROM scored_users su
  )
  SELECT
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.avatar_url,
    ranked.avg_grade,
    ranked.climb_count,
    ranked.total_users
  FROM ranked
  ORDER BY ranked.rank
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_limit, 1);
$function$;

REVOKE ALL ON FUNCTION public.rankings_grade_from_points(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rankings_grade_from_points(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.rankings_grade_from_points(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rankings_grade_from_points(integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_rankings_leaderboard(text, uuid, text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rankings_leaderboard(text, uuid, text, integer, integer, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rankings_leaderboard(text, uuid, text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_leaderboard(text, uuid, text, integer, integer, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.get_place_rankings_leaderboard(uuid, text, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_place_rankings_leaderboard(uuid, text, integer, integer, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.get_place_rankings_leaderboard(uuid, text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_place_rankings_leaderboard(uuid, text, integer, integer, timestamptz) TO service_role;
# Force migration trigger
