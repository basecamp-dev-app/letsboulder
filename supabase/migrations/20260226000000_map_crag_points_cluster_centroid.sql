-- Improve map clustering UX:
-- - Place cluster markers at centroid of points (not grid center)
-- - Keep bucket bounds for deterministic drill-in
-- - Avoid min(uuid) by using min(crag_id::text)

CREATE OR REPLACE FUNCTION public.get_map_crag_points(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  zoom integer
)
RETURNS TABLE (
  kind text,
  id uuid,
  name character varying,
  latitude double precision,
  longitude double precision,
  count integer,
  bucket_south double precision,
  bucket_west double precision,
  bucket_north double precision,
  bucket_east double precision,
  single_crag_id uuid,
  single_crag_name character varying
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 8;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 7 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        c.id AS crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      JOIN public.crags c ON c.id = i.crag_id
      WHERE i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY c.id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count,
      NULL::double precision AS bucket_south,
      NULL::double precision AS bucket_west,
      NULL::double precision AS bucket_north,
      NULL::double precision AS bucket_east,
      NULL::uuid AS single_crag_id,
      NULL::character varying AS single_crag_name
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      c.id AS crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    JOIN public.crags c ON c.id = i.crag_id
    WHERE i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY c.id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      avg(lat)::double precision AS centroid_lat,
      avg(lng)::double precision AS centroid_lng,
      count(*)::integer AS ct,
      min(crag_id::text) AS min_crag_id_text
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.centroid_lat AS latitude,
    b.centroid_lng AS longitude,
    b.ct AS count,
    (b.bucket_lat - cell / 2.0) AS bucket_south,
    (b.bucket_lng - cell / 2.0) AS bucket_west,
    (b.bucket_lat + cell / 2.0) AS bucket_north,
    (b.bucket_lng + cell / 2.0) AS bucket_east,
    CASE WHEN b.ct = 1 THEN b.min_crag_id_text::uuid ELSE NULL END AS single_crag_id,
    CASE WHEN b.ct = 1 THEN c.name ELSE NULL END AS single_crag_name
  FROM bucketed b
  LEFT JOIN public.crags c ON c.id::text = b.min_crag_id_text
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_crag_points(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) TO anon, authenticated, service_role;
