ALTER TABLE public.media_deletion_jobs
  ADD COLUMN delivery_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_media_deletion_job(
  worker_name text,
  lease_seconds integer DEFAULT 900
)
RETURNS public.media_deletion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.media_deletion_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(worker_name), '') IS NULL THEN
    RAISE EXCEPTION 'Worker name is required';
  END IF;
  IF lease_seconds < 60 OR lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Lease must be between 60 and 3600 seconds';
  END IF;

  UPDATE public.media_deletion_jobs
  SET status = 'failed', locked_at = NULL, locked_by = NULL, claim_token = NULL,
      last_error = 'Processing lease expired after final attempt'
  WHERE status = 'processing'
    AND attempts >= max_attempts
    AND locked_at < now() - make_interval(secs => lease_seconds);

  UPDATE public.media_deletion_jobs AS job
  SET status = 'processing',
      attempts = LEAST(job.attempts + 1, job.max_attempts),
      locked_at = now(),
      locked_by = btrim(worker_name),
      claim_token = gen_random_uuid(),
      last_error = CASE WHEN job.status = 'processing' THEN 'Previous processing lease expired' ELSE job.last_error END
  WHERE job.id = (
    SELECT candidate.id
    FROM public.media_deletion_jobs AS candidate
    WHERE (candidate.reason <> 'source_replaced' OR candidate.delivery_verified_at IS NOT NULL)
      AND ((candidate.status = 'queued'
          AND candidate.attempts < candidate.max_attempts
          AND candidate.run_at <= now())
        OR (candidate.status = 'processing'
          AND candidate.attempts < candidate.max_attempts
          AND candidate.locked_at < now() - make_interval(secs => lease_seconds)))
    ORDER BY
      CASE WHEN candidate.status = 'processing' THEN 0 ELSE 1 END,
      candidate.run_at,
      candidate.created_at,
      candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING job.* INTO claimed;

  RETURN claimed;
END;
$$;

CREATE FUNCTION public.verify_media_replacement_delivery(
  p_job_id uuid,
  p_expected_optimized_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row public.media_deletion_jobs%ROWTYPE;
  image_row public.images%ROWTYPE;
  original_url text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_expected_optimized_key), '') IS NULL THEN
    RAISE EXCEPTION 'Expected optimized key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO job_row
  FROM public.media_deletion_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR job_row.reason IS DISTINCT FROM 'source_replaced'
    OR job_row.image_id IS NULL THEN
    RAISE EXCEPTION 'Source replacement job not found' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO image_row
  FROM public.images
  WHERE id = job_row.image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  IF image_row.original_bucket IS DISTINCT FROM job_row.bucket
    OR image_row.original_key IS DISTINCT FROM job_row.object_key THEN
    RAISE EXCEPTION 'Source replacement job does not match image original' USING ERRCODE = '40001';
  END IF;
  IF image_row.optimized_key IS DISTINCT FROM btrim(p_expected_optimized_key)
    OR image_row.storage_path IS DISTINCT FROM btrim(p_expected_optimized_key)
    OR image_row.optimized_bucket IS DISTINCT FROM job_row.bucket
    OR image_row.storage_bucket IS DISTINCT FROM job_row.bucket THEN
    RAISE EXCEPTION 'Canonical delivery locator mismatch' USING ERRCODE = '40001';
  END IF;

  original_url := 'private://' || job_row.bucket || '/' || job_row.object_key;
  IF EXISTS (
    SELECT 1 FROM public.submission_draft_images
    WHERE storage_bucket = job_row.bucket AND storage_path = job_row.object_key
  ) OR EXISTS (
    SELECT 1 FROM public.crag_images WHERE url = original_url
  ) THEN
    RAISE EXCEPTION 'Original media locator is still referenced' USING ERRCODE = '55000';
  END IF;

  IF job_row.delivery_verified_at IS NULL THEN
    IF job_row.status IS DISTINCT FROM 'queued' THEN
      RAISE EXCEPTION 'Source replacement job is not awaiting verification' USING ERRCODE = '55000';
    END IF;
    UPDATE public.media_deletion_jobs
    SET delivery_verified_at = now()
    WHERE id = job_row.id;
  END IF;
END;
$$;

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
  p_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  image_row public.images%ROWTYPE;
  deletion_job_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_expected_original_bucket), '') IS NULL
    OR NULLIF(btrim(p_expected_original_key), '') IS NULL
    OR NULLIF(btrim(p_optimized_bucket), '') IS NULL
    OR NULLIF(btrim(p_optimized_key), '') IS NULL
    OR NULLIF(btrim(p_url), '') IS NULL
    OR p_optimized_mime IS DISTINCT FROM 'image/webp'
    OR p_optimized_bytes IS NULL OR p_optimized_bytes <= 0
    OR p_optimized_width IS NULL OR p_optimized_width <= 0
    OR p_optimized_height IS NULL OR p_optimized_height <= 0
    OR p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object' THEN
    RAISE EXCEPTION 'Invalid canonical WebP metadata' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO image_row
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  IF image_row.status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted image cannot be committed' USING ERRCODE = '55000';
  END IF;
  IF image_row.storage_provider IS DISTINCT FROM 'r2'
    OR image_row.original_bucket IS DISTINCT FROM btrim(p_expected_original_bucket)
    OR image_row.original_key IS DISTINCT FROM btrim(p_expected_original_key) THEN
    RAISE EXCEPTION 'Stale image source' USING ERRCODE = '40001';
  END IF;
  IF btrim(p_optimized_bucket) IS DISTINCT FROM image_row.original_bucket THEN
    RAISE EXCEPTION 'Canonical WebP must use the private media bucket' USING ERRCODE = '22023';
  END IF;
  IF btrim(p_optimized_key) !~ (
    '^images/assets/' || p_image_id::text || '/[0-9a-fA-F]{64}/[^/]+[.]webp$'
  ) OR btrim(p_optimized_key) = btrim(p_expected_original_key) THEN
    RAISE EXCEPTION 'Invalid immutable derivative locator' USING ERRCODE = '22023';
  END IF;

  IF image_row.optimized_bucket IS NOT NULL THEN
    IF image_row.optimized_bucket IS DISTINCT FROM btrim(p_optimized_bucket)
      OR image_row.optimized_key IS DISTINCT FROM btrim(p_optimized_key)
      OR image_row.optimized_mime IS DISTINCT FROM p_optimized_mime
      OR image_row.optimized_bytes IS DISTINCT FROM p_optimized_bytes
      OR image_row.optimized_width IS DISTINCT FROM p_optimized_width
      OR image_row.optimized_height IS DISTINCT FROM p_optimized_height
      OR image_row.variants IS DISTINCT FROM p_manifest
      OR image_row.url IS DISTINCT FROM btrim(p_url)
      OR image_row.processing_status IS DISTINCT FROM 'ready'
      OR image_row.original_deletion_queued_at IS NULL THEN
      RAISE EXCEPTION 'Conflicting canonical WebP replay' USING ERRCODE = '40001';
    END IF;

    SELECT id INTO deletion_job_id
    FROM public.media_deletion_jobs
    WHERE image_id = image_row.id
      AND bucket = image_row.original_bucket
      AND object_key = image_row.original_key
      AND reason = 'source_replaced'
    ORDER BY created_at, id
    LIMIT 1;

    IF deletion_job_id IS NULL THEN
      RAISE EXCEPTION 'Canonical WebP commit is missing its deletion job' USING ERRCODE = '55000';
    END IF;
    RETURN deletion_job_id;
  END IF;

  deletion_job_id := public.enqueue_media_deletion_job(
    image_row.original_bucket,
    image_row.original_key,
    'source_replaced',
    'image',
    image_row.id,
    image_row.id
  );

  IF deletion_job_id IS NULL THEN
    RAISE EXCEPTION 'Could not enqueue source deletion' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.media_deletion_jobs
    WHERE id = deletion_job_id
      AND image_id = image_row.id
      AND reason = 'source_replaced'
      AND bucket = image_row.original_bucket
      AND object_key = image_row.original_key
  ) THEN
    RAISE EXCEPTION 'Original already has conflicting deletion work' USING ERRCODE = '40001';
  END IF;

  UPDATE public.images
  SET optimized_bucket = btrim(p_optimized_bucket),
      optimized_key = btrim(p_optimized_key),
      optimized_mime = p_optimized_mime,
      optimized_bytes = p_optimized_bytes,
      optimized_width = p_optimized_width,
      optimized_height = p_optimized_height,
      storage_bucket = btrim(p_optimized_bucket),
      storage_path = btrim(p_optimized_key),
      variants = p_manifest,
      url = btrim(p_url),
      visibility = 'public',
      moderation_status = 'skipped',
      moderation_provider = 'disabled',
      moderation_labels = '[]'::jsonb,
      moderation_error = NULL,
      moderated_at = NULL,
      processing_status = 'ready',
      status = 'approved',
      processed_at = now(),
      original_deletion_queued_at = now()
  WHERE id = image_row.id;

  UPDATE public.submission_draft_images
  SET storage_bucket = btrim(p_optimized_bucket),
      storage_path = btrim(p_optimized_key),
      width = p_optimized_width,
      height = p_optimized_height,
      processing_status = 'ready'
  WHERE linked_image_id = image_row.id
    OR (storage_bucket = image_row.original_bucket
      AND storage_path = image_row.original_key);

  UPDATE public.crag_images
  SET url = 'private://' || btrim(p_optimized_bucket) || '/' || btrim(p_optimized_key),
      width = p_optimized_width,
      height = p_optimized_height
  WHERE linked_image_id = image_row.id
    OR source_image_id = image_row.id
    OR url = 'private://' || image_row.original_bucket || '/' || image_row.original_key;

  RETURN deletion_job_id;
END;
$$;

ALTER FUNCTION public.claim_media_deletion_job(text, integer) OWNER TO postgres;
ALTER FUNCTION public.verify_media_replacement_delivery(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.claim_media_deletion_job(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_media_replacement_delivery(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_media_deletion_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_media_replacement_delivery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) TO service_role;
