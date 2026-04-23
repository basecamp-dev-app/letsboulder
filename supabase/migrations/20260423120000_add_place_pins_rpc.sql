CREATE OR REPLACE FUNCTION public.get_place_pins(include_pending boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  latitude numeric,
  longitude numeric,
  slug text,
  country_code character varying,
  image_count bigint,
  route_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    c.id,
    c.name::text,
    'crag'::text AS type,
    AVG(i.latitude)::numeric(10,8) AS latitude,
    AVG(i.longitude)::numeric(11,8) AS longitude,
    c.slug,
    c.country_code,
    COUNT(i.id)::bigint AS image_count,
    c.route_count
  FROM public.crags c
  INNER JOIN public.images i ON i.crag_id = c.id
    AND i.status != 'deleted'
    AND (
      i.status = 'approved'
      OR (include_pending AND i.status = 'pending')
    )
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
  GROUP BY c.id, c.name, c.slug, c.country_code, c.route_count
  HAVING COUNT(i.id) > 0

  UNION ALL

  SELECT
    p.id,
    p.name::text,
    p.type,
    p.latitude,
    p.longitude,
    p.slug,
    p.country_code,
    NULL::bigint AS image_count,
    NULL::integer AS route_count
  FROM public.places p
  WHERE p.type = 'gym'
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.slug IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_place_pins(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_place_pins(boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_place_pins(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_place_pins(boolean) TO service_role;
