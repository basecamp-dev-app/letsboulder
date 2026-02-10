-- Auto-delete empty crags after a grace period.
-- Keeps submit flow safe: users can create a crag first, then upload images.

CREATE OR REPLACE FUNCTION public.delete_empty_crag(
  target_crag_id uuid,
  grace_period interval DEFAULT interval '24 hours'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.crags c
  WHERE c.id = target_crag_id
    AND c.created_at < now() - grace_period
    AND NOT EXISTS (
      SELECT 1
      FROM public.images i
      WHERE i.crag_id = c.id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;


CREATE OR REPLACE FUNCTION public.delete_empty_crags(
  grace_period interval DEFAULT interval '24 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  DELETE FROM public.crags c
  WHERE c.created_at < now() - grace_period
    AND NOT EXISTS (
      SELECT 1
      FROM public.images i
      WHERE i.crag_id = c.id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
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
      PERFORM public.delete_empty_crag(OLD.crag_id, interval '24 hours');
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
    PERFORM public.delete_empty_crag(OLD.crag_id, interval '24 hours');
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


-- One-time cleanup for existing legacy rows.
SELECT public.delete_empty_crags(interval '24 hours');
