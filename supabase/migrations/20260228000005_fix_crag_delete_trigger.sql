-- Fix crag location trigger to handle deleted crags gracefully
-- When a crag is being deleted, the trigger tries to update a non-existent row

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
    -- Only recompute if the crag still exists (handles cascade delete from crag)
    IF EXISTS (SELECT 1 FROM public.crags WHERE id = OLD.crag_id) THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Recreate the trigger
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
