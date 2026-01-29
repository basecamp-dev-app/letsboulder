-- Keep crag latitude/longitude derived from image GPS.
-- Requirement: crags with coordinates must have at least one image with GPS.

CREATE OR REPLACE FUNCTION public.recompute_crag_location(target_crag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_lat numeric;
  avg_lng numeric;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    avg(i.latitude),
    avg(i.longitude)
  INTO avg_lat, avg_lng
  FROM public.images i
  WHERE i.crag_id = target_crag_id
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL;

  UPDATE public.crags c
  SET
    latitude = CASE WHEN avg_lat IS NULL THEN NULL ELSE avg_lat::numeric(10,8) END,
    longitude = CASE WHEN avg_lng IS NULL THEN NULL ELSE avg_lng::numeric(11,8) END
  WHERE c.id = target_crag_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.images_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_crag_location(NEW.crag_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.crag_id IS DISTINCT FROM OLD.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    IF NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_crag_location(OLD.crag_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


DROP TRIGGER IF EXISTS images_recompute_crag_location_insert ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_update ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_delete ON public.images;

CREATE TRIGGER images_recompute_crag_location_insert
AFTER INSERT ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();

CREATE TRIGGER images_recompute_crag_location_update
AFTER UPDATE OF crag_id, latitude, longitude ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();

CREATE TRIGGER images_recompute_crag_location_delete
AFTER DELETE ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();


-- Backfill: set all crag coordinates from images.
WITH agg AS (
  SELECT
    i.crag_id,
    avg(i.latitude)::numeric(10,8) AS avg_lat,
    avg(i.longitude)::numeric(11,8) AS avg_lng
  FROM public.images i
  WHERE i.crag_id IS NOT NULL
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
  GROUP BY i.crag_id
)
UPDATE public.crags c
SET latitude = a.avg_lat,
    longitude = a.avg_lng
FROM agg a
WHERE c.id = a.crag_id;

-- Enforce invariant: if no images with GPS exist for a crag, coordinates must be NULL.
UPDATE public.crags c
SET latitude = NULL,
    longitude = NULL
WHERE (c.latitude IS NOT NULL OR c.longitude IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.crag_id = c.id
      AND i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
  );
