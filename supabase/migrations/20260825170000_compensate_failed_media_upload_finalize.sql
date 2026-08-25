-- Compensate immutable R2 copies when upload finalization fails after the copy.

ALTER TABLE public.media_deletion_jobs
  DROP CONSTRAINT media_deletion_jobs_reason_check,
  ADD CONSTRAINT media_deletion_jobs_reason_check CHECK (reason IN (
    'account_deleted', 'published_submission_deleted', 'admin_image_deleted',
    'draft_image_deleted', 'unassociated_upload_deleted', 'image_hard_deleted',
    'source_replaced', 'staging_replaced', 'reconciled_orphan',
    'upload_finalize_failed'
  ));

CREATE FUNCTION public.enqueue_failed_media_upload_copy_cleanup(
  p_image_id uuid,
  p_staging_key text,
  p_immutable_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  caller_role text := auth.role();
  image_row public.images%ROWTYPE;
  cleanup_job_id uuid;
BEGIN
  IF current_user_id IS NULL AND caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO image_row
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;
  IF caller_role <> 'service_role' AND image_row.created_by IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF image_row.original_key = p_immutable_key THEN
    RETURN NULL;
  END IF;
  IF image_row.storage_provider IS DISTINCT FROM 'r2'
    OR image_row.original_bucket IS NULL
    OR image_row.processing_status IS DISTINCT FROM 'pending'
    OR image_row.status IS DISTINCT FROM 'pending'
    OR image_row.original_key IS DISTINCT FROM p_staging_key
    OR p_staging_key !~ ('^images/staging/' || p_image_id::text || '/.+$')
    OR p_immutable_key !~ (
      '^images/assets/' || p_image_id::text || '/[0-9a-f]{64}/original[.][a-z0-9]+$'
    ) THEN
    RAISE EXCEPTION 'Upload copy is no longer safe to compensate' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.images AS referenced
    WHERE referenced.original_key = p_immutable_key
       OR referenced.storage_path = p_immutable_key
       OR referenced.optimized_key = p_immutable_key
  ) OR EXISTS (
    SELECT 1
    FROM public.media_jobs AS job
    WHERE job.payload->>'originalKey' = p_immutable_key
  ) THEN
    RAISE EXCEPTION 'Immutable upload copy acquired a database reference' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.media_deletion_jobs (
    bucket, object_key, reason, source_type, source_id, image_id, run_at
  ) VALUES (
    image_row.original_bucket, p_immutable_key, 'upload_finalize_failed',
    'image', image_row.id, image_row.id, now() + interval '24 hours'
  )
  ON CONFLICT (bucket, object_key) WHERE status IN ('queued', 'processing')
  DO NOTHING
  RETURNING id INTO cleanup_job_id;

  IF cleanup_job_id IS NULL THEN
    SELECT id INTO cleanup_job_id
    FROM public.media_deletion_jobs
    WHERE bucket = image_row.original_bucket
      AND object_key = p_immutable_key
      AND reason = 'upload_finalize_failed'
      AND status IN ('queued', 'processing')
    ORDER BY created_at, id
    LIMIT 1;
  END IF;
  IF cleanup_job_id IS NULL THEN
    RAISE EXCEPTION 'Conflicting immutable upload cleanup exists' USING ERRCODE = '40001';
  END IF;

  RETURN cleanup_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_media_upload(
  p_image_id uuid,
  p_original_key text,
  p_checksum_sha256 text
)
RETURNS public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  image_row public.images%ROWTYPE;
  ingest_job public.media_jobs%ROWTYPE;
  cleanup_job public.media_deletion_jobs%ROWTYPE;
  staging_key text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_checksum_sha256 !~ '^[0-9a-fA-F]{64}$'
    OR p_original_key !~ ('^images/(staging|assets|originals)/' || p_image_id::text || '/.+$') THEN
    RAISE EXCEPTION 'Invalid upload locator or checksum' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO image_row FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002'; END IF;
  IF image_row.created_by IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF image_row.storage_provider IS DISTINCT FROM 'r2'
    OR image_row.original_bucket IS NULL OR image_row.upload_purpose IS NULL THEN
    RAISE EXCEPTION 'Invalid upload session' USING ERRCODE = '22023';
  END IF;
  IF image_row.processing_status IN ('queued', 'processing', 'ready') THEN
    SELECT * INTO ingest_job FROM public.media_jobs
    WHERE image_id = image_row.id AND job_type = 'ingest_image'
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND AND image_row.original_key = p_original_key THEN RETURN ingest_job; END IF;
  END IF;

  SELECT * INTO cleanup_job
  FROM public.media_deletion_jobs
  WHERE bucket = image_row.original_bucket
    AND object_key = p_original_key
    AND reason = 'upload_finalize_failed'
    AND status IN ('queued', 'processing')
  ORDER BY created_at, id
  FOR UPDATE
  LIMIT 1;
  IF FOUND THEN
    IF cleanup_job.status = 'processing' THEN
      RAISE EXCEPTION 'Immutable upload cleanup is already processing' USING ERRCODE = '40001';
    END IF;
    UPDATE public.media_deletion_jobs
    SET status = 'cancelled', last_error = 'Upload finalization retry committed the object'
    WHERE id = cleanup_job.id AND status = 'queued';
  END IF;

  staging_key := image_row.original_key;
  IF staging_key IS DISTINCT FROM p_original_key
    AND staging_key ~ ('^images/staging/' || p_image_id::text || '/')
    AND p_original_key ~ ('^images/(assets|originals)/' || p_image_id::text || '/') THEN
    PERFORM public.enqueue_media_deletion_job(
      image_row.original_bucket, staging_key, 'staging_replaced', 'image', image_row.id, image_row.id
    );
  END IF;
  UPDATE public.images
  SET original_key = p_original_key,
      storage_path = p_original_key,
      checksum_sha256 = lower(p_checksum_sha256)
  WHERE id = image_row.id;
  SELECT * INTO ingest_job FROM public.queue_media_ingest_job(
    image_row.id, image_row.original_bucket, p_original_key, 'r2',
    image_row.upload_purpose, uid, 'upload', false
  );
  RETURN ingest_job;
END;
$$;

ALTER FUNCTION public.enqueue_failed_media_upload_copy_cleanup(uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.finalize_media_upload(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_failed_media_upload_copy_cleanup(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_failed_media_upload_copy_cleanup(uuid, text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_media_upload(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_media_upload(uuid, text, text)
  TO authenticated, service_role;
