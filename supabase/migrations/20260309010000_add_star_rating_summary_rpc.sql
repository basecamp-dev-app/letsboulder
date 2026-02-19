CREATE OR REPLACE FUNCTION public.get_star_rating_summary(p_climb_id UUID)
RETURNS TABLE(avg_rating NUMERIC, rating_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    ROUND(AVG(star_rating)::numeric, 2) AS avg_rating,
    COUNT(star_rating)::int AS rating_count
  FROM public.user_climbs
  WHERE climb_id = p_climb_id
    AND star_rating IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_star_rating_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(UUID) TO service_role;
