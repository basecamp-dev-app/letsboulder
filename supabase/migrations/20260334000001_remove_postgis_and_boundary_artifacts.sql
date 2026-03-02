ALTER TABLE public.places DROP COLUMN IF EXISTS boundary;

DROP INDEX IF EXISTS public.idx_places_boundary;
DROP INDEX IF EXISTS public.idx_crags_boundary;

DROP EXTENSION IF EXISTS postgis CASCADE;

CREATE OR REPLACE FUNCTION public.find_region_by_location(
  search_lat double precision,
  search_lng double precision
)
RETURNS TABLE (
  id uuid,
  name varchar(100),
  country_code varchar(2),
  center_lat decimal(10,8),
  center_lon decimal(11,8),
  distance_meters double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.country_code,
    r.center_lat,
    r.center_lon,
    (
      6371000 * acos(
        LEAST(
          1,
          GREATEST(
            -1,
            cos(radians(search_lat))
            * cos(radians(r.center_lat::double precision))
            * cos(radians(r.center_lon::double precision) - radians(search_lng))
            + sin(radians(search_lat))
            * sin(radians(r.center_lat::double precision))
          )
        )
      )
    ) AS distance_meters
  FROM public.regions r
  WHERE r.center_lat IS NOT NULL
    AND r.center_lon IS NOT NULL
  ORDER BY distance_meters ASC
  LIMIT 1;
$$;
