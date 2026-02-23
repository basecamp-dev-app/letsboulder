CREATE OR REPLACE FUNCTION public.normalize_climb_route_type(raw_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF raw_type IS NULL THEN
    RETURN NULL;
  END IF;

  normalized := lower(trim(replace(raw_type, '_', '-')));

  IF normalized = 'bouldering' THEN
    RETURN 'boulder';
  ELSIF normalized = 'boulder' THEN
    RETURN 'boulder';
  ELSIF normalized = 'sport' THEN
    RETURN 'sport';
  ELSIF normalized = 'trad' THEN
    RETURN 'trad';
  ELSIF normalized = 'mixed' THEN
    RETURN 'mixed';
  ELSIF normalized = 'deep-water-solo' THEN
    RETURN 'deep_water_solo';
  ELSIF normalized = 'top-rope' THEN
    RETURN 'top_rope';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_crag_type_from_climbs(target_crag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  winner_type TEXT;
  winner_count INTEGER;
  has_tie BOOLEAN;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN;
  END IF;

  WITH normalized_counts AS (
    SELECT
      public.normalize_climb_route_type(c.route_type) AS normalized_type,
      COUNT(*)::INTEGER AS route_count
    FROM public.climbs c
    WHERE c.crag_id = target_crag_id
      AND c.deleted_at IS NULL
      AND COALESCE(c.status, 'approved') = 'approved'
    GROUP BY public.normalize_climb_route_type(c.route_type)
    HAVING public.normalize_climb_route_type(c.route_type) IS NOT NULL
  ), ranked AS (
    SELECT
      normalized_type,
      route_count,
      DENSE_RANK() OVER (ORDER BY route_count DESC) AS count_rank
    FROM normalized_counts
  )
  SELECT
    (SELECT normalized_type FROM ranked WHERE count_rank = 1 LIMIT 1),
    (SELECT route_count FROM ranked WHERE count_rank = 1 LIMIT 1),
    (SELECT COUNT(*) > 1 FROM ranked WHERE count_rank = 1)
  INTO winner_type, winner_count, has_tie;

  IF winner_type IS NULL OR winner_count IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.crags
  SET type = CASE
    WHEN has_tie THEN 'mixed'
    ELSE winner_type
  END
  WHERE id = target_crag_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_crag_type_from_climbs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_crag_type_from_climbs(OLD.crag_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.crag_id IS DISTINCT FROM NEW.crag_id THEN
    PERFORM public.refresh_crag_type_from_climbs(OLD.crag_id);
  END IF;

  PERFORM public.refresh_crag_type_from_climbs(NEW.crag_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS climbs_sync_crag_type_after_write ON public.climbs;

CREATE TRIGGER climbs_sync_crag_type_after_write
AFTER INSERT OR UPDATE OF route_type, crag_id, status, deleted_at OR DELETE
ON public.climbs
FOR EACH ROW
EXECUTE FUNCTION public.sync_crag_type_from_climbs();

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT crag_id
    FROM public.climbs
    WHERE crag_id IS NOT NULL
  LOOP
    PERFORM public.refresh_crag_type_from_climbs(rec.crag_id);
  END LOOP;
END;
$$;
