-- Fix: Also delete from places when delete_empty_crag removes a crag
-- The sync trigger doesn't fire when crag is deleted via function call

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
  crag_exists boolean := false;
BEGIN
  IF target_crag_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if crag exists and meets deletion criteria
  SELECT EXISTS (
    SELECT 1 FROM public.crags c
    WHERE c.id = target_crag_id
      AND c.created_at < now() - grace_period
      AND NOT EXISTS (
        SELECT 1 FROM public.images i WHERE i.crag_id = c.id
      )
  ) INTO crag_exists;

  IF crag_exists THEN
    -- Delete from places table first (sync trigger doesn't fire from function)
    DELETE FROM public.places WHERE id = target_crag_id AND type = 'crag';
    
    -- Delete the crag (this will cascade delete climbs)
    DELETE FROM public.crags WHERE id = target_crag_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  RETURN deleted_count > 0;
END;
$$;
