CREATE INDEX idx_crags_location_geometry
  ON public.crags
  USING gist ((location::extensions.geometry));

CREATE OR REPLACE FUNCTION public.get_viewport_map_features(
  p_north double precision,
  p_south double precision,
  p_east double precision,
  p_west double precision,
  p_zoom integer,
  include_pending boolean DEFAULT false
)
RETURNS TABLE (
  id text,
  name text,
  type text,
  latitude double precision,
  longitude double precision,
  slug text,
  country_code character varying,
  image_count bigint,
  route_count bigint,
  is_cluster boolean,
  point_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_north IS NULL OR p_south IS NULL OR p_east IS NULL OR p_west IS NULL
    OR p_north IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_south IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_east IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_west IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    OR p_north NOT BETWEEN -90 AND 90 OR p_south NOT BETWEEN -90 AND 90
    OR p_east NOT BETWEEN -180 AND 180 OR p_west NOT BETWEEN -180 AND 180
    OR p_north <= p_south OR p_east = p_west THEN
    RAISE EXCEPTION 'invalid map bounds' USING ERRCODE = '22023';
  END IF;

  IF p_zoom IS NULL OR p_zoom NOT BETWEEN 0 AND 22 OR include_pending IS NULL
    OR (p_zoom >= 12 AND (
      p_north - p_south > 10.0 / power(2.0, p_zoom - 12)
      OR CASE WHEN p_west < p_east THEN p_east - p_west ELSE 360 - p_west + p_east END
        > 10.0 / power(2.0, p_zoom - 12)
    )) THEN
    RAISE EXCEPTION 'zoom must be an integer between 0 and 22 and include_pending must not be null'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH bounded_crags AS MATERIALIZED (
    SELECT c.id, c.name, c.location, c.slug, c.country_code, c.route_count
    FROM public.crags c
    WHERE c.deleted_at IS NULL
      AND c.location IS NOT NULL
      AND (
        (p_west < p_east AND c.location::extensions.geometry OPERATOR(extensions.&&)
          extensions.ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
        OR
        (p_west > p_east AND (
          c.location::extensions.geometry OPERATOR(extensions.&&)
            extensions.ST_MakeEnvelope(p_west, p_south, 180, p_north, 4326)
          OR c.location::extensions.geometry OPERATOR(extensions.&&)
            extensions.ST_MakeEnvelope(-180, p_south, p_east, p_north, 4326)
        ))
      )
  ),
  eligible_crags AS (
    SELECT
      c.id::text AS id,
      c.name::text AS name,
      'crag'::text AS type,
      extensions.ST_Y(c.location::extensions.geometry) AS latitude,
      extensions.ST_X(c.location::extensions.geometry) AS longitude,
      c.slug,
      c.country_code,
      count(i.id)::bigint AS image_count,
      c.route_count::bigint AS route_count
    FROM bounded_crags c
    JOIN public.images i ON i.crag_id = c.id
      AND i.status <> 'deleted'
      AND i.processing_status = 'ready'
      AND i.moderation_status IN ('approved', 'skipped')
      AND i.visibility = 'public'
      AND (i.status = 'approved' OR (include_pending AND i.status = 'pending'))
      AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
    GROUP BY c.id, c.name, c.location, c.slug, c.country_code, c.route_count
    HAVING count(i.id) > 0
  ),
  bounded_gyms AS MATERIALIZED (
    SELECT
      p.id::text AS id,
      p.name::text AS name,
      'gym'::text AS type,
      p.latitude::double precision AS latitude,
      p.longitude::double precision AS longitude,
      p.slug,
      p.country_code,
      NULL::bigint AS image_count,
      NULL::bigint AS route_count
    FROM public.places p
    WHERE p.type = 'gym'
      AND p.latitude BETWEEN p_south AND p_north
      AND CASE WHEN p_west < p_east
        THEN p.longitude BETWEEN p_west AND p_east
        ELSE p.longitude >= p_west OR p.longitude <= p_east
      END
      AND p.slug IS NOT NULL
  ),
  places AS (
    SELECT * FROM eligible_crags
    UNION ALL
    SELECT * FROM bounded_gyms
  ),
  bucketed AS (
    SELECT
      f.*,
      CASE WHEN p_zoom <= 11 THEN floor(
         ((f.longitude + 180.0) / 360.0) * (512.0 * power(2.0, p_zoom)) / 112.0
      )::bigint ELSE 0 END AS grid_x,
      CASE WHEN p_zoom <= 11 THEN floor(
        ((1.0 - ln(tan(radians(least(85.05112878, greatest(-85.05112878, f.latitude))))
          + 1.0 / cos(radians(least(85.05112878, greatest(-85.05112878, f.latitude))))) / pi()) / 2.0)
          * (512.0 * power(2.0, p_zoom)) / 112.0
      )::bigint ELSE 0 END AS grid_y
    FROM places f
  )
  SELECT
    CASE WHEN p_zoom <= 11 AND count(*) > 1
      THEN format('cluster:%s:%s:%s', p_zoom, b.grid_x, b.grid_y)
      ELSE min(b.id) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.name) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN 'cluster' ELSE min(b.type) END,
    avg(b.latitude)::double precision,
    avg(b.longitude)::double precision,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.slug) END,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN NULL ELSE min(b.country_code) END::character varying,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN sum(b.image_count) ELSE min(b.image_count) END::bigint,
    CASE WHEN p_zoom <= 11 AND count(*) > 1 THEN sum(b.route_count) ELSE min(b.route_count) END::bigint,
    p_zoom <= 11 AND count(*) > 1,
    count(*)::bigint
  FROM bucketed b
  GROUP BY
    b.grid_x,
    b.grid_y,
    CASE WHEN p_zoom <= 11 THEN NULL ELSE b.id END
  ORDER BY 10 DESC, 11 DESC, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_viewport_map_features(
  double precision, double precision, double precision, double precision, integer, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_viewport_map_features(
  double precision, double precision, double precision, double precision, integer, boolean
) TO service_role;
