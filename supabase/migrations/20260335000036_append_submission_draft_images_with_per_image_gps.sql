CREATE OR REPLACE FUNCTION public.append_submission_draft_images_atomic(
  p_draft_id UUID,
  p_images JSONB,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $append_submission_draft_images_atomic$
DECLARE
  current_user_id UUID := auth.uid();
  owner_user_id UUID;
  current_status TEXT;
  current_updated_at TIMESTAMPTZ;
  next_display_order INTEGER := 0;
  payload_count INTEGER := 0;
  has_access BOOLEAN := false;
  updated_at_value TIMESTAMPTZ;
  appended_image_ids UUID[] := '{}';
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_draft_id IS NULL THEN
    RAISE EXCEPTION 'Draft ID is required';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Expected updated_at is required';
  END IF;

  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' OR jsonb_array_length(p_images) = 0 THEN
    RAISE EXCEPTION 'images payload must be a non-empty array';
  END IF;

  SELECT user_id, status, updated_at
  INTO owner_user_id, current_status, current_updated_at
  FROM public.submission_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Draft not found';
  END IF;

  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft submissions can be updated';
  END IF;

  SELECT (
    owner_user_id = current_user_id
    OR public.is_submission_draft_collaborator(p_draft_id, current_user_id)
  )
  INTO has_access;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF date_trunc('milliseconds', current_updated_at) <> date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'Draft conflict';
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1
  INTO next_display_order
  FROM public.submission_draft_images
  WHERE draft_id = p_draft_id;

  WITH payload AS (
    SELECT
      (item->>'storage_bucket')::TEXT AS storage_bucket,
      (item->>'storage_path')::TEXT AS storage_path,
      COALESCE((item->>'width')::INTEGER, NULL) AS width,
      COALESCE((item->>'height')::INTEGER, NULL) AS height,
      NULLIF(item->'gps_data'->>'latitude', '')::NUMERIC AS latitude,
      NULLIF(item->'gps_data'->>'longitude', '')::NUMERIC AS longitude,
      NULLIF(item->>'capture_date', '')::TIMESTAMPTZ AS capture_date,
      COALESCE(item->'route_data', '{}'::JSONB) AS route_data,
      ordinality - 1 AS offset_index
    FROM jsonb_array_elements(p_images) WITH ORDINALITY AS item(item, ordinality)
  ),
  inserted AS (
    INSERT INTO public.submission_draft_images (
      draft_id,
      display_order,
      storage_bucket,
      storage_path,
      width,
      height,
      latitude,
      longitude,
      capture_date,
      route_data
    )
    SELECT
      p_draft_id,
      next_display_order + payload.offset_index,
      payload.storage_bucket,
      payload.storage_path,
      payload.width,
      payload.height,
      payload.latitude,
      payload.longitude,
      payload.capture_date,
      payload.route_data
    FROM payload
    RETURNING id
  )
  SELECT COUNT(*), ARRAY_AGG(id)
  INTO payload_count, appended_image_ids
  FROM inserted;

  IF payload_count = 0 THEN
    RAISE EXCEPTION 'No images appended';
  END IF;

  UPDATE public.submission_drafts
  SET
    updated_at = NOW(),
    last_edited_by = current_user_id
  WHERE id = p_draft_id
  RETURNING updated_at INTO updated_at_value;

  RETURN jsonb_build_object(
    'draft_id', p_draft_id,
    'updated_at', updated_at_value,
    'appended_image_ids', appended_image_ids,
    'images', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'display_order', display_order,
          'route_data', route_data,
          'storage_bucket', storage_bucket,
          'storage_path', storage_path,
          'width', width,
          'height', height,
          'latitude', latitude,
          'longitude', longitude,
          'capture_date', capture_date,
          'updated_at', updated_at
        )
        ORDER BY display_order
      )
      FROM public.submission_draft_images
      WHERE draft_id = p_draft_id
    )
  );
END;
$append_submission_draft_images_atomic$;
