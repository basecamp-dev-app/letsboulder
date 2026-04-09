-- Migration: Fix null crag_id on images that have route_lines
-- The previous data migration (20260338000000) deleted submission images
-- (which had correct crag_id) and kept upload session images (which had
-- crag_id = null). This left route_lines pointing to images the crag page
-- can't display because the crag query filters by crag_id.
--
-- Fix: Derive crag_id from the climbs linked through route_lines.

DO $$
DECLARE
  _fixed INTEGER := 0;
BEGIN
  UPDATE public.images i
  SET crag_id = (
    SELECT c.crag_id
    FROM public.route_lines rl
    JOIN public.climbs c ON c.id = rl.climb_id
    WHERE rl.image_id = i.id
    LIMIT 1
  )
  WHERE i.crag_id IS NULL
    AND EXISTS (SELECT 1 FROM public.route_lines rl WHERE rl.image_id = i.id);

  GET DIAGNOSTICS _fixed = ROW_COUNT;
  RAISE NOTICE 'Fixed crag_id for % image(s)', _fixed;
END;
$$;
