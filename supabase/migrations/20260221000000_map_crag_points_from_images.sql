-- Map helper: use image GPS to derive crag points

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
  count integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cell double precision;
  use_buckets boolean;
BEGIN
  IF zoom IS NULL THEN
    zoom := 0;
  END IF;

  use_buckets := zoom < 9;

  IF use_buckets THEN
    cell := CASE
      WHEN zoom <= 2 THEN 10.0
      WHEN zoom <= 4 THEN 5.0
      WHEN zoom <= 6 THEN 1.0
      WHEN zoom <= 8 THEN 0.25
      ELSE 0.1
    END;
  END IF;

  IF NOT use_buckets THEN
    RETURN QUERY
    WITH image_points AS (
      SELECT
        i.crag_id,
        avg(i.latitude)::double precision AS lat,
        avg(i.longitude)::double precision AS lng
      FROM public.images i
      WHERE i.crag_id IS NOT NULL
        AND i.latitude IS NOT NULL
        AND i.longitude IS NOT NULL
        AND i.latitude::double precision BETWEEN min_lat AND max_lat
        AND (
          (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
          OR
          (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
        )
      GROUP BY i.crag_id
    )
    SELECT
      'crag'::text AS kind,
      c.id,
      c.name,
      ip.lat AS latitude,
      ip.lng AS longitude,
      1 AS count
    FROM image_points ip
    JOIN public.crags c ON c.id = ip.crag_id
    ORDER BY c.name
    LIMIT 2000;
    RETURN;
  END IF;

  RETURN QUERY
  WITH image_points AS (
    SELECT
      i.crag_id,
      avg(i.latitude)::double precision AS lat,
      avg(i.longitude)::double precision AS lng
    FROM public.images i
    WHERE i.crag_id IS NOT NULL
      AND i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude::double precision BETWEEN min_lat AND max_lat
      AND (
        (min_lng <= max_lng AND i.longitude::double precision BETWEEN min_lng AND max_lng)
        OR
        (min_lng > max_lng AND (i.longitude::double precision >= min_lng OR i.longitude::double precision <= max_lng))
      )
    GROUP BY i.crag_id
  ),
  bucketed AS (
    SELECT
      (floor(lat / cell) * cell + cell / 2.0) AS bucket_lat,
      (floor(lng / cell) * cell + cell / 2.0) AS bucket_lng,
      count(*)::integer AS ct
    FROM image_points
    GROUP BY 1, 2
  )
  SELECT
    'cluster'::text AS kind,
    NULL::uuid AS id,
    NULL::character varying AS name,
    b.bucket_lat AS latitude,
    b.bucket_lng AS longitude,
    b.ct AS count
  FROM bucketed b
  ORDER BY b.ct DESC
  LIMIT 1500;
END;
$$;
