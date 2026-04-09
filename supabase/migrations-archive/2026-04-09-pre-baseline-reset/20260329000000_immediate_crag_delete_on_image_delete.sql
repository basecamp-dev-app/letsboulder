-- Immediate auto-delete crag when last image is deleted (no grace period)

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
      PERFORM public.delete_empty_crag(OLD.crag_id, interval '0 seconds');
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
    PERFORM public.delete_empty_crag(OLD.crag_id, interval '0 seconds');
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
