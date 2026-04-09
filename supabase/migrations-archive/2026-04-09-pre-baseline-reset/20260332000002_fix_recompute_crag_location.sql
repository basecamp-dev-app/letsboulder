-- =====================================================
-- Fix recompute_crag_location to include image coordinates
-- Created: 2026-02-25
-- =====================================================

CREATE OR REPLACE FUNCTION public.recompute_crag_location(target_crag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  avg_lat numeric;
  avg_lng numeric;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  -- Average position from both climbs AND approved images
  SELECT
    avg(combined.lat),
    avg(combined.lng)
  INTO avg_lat, avg_lng
  FROM (
    SELECT c.latitude AS lat, c.longitude AS lng
    FROM public.climbs c
    WHERE c.crag_id = target_crag_id
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
    UNION ALL
    SELECT i.latitude AS lat, i.longitude AS lng
    FROM public.images i
    WHERE i.crag_id = target_crag_id
      AND i.status = 'approved'
      AND i.latitude IS NOT NULL
      AND i.longitude IS NOT NULL
  ) combined;

  UPDATE public.crags cr
  SET
    latitude = CASE WHEN avg_lat IS NULL THEN NULL ELSE avg_lat::numeric(10,8) END,
    longitude = CASE WHEN avg_lng IS NULL THEN NULL ELSE avg_lng::numeric(11,8) END
  WHERE cr.id = target_crag_id;
END;
$function$;
