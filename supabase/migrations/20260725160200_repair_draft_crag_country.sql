CREATE OR REPLACE FUNCTION public.repair_submission_draft_crag_country(
  p_draft_id uuid,
  p_user_id uuid,
  p_crag_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_country_code text,
  p_country_name text DEFAULT NULL,
  p_region_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_draft record;
  v_crag record;
  v_country_code text := upper(btrim(COALESCE(p_country_code, '')));
  v_country_id uuid;
  v_latitude double precision;
  v_longitude double precision;
  v_has_crag_location boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF v_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Valid country code required';
  END IF;

  SELECT d.user_id, d.crag_id, d.status, d.metadata
  INTO v_draft
  FROM public.submission_drafts d
  WHERE d.id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  IF v_draft.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Draft owner changed before crag country repair';
  END IF;

  IF v_draft.crag_id IS NULL OR v_draft.crag_id <> p_crag_id THEN
    RAISE EXCEPTION 'Draft crag changed before country repair';
  END IF;

  SELECT c.id, c.country_code, c.latitude::double precision AS latitude,
         c.longitude::double precision AS longitude
  INTO v_crag
  FROM public.crags c
  WHERE c.id = v_draft.crag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft crag not found';
  END IF;

  IF NULLIF(btrim(v_crag.country_code), '') IS NOT NULL THEN
    RETURN upper(btrim(v_crag.country_code));
  END IF;

  v_has_crag_location := COALESCE(v_crag.latitude BETWEEN -90 AND 90
    AND v_crag.longitude BETWEEN -180 AND 180
    AND NOT (v_crag.latitude = 0 AND v_crag.longitude = 0), false);

  IF v_has_crag_location THEN
    v_latitude := v_crag.latitude;
    v_longitude := v_crag.longitude;
  ELSIF jsonb_typeof(v_draft.metadata #> '{submission,location,latitude}') = 'number'
        AND jsonb_typeof(v_draft.metadata #> '{submission,location,longitude}') = 'number' THEN
    v_latitude := (v_draft.metadata #>> '{submission,location,latitude}')::double precision;
    v_longitude := (v_draft.metadata #>> '{submission,location,longitude}')::double precision;
  ELSIF jsonb_typeof(v_draft.metadata #> '{location,latitude}') = 'number'
        AND jsonb_typeof(v_draft.metadata #> '{location,longitude}') = 'number' THEN
    v_latitude := (v_draft.metadata #>> '{location,latitude}')::double precision;
    v_longitude := (v_draft.metadata #>> '{location,longitude}')::double precision;
  END IF;

  IF v_latitude IS NULL OR v_longitude IS NULL
     OR v_latitude < -90 OR v_latitude > 90
     OR v_longitude < -180 OR v_longitude > 180
     OR (v_latitude = 0 AND v_longitude = 0) THEN
    SELECT di.latitude::double precision, di.longitude::double precision
    INTO v_latitude, v_longitude
    FROM public.submission_draft_images di
    WHERE di.draft_id = p_draft_id
      AND di.latitude BETWEEN -90 AND 90
      AND di.longitude BETWEEN -180 AND 180
      AND NOT (di.latitude = 0 AND di.longitude = 0)
    ORDER BY di.display_order, di.created_at, di.id
    LIMIT 1;
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude < -180 OR p_longitude > 180
     OR (p_latitude = 0 AND p_longitude = 0)
     OR v_latitude IS NULL OR v_longitude IS NULL
     OR abs(v_latitude - p_latitude) > 0.000001
     OR abs(v_longitude - p_longitude) > 0.000001 THEN
    RAISE EXCEPTION 'Draft location changed before crag country repair';
  END IF;

  IF NOT v_has_crag_location AND (
    EXISTS (SELECT 1 FROM public.images i WHERE i.crag_id = v_crag.id)
    OR EXISTS (SELECT 1 FROM public.climbs c WHERE c.crag_id = v_crag.id)
    OR EXISTS (SELECT 1 FROM public.sectors s WHERE s.crag_id = v_crag.id)
    OR EXISTS (SELECT 1 FROM public.crag_images ci WHERE ci.crag_id = v_crag.id)
  ) THEN
    RAISE EXCEPTION 'Countryless crag with published content requires manual repair';
  END IF;

  SELECT c.id
  INTO v_country_id
  FROM public.countries c
  WHERE upper(c.iso_a2) = v_country_code
  LIMIT 1;

  UPDATE public.crags
  SET country_id = v_country_id,
      country_code = v_country_code,
      country = COALESCE(NULLIF(country, ''), NULLIF(btrim(p_country_name), '')),
      region_name = COALESCE(NULLIF(region_name, ''), NULLIF(btrim(p_region_name), '')),
      updated_at = now()
  WHERE id = v_crag.id
    AND NULLIF(btrim(country_code), '') IS NULL;

  RETURN v_country_code;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_submission_draft_crag_country(uuid, uuid, uuid, double precision, double precision, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_submission_draft_crag_country(uuid, uuid, uuid, double precision, double precision, text, text, text) TO service_role;
