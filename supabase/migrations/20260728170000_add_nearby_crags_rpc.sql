CREATE OR REPLACE FUNCTION public.get_nearby_crags(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters double precision DEFAULT 10000,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  name character varying(200),
  latitude numeric,
  longitude numeric,
  rock_type character varying(50),
  type character varying(20),
  country_code character varying(2),
  region_name character varying(100),
  sub_area character varying(120),
  distance_meters double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  query_point extensions.geography;
BEGIN
  IF p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
    OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'latitude and longitude are outside valid ranges'
      USING ERRCODE = '22023';
  END IF;

  IF p_radius_meters IS NULL OR p_radius_meters <= 0 OR p_radius_meters > 100000 THEN
    RAISE EXCEPTION 'radius must be greater than 0 and at most 100000 meters'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 30 THEN
    RAISE EXCEPTION 'limit must be between 1 and 30'
      USING ERRCODE = '22023';
  END IF;

  query_point := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.latitude,
    c.longitude,
    c.rock_type,
    c.type,
    c.country_code,
    c.region_name,
    c.sub_area,
    extensions.ST_Distance(c.location, query_point) AS distance_meters
  FROM public.crags c
  WHERE c.location IS NOT NULL
    AND extensions.ST_DWithin(c.location, query_point, p_radius_meters)
  ORDER BY c.location OPERATOR(extensions.<->) query_point, c.id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearby_crags(double precision, double precision, double precision, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_crags(double precision, double precision, double precision, integer)
  TO anon, authenticated, service_role;
