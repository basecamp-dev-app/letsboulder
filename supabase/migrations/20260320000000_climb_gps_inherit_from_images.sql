-- Climb GPS inherit from images, remove crag boundary polygons
-- All climbs should inherit GPS from their image (image GPS is required on submission)
-- Crag GPS should be calculated from the average of all climbs within the crag

-- 1. Add latitude/longitude columns to climbs
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS latitude numeric(10,8);
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS longitude numeric(11,8);

-- 2. Function: compute climb GPS from its image (via route_lines) - for use by route_lines trigger
CREATE OR REPLACE FUNCTION public.recompute_climb_location_from_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_climb_id uuid;
  img_lat numeric(10,8);
  img_lng numeric(11,8);
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_climb_id := NEW.climb_id;
  ELSIF TG_OP = 'UPDATE' THEN
    target_climb_id := NEW.climb_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_climb_id := OLD.climb_id;
  ELSE
    RETURN OLD;
  END IF;

  IF target_climb_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT i.latitude, i.longitude
  INTO img_lat, img_lng
  FROM public.route_lines rl
  JOIN public.images i ON i.id = rl.image_id
  WHERE rl.climb_id = target_climb_id
  ORDER BY rl.created_at ASC
  LIMIT 1;

  UPDATE public.climbs c
  SET latitude = img_lat,
      longitude = img_lng
  WHERE c.id = target_climb_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger on route_lines to auto-populate climb GPS when route line is added/updated
DROP TRIGGER IF EXISTS route_lines_set_climb_gps ON public.route_lines;
CREATE TRIGGER route_lines_set_climb_gps
AFTER INSERT OR UPDATE OF image_id ON public.route_lines
FOR EACH ROW
EXECUTE FUNCTION public.recompute_climb_location_from_image();

-- 4. Fix sync_crag_to_place function to remove boundary column
CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.places WHERE id = OLD.id AND type = 'crag';
    RETURN OLD;
  END IF;

  resolved_primary := CASE
    WHEN NEW.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN NEW.type
    WHEN NEW.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END;

  INSERT INTO public.places (
    id,
    type,
    name,
    latitude,
    longitude,
    region_id,
    description,
    access_notes,
    rock_type,
    region_name,
    country,
    country_code,
    tide_dependency,
    report_count,
    is_flagged,
    slug,
    primary_discipline,
    disciplines,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'crag',
    NEW.name,
    NEW.latitude,
    NEW.longitude,
    NEW.region_id,
    NEW.description,
    NEW.access_notes,
    NEW.rock_type,
    NEW.region_name,
    NEW.country,
    NEW.country_code,
    NEW.tide_dependency,
    COALESCE(NEW.report_count, 0),
    COALESCE(NEW.is_flagged, false),
    NEW.slug,
    resolved_primary,
    ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    type = 'crag',
    name = EXCLUDED.name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    region_id = EXCLUDED.region_id,
    description = EXCLUDED.description,
    access_notes = EXCLUDED.access_notes,
    rock_type = EXCLUDED.rock_type,
    region_name = EXCLUDED.region_name,
    country = EXCLUDED.country,
    country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count,
    is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug,
    primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 5. New function: recompute crag location from climbs
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
    avg(c.latitude),
    avg(c.longitude)
  INTO avg_lat, avg_lng
  FROM public.climbs c
  WHERE c.crag_id = target_crag_id
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL;

  UPDATE public.crags cr
  SET
    latitude = CASE WHEN avg_lat IS NULL THEN NULL ELSE avg_lat::numeric(10,8) END,
    longitude = CASE WHEN avg_lng IS NULL THEN NULL ELSE avg_lng::numeric(11,8) END
  WHERE cr.id = target_crag_id;
END;
$$;

-- 6. Trigger: recompute crag location when climbs change
CREATE OR REPLACE FUNCTION public.climbs_recompute_crag_location_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.crag_id IS NOT NULL THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.crag_id IS NOT NULL AND OLD.crag_id <> NEW.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    IF NEW.crag_id IS NOT NULL AND (OLD.latitude IS DISTINCT FROM NEW.latitude OR OLD.longitude IS DISTINCT FROM NEW.longitude OR OLD.crag_id IS DISTINCT FROM NEW.crag_id) THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.crag_id IS NOT NULL THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS climbs_recompute_crag_location_insert ON public.climbs;
DROP TRIGGER IF EXISTS climbs_recompute_crag_location_update ON public.climbs;
DROP TRIGGER IF EXISTS climbs_recompute_crag_location_delete ON public.climbs;

CREATE TRIGGER climbs_recompute_crag_location_insert
AFTER INSERT ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

CREATE TRIGGER climbs_recompute_crag_location_update
AFTER UPDATE OF crag_id, latitude, longitude ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

CREATE TRIGGER climbs_recompute_crag_location_delete
AFTER DELETE ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.climbs_recompute_crag_location_trigger();

-- 7. Remove old image-based triggers
DROP TRIGGER IF EXISTS images_recompute_crag_location_insert ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_update ON public.images;
DROP TRIGGER IF EXISTS images_recompute_crag_location_delete ON public.images;

-- 8. Backfill existing climbs from their images (via route_lines)
WITH climb_image_gps AS (
  SELECT
    c.id as climb_id,
    i.latitude::numeric(10,8) as lat,
    i.longitude::numeric(11,8) as lng
  FROM public.climbs c
  JOIN public.route_lines rl ON rl.climb_id = c.id
  JOIN public.images i ON i.id = rl.image_id
  WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
)
UPDATE public.climbs c
SET latitude = cg.lat,
    longitude = cg.lng
FROM climb_image_gps cg
WHERE c.id = cg.climb_id;

-- 9. Backfill crags from climbs
WITH crag_climb_gps AS (
  SELECT
    c.crag_id,
    avg(c.latitude)::numeric(10,8) as avg_lat,
    avg(c.longitude)::numeric(11,8) as avg_lng
  FROM public.climbs c
  WHERE c.crag_id IS NOT NULL
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
  GROUP BY c.crag_id
)
UPDATE public.crags cr
SET latitude = ccg.avg_lat,
    longitude = ccg.avg_lng
FROM crag_climb_gps ccg
WHERE cr.id = ccg.crag_id;

-- 10. Remove boundary column from crags
ALTER TABLE public.crags DROP COLUMN IF EXISTS boundary;
