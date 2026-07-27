CREATE OR REPLACE FUNCTION public.queue_media_ingest_job(
  p_image_id uuid,
  p_original_bucket text,
  p_original_key text,
  p_storage_provider text,
  p_purpose text,
  p_triggered_by_user_id uuid,
  p_trigger text DEFAULT 'upload',
  p_auto_approve boolean DEFAULT true
) RETURNS public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  caller_role text := auth.role();
  image_row public.images%ROWTYPE;
  active_job public.media_jobs%ROWTYPE;
  active_job_found boolean := false;
  ingest_payload jsonb;
BEGIN
  IF caller_role <> 'service_role' AND current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_storage_provider <> 'r2' THEN
    RAISE EXCEPTION 'Unsupported media storage provider' USING ERRCODE = '22023';
  END IF;

  IF p_purpose NOT IN ('submission_image', 'draft_image', 'crag_image') THEN
    RAISE EXCEPTION 'Invalid media upload purpose' USING ERRCODE = '22023';
  END IF;

  IF p_trigger NOT IN ('upload', 'backfill') THEN
    RAISE EXCEPTION 'Invalid media ingest trigger' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO image_row
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;

  IF caller_role <> 'service_role' AND image_row.created_by IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Validate caller-supplied metadata against the authoritative image row
  IF caller_role <> 'service_role' AND (
    p_original_bucket IS DISTINCT FROM image_row.original_bucket
    OR p_original_key IS DISTINCT FROM image_row.original_key
    OR p_triggered_by_user_id IS DISTINCT FROM current_user_id
    OR p_auto_approve
  ) THEN
    RAISE EXCEPTION 'Invalid ingest metadata' USING ERRCODE = '42501';
  END IF;

  IF image_row.processing_status = 'ready' THEN
    SELECT *
    INTO active_job
    FROM public.media_jobs
    WHERE image_id = p_image_id
      AND job_type = 'ingest_image'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN active_job;
    END IF;

    INSERT INTO public.media_jobs (image_id, job_type, status, payload, attempts, max_attempts, run_at)
    VALUES (p_image_id, 'ingest_image', 'completed', '{}'::jsonb, 0, 5, now())
    RETURNING * INTO active_job;

    RETURN active_job;
  END IF;

  SELECT *
  INTO active_job
  FROM public.media_jobs
  WHERE image_id = p_image_id
    AND job_type = 'ingest_image'
    AND status IN ('queued', 'processing')
  ORDER BY created_at DESC
  LIMIT 1;

  active_job_found := FOUND;

  -- Build ingest payload from authoritative image row, not caller-supplied params
  ingest_payload := jsonb_build_object(
    'imageId', image_row.id,
    'originalBucket', image_row.original_bucket,
    'originalKey', image_row.original_key,
    'storageProvider', p_storage_provider,
    'purpose', p_purpose,
    'triggeredByUserId', image_row.created_by,
    'trigger', p_trigger
  );

  -- Update image row with moderation and processing state in the same transaction
  UPDATE public.images
  SET
    visibility = CASE WHEN p_auto_approve THEN 'public' ELSE 'private' END,
    moderation_status = CASE WHEN p_auto_approve THEN 'approved' ELSE 'pending' END,
    moderation_provider = 'disabled',
    moderation_error = NULL,
    moderation_labels = '[]'::jsonb,
    moderated_at = NULL,
    processing_status = 'queued',
    status = CASE WHEN p_auto_approve THEN 'approved' ELSE 'pending' END
  WHERE id = p_image_id;

  IF active_job_found THEN
    UPDATE public.media_jobs
    SET
      payload = ingest_payload,
      run_at = LEAST(run_at, now()),
      last_error = NULL,
      updated_at = now()
    WHERE id = active_job.id
    RETURNING * INTO active_job;

    RETURN active_job;
  END IF;

  INSERT INTO public.media_jobs (image_id, job_type, status, payload, attempts, max_attempts, run_at)
  VALUES (p_image_id, 'ingest_image', 'queued', ingest_payload, 0, 5, now())
  RETURNING * INTO active_job;

  RETURN active_job;
END;
$$;

ALTER FUNCTION public.queue_media_ingest_job(uuid, text, text, text, text, uuid, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.queue_media_ingest_job(uuid, text, text, text, text, uuid, text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.queue_media_ingest_job(uuid, text, text, text, text, uuid, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.queue_media_ingest_job(uuid, text, text, text, text, uuid, text, boolean) TO service_role;