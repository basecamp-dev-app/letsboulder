-- Bind image moderation to the crag shown in the management UI. The existing
-- soft_delete_image RPC remains the single lifecycle/audit implementation.

CREATE OR REPLACE FUNCTION public.soft_delete_crag_image(
  p_crag_id uuid,
  p_image_id uuid,
  p_reason text
)
RETURNS public.images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.images%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  IF target.crag_id IS DISTINCT FROM p_crag_id THEN
    RAISE EXCEPTION 'Image does not belong to this crag' USING ERRCODE = '22023';
  END IF;
  IF target.status = 'deleted' THEN
    RAISE EXCEPTION 'Image is already deleted' USING ERRCODE = '22023';
  END IF;

  RETURN public.soft_delete_image(target.id, reason);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_crag_image(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_crag_image(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_crag_image(uuid, uuid, text)
  TO service_role;
