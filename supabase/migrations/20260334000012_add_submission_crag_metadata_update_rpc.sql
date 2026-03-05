ALTER TABLE public.crags
  ADD COLUMN IF NOT EXISTS last_edited_by UUID;

CREATE OR REPLACE FUNCTION public.update_submission_crag_metadata(
  p_image_id UUID,
  p_crag_name TEXT,
  p_region_tag TEXT,
  p_sub_area TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  v_image RECORD;
  v_crag RECORD;
  v_country_code TEXT;
  v_region_tag TEXT;
  v_sub_area TEXT;
  v_tag_id UUID;
  v_slug TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_image_id IS NULL THEN
    RAISE EXCEPTION 'Image ID is required';
  END IF;

  IF p_crag_name IS NULL OR btrim(p_crag_name) = '' THEN
    RAISE EXCEPTION 'Crag name is required';
  END IF;

  IF p_region_tag IS NULL OR btrim(p_region_tag) = '' THEN
    RAISE EXCEPTION 'Region tag is required';
  END IF;

  v_region_tag := btrim(p_region_tag);
  v_sub_area := NULLIF(btrim(COALESCE(p_sub_area, '')), '');

  SELECT id, created_by, crag_id
  INTO v_image
  FROM public.images
  WHERE id = p_image_id
  LIMIT 1;

  IF v_image IS NULL THEN
    RAISE EXCEPTION 'Image not found';
  END IF;

  IF v_image.created_by IS NULL OR v_image.created_by <> current_user_id THEN
    RAISE EXCEPTION 'Only the submission owner can edit crag metadata';
  END IF;

  IF v_image.crag_id IS NULL THEN
    RAISE EXCEPTION 'Submission image is not linked to a crag';
  END IF;

  SELECT id, country_code
  INTO v_crag
  FROM public.crags
  WHERE id = v_image.crag_id
  LIMIT 1;

  IF v_crag IS NULL THEN
    RAISE EXCEPTION 'Crag not found';
  END IF;

  v_country_code := NULLIF(upper(btrim(COALESCE(v_crag.country_code, ''))), '');
  v_slug := trim(both '-' from regexp_replace(lower(v_region_tag), '[^a-z0-9]+', '-', 'g'));

  IF v_slug = '' THEN
    v_slug := 'region';
  END IF;

  SELECT id
  INTO v_tag_id
  FROM public.location_tags
  WHERE kind = 'region'
    AND lower(name) = lower(v_region_tag)
    AND COALESCE(country_code, '') = COALESCE(v_country_code, '')
  LIMIT 1;

  IF v_tag_id IS NULL THEN
    BEGIN
      INSERT INTO public.location_tags (kind, name, slug, country_code)
      VALUES ('region', v_region_tag, v_slug, v_country_code)
      RETURNING id INTO v_tag_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id
      INTO v_tag_id
      FROM public.location_tags
      WHERE kind = 'region'
        AND lower(name) = lower(v_region_tag)
        AND COALESCE(country_code, '') = COALESCE(v_country_code, '')
      LIMIT 1;
    END;
  END IF;

  IF v_tag_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve region tag';
  END IF;

  UPDATE public.crags
  SET
    name = btrim(p_crag_name),
    region_name = v_region_tag,
    sub_area = v_sub_area,
    updated_at = now(),
    last_edited_by = current_user_id
  WHERE id = v_crag.id;

  DELETE FROM public.crag_location_tags
  WHERE crag_id = v_crag.id
    AND is_primary_region = true;

  INSERT INTO public.crag_location_tags (crag_id, tag_id, is_primary_region)
  VALUES (v_crag.id, v_tag_id, true)
  ON CONFLICT (crag_id, tag_id)
  DO UPDATE SET is_primary_region = true;

  RETURN jsonb_build_object(
    'crag_id', v_crag.id,
    'name', btrim(p_crag_name),
    'region_tag', v_region_tag,
    'sub_area', v_sub_area,
    'last_edited_by', current_user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_submission_crag_metadata(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_submission_crag_metadata(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_submission_crag_metadata(UUID, TEXT, TEXT, TEXT) TO service_role;
