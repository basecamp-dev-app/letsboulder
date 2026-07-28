CREATE TABLE public.media_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  object_key text NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  image_id uuid,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  claim_token uuid,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_deletion_jobs_bucket_check CHECK (char_length(btrim(bucket)) > 0),
  CONSTRAINT media_deletion_jobs_object_key_check CHECK (char_length(btrim(object_key)) > 0),
  CONSTRAINT media_deletion_jobs_reason_check CHECK (reason IN (
    'account_deleted',
    'published_submission_deleted',
    'admin_image_deleted',
    'draft_image_deleted',
    'unassociated_upload_deleted',
    'image_hard_deleted'
  )),
  CONSTRAINT media_deletion_jobs_source_type_check CHECK (source_type IN ('image', 'draft_image')),
  CONSTRAINT media_deletion_jobs_status_check CHECK (status IN (
    'queued', 'processing', 'completed', 'failed', 'cancelled'
  )),
  CONSTRAINT media_deletion_jobs_attempts_check CHECK (attempts >= 0 AND attempts <= max_attempts),
  CONSTRAINT media_deletion_jobs_max_attempts_check CHECK (max_attempts > 0),
  CONSTRAINT media_deletion_jobs_lock_check CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL AND claim_token IS NOT NULL)
    OR (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL AND claim_token IS NULL)
  ),
  CONSTRAINT media_deletion_jobs_completion_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX media_deletion_jobs_claim_idx
  ON public.media_deletion_jobs (run_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX media_deletion_jobs_processing_lease_idx
  ON public.media_deletion_jobs (locked_at)
  WHERE status = 'processing';
CREATE INDEX media_deletion_jobs_source_idx
  ON public.media_deletion_jobs (source_type, source_id, created_at DESC)
  WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX media_deletion_jobs_active_object_idx
  ON public.media_deletion_jobs (bucket, object_key)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.media_deletion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages media deletion jobs"
  ON public.media_deletion_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON TABLE public.media_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_deletion_jobs TO service_role;

CREATE FUNCTION public.touch_media_deletion_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER media_deletion_jobs_touch_updated_at
BEFORE UPDATE ON public.media_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_media_deletion_jobs_updated_at();

CREATE FUNCTION public.enqueue_media_deletion_job(
  p_bucket text,
  p_object_key text,
  p_reason text,
  p_source_type text,
  p_source_id uuid,
  p_image_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  queued_id uuid;
BEGIN
  IF NULLIF(btrim(p_bucket), '') IS NULL OR NULLIF(btrim(p_object_key), '') IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.media_deletion_jobs (
    bucket, object_key, reason, source_type, source_id, image_id
  ) VALUES (
    btrim(p_bucket), btrim(p_object_key), p_reason, p_source_type, p_source_id, p_image_id
  )
  ON CONFLICT (bucket, object_key) WHERE status IN ('queued', 'processing')
  DO NOTHING
  RETURNING id INTO queued_id;

  IF queued_id IS NULL THEN
    SELECT id INTO queued_id
    FROM public.media_deletion_jobs
    WHERE bucket = btrim(p_bucket)
      AND object_key = btrim(p_object_key)
      AND status IN ('queued', 'processing')
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  RETURN queued_id;
END;
$$;

CREATE FUNCTION public.capture_image_media_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deletion_reason text;
  deletion_key text := COALESCE(OLD.original_key, OLD.storage_path);
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'deleted' AND NEW.status IS DISTINCT FROM 'deleted' THEN
    RAISE EXCEPTION 'Deleted images cannot be restored';
  END IF;

  IF OLD.storage_provider IS DISTINCT FROM 'r2' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'deleted' OR NEW.status IS DISTINCT FROM 'deleted' THEN
      RETURN NEW;
    END IF;

    IF OLD.created_by IS NOT NULL
      AND NEW.created_by IS NULL
      AND EXISTS (
        SELECT 1 FROM public.deleted_accounts da
        WHERE da.user_id = OLD.created_by AND da.delete_route_uploads
      ) THEN
      deletion_reason := 'account_deleted';
    ELSIF auth.role() = 'service_role' THEN
      deletion_reason := 'published_submission_deleted';
    ELSE
      deletion_reason := 'admin_image_deleted';
    END IF;
  ELSE
    IF OLD.created_by IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.deleted_accounts da
      WHERE da.user_id = OLD.created_by AND da.delete_route_uploads
    ) THEN
      deletion_reason := 'account_deleted';
    ELSE
      deletion_reason := 'image_hard_deleted';
    END IF;
  END IF;

  -- R2 upload keys are namespaced by the authoritative image UUID. Never let
  -- caller-controlled row metadata authorize deletion of another image's key.
  IF deletion_key IS NULL OR deletion_key !~ (
    '^images/(staging|assets|originals)/' || OLD.id::text || '/'
  ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  UPDATE public.media_jobs
  SET status = 'cancelled', locked_at = NULL, locked_by = NULL,
      last_error = 'Image deleted before ingest completed'
  WHERE image_id = OLD.id AND status IN ('queued', 'processing');

  PERFORM public.enqueue_media_deletion_job(
    COALESCE(OLD.original_bucket, OLD.storage_bucket),
    deletion_key,
    deletion_reason,
    'image',
    OLD.id,
    OLD.id
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER images_capture_media_deletion
BEFORE UPDATE OF status OR DELETE ON public.images
FOR EACH ROW EXECUTE FUNCTION public.capture_image_media_deletion();

CREATE FUNCTION public.claim_media_deletion_job(
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
    WHERE (candidate.status = 'queued'
        AND candidate.attempts < candidate.max_attempts
        AND candidate.run_at <= now())
      OR (candidate.status = 'processing'
        AND candidate.attempts < candidate.max_attempts
        AND candidate.locked_at < now() - make_interval(secs => lease_seconds))
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

CREATE FUNCTION public.complete_media_deletion_job(p_job_id uuid, p_claim_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.media_deletion_jobs
  SET status = 'completed', locked_at = NULL, locked_by = NULL, claim_token = NULL,
      last_error = NULL, completed_at = now()
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media deletion job claim is no longer active' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE FUNCTION public.retry_media_deletion_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.media_deletion_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.media_deletion_jobs
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media deletion job claim is no longer active' USING ERRCODE = '40001';
  END IF;

  IF target.attempts >= target.max_attempts THEN
    UPDATE public.media_deletion_jobs
    SET status = 'failed', locked_at = NULL, locked_by = NULL, claim_token = NULL,
        last_error = left(COALESCE(p_error, 'Unknown deletion error'), 2000)
    WHERE id = target.id;
  ELSE
    UPDATE public.media_deletion_jobs
    SET status = 'queued', locked_at = NULL, locked_by = NULL, claim_token = NULL,
        last_error = left(COALESCE(p_error, 'Unknown deletion error'), 2000),
        run_at = now() + make_interval(secs => LEAST(3600, 60 * (2 ^ GREATEST(target.attempts - 1, 0))::integer)
          + floor(random() * 31)::integer)
    WHERE id = target.id;
  END IF;
END;
$$;

CREATE FUNCTION public.fail_media_deletion_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.media_deletion_jobs
  SET status = 'failed', locked_at = NULL, locked_by = NULL, claim_token = NULL,
      last_error = left(COALESCE(p_error, 'Invalid media deletion job'), 2000)
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media deletion job claim is no longer active' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE FUNCTION public.prune_media_deletion_jobs(
  retention_days integer DEFAULT 30,
  max_delete integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF retention_days < 1 OR max_delete < 1 OR max_delete > 5000 THEN
    RAISE EXCEPTION 'Invalid media deletion retention limits';
  END IF;

  DELETE FROM public.media_deletion_jobs
  WHERE id IN (
    SELECT id FROM public.media_deletion_jobs
    WHERE status IN ('completed', 'cancelled')
      AND updated_at < now() - make_interval(days => retention_days)
    ORDER BY updated_at, id
    LIMIT max_delete
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_media_deletion_jobs_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_media_deletion_job(text, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.capture_image_media_deletion() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_media_deletion_job(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_media_deletion_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_media_deletion_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_media_deletion_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_media_deletion_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_media_deletion_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_media_deletion_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_media_deletion_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_media_deletion_job(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_media_deletion_jobs(integer, integer) TO service_role;
