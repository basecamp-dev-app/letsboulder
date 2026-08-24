-- Preserve authoritative image identity when upload-session media is attached
-- to a draft, and recover only exact ownership-safe links during canonical
-- processing. Existing legacy/path-only rows remain nullable and fail closed.

CREATE OR REPLACE FUNCTION public.append_submission_draft_images_atomic(
  p_draft_id uuid,
  p_images jsonb,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  owner_user_id uuid;
  current_status text;
  current_updated_at timestamptz;
  next_display_order integer := 0;
  payload_count integer := 0;
  has_access boolean := false;
  updated_at_value timestamptz;
  appended_image_ids uuid[] := '{}';
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
  ) INTO has_access;

  IF COALESCE(has_access, false) = false THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF date_trunc('milliseconds', current_updated_at)
    <> date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'Draft conflict';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_images) AS payload(item)
    WHERE NULLIF(payload.item->>'linked_image_id', '') IS NULL
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Uploaded image record is required',
      DETAIL = 'media_association_broken',
      ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_images) AS payload(item)
    LEFT JOIN public.images AS image
      ON image.id = (payload.item->>'linked_image_id')::uuid
    WHERE image.id IS NULL
      OR image.created_by IS DISTINCT FROM current_user_id
      OR NOT (
        (image.original_bucket = payload.item->>'storage_bucket'
          AND image.original_key = payload.item->>'storage_path')
        OR (image.storage_bucket = payload.item->>'storage_bucket'
          AND image.storage_path = payload.item->>'storage_path')
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Uploaded image record does not match its owner and locator',
      DETAIL = 'media_association_broken',
      ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(display_order), -1) + 1
  INTO next_display_order
  FROM public.submission_draft_images
  WHERE draft_id = p_draft_id;

  WITH payload AS (
    SELECT
      (item->>'storage_bucket')::text AS storage_bucket,
      (item->>'storage_path')::text AS storage_path,
      (item->>'linked_image_id')::uuid AS linked_image_id,
      NULLIF(item->>'width', '')::integer AS width,
      NULLIF(item->>'height', '')::integer AS height,
      NULLIF(item->'gps_data'->>'latitude', '')::numeric AS latitude,
      NULLIF(item->'gps_data'->>'longitude', '')::numeric AS longitude,
      NULLIF(item->>'capture_date', '')::timestamptz AS capture_date,
      COALESCE(item->'route_data', '{}'::jsonb) AS route_data,
      ordinality - 1 AS offset_index
    FROM jsonb_array_elements(p_images) WITH ORDINALITY AS item(item, ordinality)
  ),
  inserted AS (
    INSERT INTO public.submission_draft_images (
      draft_id,
      display_order,
      storage_bucket,
      storage_path,
      linked_image_id,
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
      payload.linked_image_id,
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
  SET updated_at = now(), last_edited_by = current_user_id
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
        ) ORDER BY display_order
      )
      FROM public.submission_draft_images
      WHERE draft_id = p_draft_id
    )
  );
END;
$$;

ALTER FUNCTION public.append_submission_draft_images_atomic(uuid, jsonb, timestamptz)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.append_submission_draft_images_atomic(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_submission_draft_images_atomic(uuid, jsonb, timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.link_submission_draft_image_upload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  payload_image_id uuid;
  path_match text[];
BEGIN
  IF NEW.linked_image_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  path_match := regexp_match(
    NEW.storage_path,
    '^images/(?:originals|assets)/([0-9a-fA-F-]{36})/'
  );
  IF path_match IS NULL THEN
    RETURN NEW;
  END IF;
  payload_image_id := path_match[1]::uuid;

  SELECT image.id INTO NEW.linked_image_id
  FROM public.images AS image
  WHERE image.id = payload_image_id
    AND image.created_by = auth.uid()
    AND (
      (image.original_bucket = NEW.storage_bucket AND image.original_key = NEW.storage_path)
      OR (image.storage_bucket = NEW.storage_bucket AND image.storage_path = NEW.storage_path)
    );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.link_submission_draft_image_upload() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.commit_media_webp(
  p_image_id uuid,
  p_expected_original_bucket text,
  p_expected_original_key text,
  p_optimized_bucket text,
  p_optimized_key text,
  p_optimized_mime text,
  p_optimized_bytes bigint,
  p_optimized_width integer,
  p_optimized_height integer,
  p_manifest jsonb,
  p_url text,
  p_media_job_id uuid,
  p_claim_token uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  j public.media_jobs%ROWTYPE;
  image_row public.images%ROWTYPE;
  result uuid;
  locator_is_unambiguous boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO j
  FROM public.media_jobs
  WHERE id = p_media_job_id
    AND image_id = p_image_id
    AND status = 'processing'
    AND claim_token = p_claim_token
    AND lease_expires_at >= now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001';
  END IF;

  IF p_optimized_mime <> 'image/webp'
    OR p_optimized_bytes <= 0
    OR p_optimized_width <= 0
    OR p_optimized_height <= 0
    OR jsonb_typeof(p_manifest) <> 'object'
    OR p_optimized_bucket IS DISTINCT FROM p_expected_original_bucket
    OR p_optimized_key !~ ('^images/assets/' || p_image_id::text || '/[0-9a-fA-F]{64}/[^/]+[.]webp$')
    OR p_expected_original_key !~ ('^images/(staging|assets|originals)/' || p_image_id::text || '/') THEN
    RAISE EXCEPTION 'Invalid canonical WebP metadata' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO image_row
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;
  IF NOT FOUND OR image_row.status = 'deleted'
    OR image_row.original_bucket IS DISTINCT FROM p_expected_original_bucket
    OR image_row.original_key IS DISTINCT FROM p_expected_original_key THEN
    RAISE EXCEPTION 'Stale image source' USING ERRCODE = '40001';
  END IF;

  IF image_row.optimized_key IS NOT NULL THEN
    SELECT id INTO result
    FROM public.media_deletion_jobs
    WHERE image_id = p_image_id AND reason = 'source_replaced'
    ORDER BY created_at, id
    LIMIT 1;
    IF result IS NULL THEN
      RAISE EXCEPTION 'Canonical WebP commit is missing its deletion job' USING ERRCODE = '55000';
    END IF;
    RETURN result;
  END IF;

  SELECT count(*) = 1 INTO locator_is_unambiguous
  FROM public.images AS candidate
  WHERE (candidate.original_bucket, candidate.original_key)
      = (p_expected_original_bucket, p_expected_original_key)
     OR (candidate.storage_bucket, candidate.storage_path)
      = (p_expected_original_bucket, p_expected_original_key);

  result := public.enqueue_media_deletion_job(
    p_expected_original_bucket,
    p_expected_original_key,
    'source_replaced',
    'image',
    p_image_id,
    p_image_id
  );

  UPDATE public.images
  SET optimized_bucket = p_optimized_bucket,
      optimized_key = p_optimized_key,
      optimized_mime = p_optimized_mime,
      optimized_bytes = p_optimized_bytes,
      optimized_width = p_optimized_width,
      optimized_height = p_optimized_height,
      storage_bucket = p_optimized_bucket,
      storage_path = p_optimized_key,
      variants = p_manifest,
      url = p_url,
      processing_status = 'ready',
      status = 'approved',
      visibility = 'public',
      moderation_status = 'skipped',
      moderation_provider = 'disabled',
      moderation_error = NULL,
      moderation_labels = '[]'::jsonb,
      original_deletion_queued_at = now(),
      processed_at = now()
  WHERE id = p_image_id;

  UPDATE public.submission_draft_images AS draft_image
  SET storage_bucket = p_optimized_bucket,
      storage_path = p_optimized_key,
      width = p_optimized_width,
      height = p_optimized_height,
      processing_status = 'ready',
      linked_image_id = COALESCE(draft_image.linked_image_id, p_image_id)
  FROM public.submission_drafts AS draft
  WHERE draft.id = draft_image.draft_id
    AND (
      draft_image.linked_image_id = p_image_id
      OR (
        draft_image.linked_image_id IS NULL
        AND locator_is_unambiguous
        AND draft_image.storage_bucket = p_expected_original_bucket
        AND draft_image.storage_path = p_expected_original_key
        AND NOT EXISTS (
          SELECT 1
          FROM public.submission_draft_images AS existing_link
          WHERE existing_link.draft_id = draft_image.draft_id
            AND existing_link.linked_image_id = p_image_id
        )
        AND (
          draft.user_id = image_row.created_by
          OR public.is_submission_draft_collaborator(draft.id, image_row.created_by)
        )
      )
    );

  UPDATE public.crag_images
  SET url = 'private://' || p_optimized_bucket || '/' || p_optimized_key,
      width = p_optimized_width,
      height = p_optimized_height
  WHERE linked_image_id = p_image_id
     OR source_image_id = p_image_id
     OR url = 'private://' || p_expected_original_bucket || '/' || p_expected_original_key;

  RETURN result;
END;
$$;

ALTER FUNCTION public.commit_media_webp(
  uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text, uuid, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.commit_media_webp(
  uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_media_webp(
  uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text, uuid, uuid
) TO service_role;
