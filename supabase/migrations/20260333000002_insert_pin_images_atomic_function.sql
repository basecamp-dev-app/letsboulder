CREATE OR REPLACE FUNCTION public.insert_pin_images_atomic(
  p_crag_id UUID,
  p_urls TEXT[]
)
RETURNS SETOF public.crag_images
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_crag_id IS NULL THEN
    RAISE EXCEPTION 'crag_id is required';
  END IF;

  IF p_urls IS NULL OR cardinality(p_urls) = 0 THEN
    RAISE EXCEPTION 'At least one image URL is required';
  END IF;

  RETURN QUERY
  INSERT INTO public.crag_images (crag_id, url)
  SELECT
    p_crag_id,
    trim(url_item)
  FROM unnest(p_urls) AS url_item
  WHERE trim(url_item) <> ''
  RETURNING *;
END;
$function$;
