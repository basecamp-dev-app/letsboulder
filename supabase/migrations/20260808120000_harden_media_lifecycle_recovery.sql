-- Harden media leases, lifecycle transitions, and reviewed recovery.

ALTER TABLE public.media_jobs
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN replay_of_job_id uuid REFERENCES public.media_jobs(id),
  ADD COLUMN recovery_run_id bigint,
  ADD COLUMN recovery_artifact_digest text,
  ADD COLUMN recovery_reason text;

ALTER TABLE public.media_deletion_jobs
  ADD COLUMN replay_of_job_id uuid REFERENCES public.media_deletion_jobs(id),
  ADD COLUMN recovery_run_id bigint,
  ADD COLUMN recovery_artifact_digest text,
  ADD COLUMN recovery_reason text;

ALTER TABLE public.media_deletion_jobs
  DROP CONSTRAINT media_deletion_jobs_reason_check,
  ADD CONSTRAINT media_deletion_jobs_reason_check CHECK (reason IN (
    'account_deleted', 'published_submission_deleted', 'admin_image_deleted',
    'draft_image_deleted', 'unassociated_upload_deleted', 'image_hard_deleted',
    'source_replaced', 'staging_replaced', 'reconciled_orphan'
  ));

UPDATE public.media_jobs
SET status = 'queued', locked_at = NULL, locked_by = NULL, claim_token = NULL,
    lease_expires_at = NULL, last_error = 'Requeued by media lease migration'
WHERE status = 'processing';

UPDATE public.media_deletion_jobs
SET status = 'queued', locked_at = NULL, locked_by = NULL, claim_token = NULL,
    last_error = 'Requeued by media lease migration'
WHERE status = 'processing';

UPDATE public.media_jobs SET completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'completed';

ALTER TABLE public.media_jobs
  DROP CONSTRAINT media_jobs_attempts_check,
  ADD CONSTRAINT media_jobs_attempts_check CHECK (attempts >= 0 AND attempts <= max_attempts),
  ADD CONSTRAINT media_jobs_lock_check CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL
      AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL
      AND claim_token IS NULL AND lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT media_jobs_completion_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  ADD CONSTRAINT media_jobs_recovery_provenance_check CHECK (
    (replay_of_job_id IS NULL AND recovery_run_id IS NULL
      AND recovery_artifact_digest IS NULL AND recovery_reason IS NULL)
    OR (replay_of_job_id IS NOT NULL AND recovery_run_id > 0
      AND recovery_artifact_digest ~ '^sha256:[0-9a-f]{64}$'
      AND char_length(btrim(recovery_reason)) > 0)
  );

ALTER TABLE public.media_deletion_jobs
  ADD CONSTRAINT media_deletion_jobs_recovery_provenance_check CHECK (
    (replay_of_job_id IS NULL AND recovery_run_id IS NULL
      AND recovery_artifact_digest IS NULL AND recovery_reason IS NULL)
    OR (replay_of_job_id IS NOT NULL AND recovery_run_id > 0
      AND recovery_artifact_digest ~ '^sha256:[0-9a-f]{64}$'
      AND char_length(btrim(recovery_reason)) > 0)
  );

CREATE INDEX media_jobs_queued_claim_idx ON public.media_jobs (run_at, created_at, id)
  WHERE status = 'queued';
CREATE INDEX media_jobs_lease_idx ON public.media_jobs (lease_expires_at)
  WHERE status = 'processing';

DROP FUNCTION IF EXISTS public.claim_media_job(text);
CREATE FUNCTION public.claim_media_job(worker_name text, lease_seconds integer DEFAULT 900)
RETURNS public.media_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed public.media_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(worker_name), '') IS NULL THEN RAISE EXCEPTION 'Worker name is required'; END IF;
  IF lease_seconds < 60 OR lease_seconds > 3600 THEN RAISE EXCEPTION 'Lease must be between 60 and 3600 seconds'; END IF;
  UPDATE public.media_jobs SET status = 'failed', locked_at = NULL, locked_by = NULL,
    claim_token = NULL, lease_expires_at = NULL,
    last_error = 'Processing lease expired after final attempt'
  WHERE status = 'processing' AND attempts >= max_attempts AND lease_expires_at < now();
  UPDATE public.media_jobs AS job SET status = 'processing', attempts = job.attempts + 1,
    locked_at = now(), locked_by = btrim(worker_name), claim_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    last_error = CASE WHEN job.status = 'processing' THEN 'Previous processing lease expired' ELSE job.last_error END
  WHERE job.id = (SELECT c.id FROM public.media_jobs c
    WHERE (c.status = 'processing' AND c.lease_expires_at < now() AND c.attempts < c.max_attempts)
       OR (c.status = 'queued' AND c.run_at <= now() AND c.attempts < c.max_attempts)
    ORDER BY CASE WHEN c.status = 'processing' THEN 0 ELSE 1 END, c.run_at, c.created_at, c.id
    FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING job.* INTO claimed;
  RETURN claimed;
END; $$;

CREATE FUNCTION public.claim_media_job_for_image(worker_name text, p_image_id uuid, lease_seconds integer DEFAULT 900)
RETURNS public.media_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed public.media_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF NULLIF(btrim(worker_name), '') IS NULL THEN RAISE EXCEPTION 'Worker name is required'; END IF;
  IF lease_seconds < 60 OR lease_seconds > 3600 THEN RAISE EXCEPTION 'Lease must be between 60 and 3600 seconds'; END IF;
  UPDATE public.media_jobs SET status = 'failed', locked_at = NULL, locked_by = NULL,
    claim_token = NULL, lease_expires_at = NULL, last_error = 'Processing lease expired after final attempt'
  WHERE image_id = p_image_id AND status = 'processing' AND attempts >= max_attempts AND lease_expires_at < now();
  UPDATE public.media_jobs AS job SET status = 'processing', attempts = job.attempts + 1,
    locked_at = now(), locked_by = btrim(worker_name), claim_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    last_error = CASE WHEN job.status = 'processing' THEN 'Previous processing lease expired' ELSE job.last_error END
  WHERE job.id = (SELECT c.id FROM public.media_jobs c
    WHERE c.image_id = p_image_id AND ((c.status = 'processing' AND c.lease_expires_at < now() AND c.attempts < c.max_attempts)
      OR (c.status = 'queued' AND c.run_at <= now() AND c.attempts < c.max_attempts))
    ORDER BY CASE WHEN c.status = 'processing' THEN 0 ELSE 1 END, c.run_at, c.created_at, c.id
    FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING job.* INTO claimed;
  RETURN claimed;
END; $$;

CREATE FUNCTION public.complete_media_job(p_job_id uuid, p_claim_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  UPDATE public.media_jobs SET status = 'completed', locked_at = NULL, locked_by = NULL,
    claim_token = NULL, lease_expires_at = NULL, completed_at = now(), last_error = NULL
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001'; END IF;
END; $$;

CREATE FUNCTION public.retry_media_job(p_job_id uuid, p_claim_token uuid, p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.media_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO j FROM public.media_jobs WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001'; END IF;
  IF j.attempts >= j.max_attempts THEN
    UPDATE public.media_jobs SET status = 'failed', locked_at = NULL, locked_by = NULL, claim_token = NULL, lease_expires_at = NULL,
      last_error = left(coalesce(p_error, 'Unknown media error'), 2000) WHERE id = j.id;
  ELSE
    UPDATE public.media_jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, claim_token = NULL, lease_expires_at = NULL,
      last_error = left(coalesce(p_error, 'Unknown media error'), 2000),
      run_at = now() + make_interval(secs => least(3600, 60 * (2 ^ greatest(j.attempts - 1, 0))::integer) + floor(random() * 31)::integer)
    WHERE id = j.id;
  END IF;
END; $$;

CREATE FUNCTION public.fail_media_job(p_job_id uuid, p_claim_token uuid, p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.media_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  UPDATE public.media_jobs SET status = 'failed', locked_at = NULL, locked_by = NULL, claim_token = NULL, lease_expires_at = NULL,
    last_error = left(coalesce(p_error, 'Invalid media job'), 2000)
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001'; END IF;
  SELECT * INTO j FROM public.media_jobs WHERE id = p_job_id;
  IF j.image_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.images i WHERE i.id = j.image_id
    AND i.status <> 'deleted' AND NOT (i.processing_status = 'ready' AND i.optimized_bucket IS NOT NULL
      AND i.optimized_key IS NOT NULL AND i.optimized_mime = 'image/webp' AND i.original_deletion_queued_at IS NOT NULL)) THEN
    UPDATE public.images SET processing_status = 'failed' WHERE id = j.image_id AND status <> 'deleted'
      AND NOT (processing_status = 'ready' AND optimized_bucket IS NOT NULL AND optimized_key IS NOT NULL
        AND optimized_mime = 'image/webp' AND original_deletion_queued_at IS NOT NULL);
  END IF;
END; $$;

-- Finalization keeps the old authenticated contract, but records replacement of staging explicitly.
CREATE OR REPLACE FUNCTION public.finalize_media_upload(p_image_id uuid, p_original_key text, p_checksum_sha256 text)
RETURNS public.media_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE uid uuid := auth.uid(); image_row public.images%ROWTYPE; ingest_job public.media_jobs%ROWTYPE; staging_key text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_checksum_sha256 !~ '^[0-9a-fA-F]{64}$' OR p_original_key !~ ('^images/(staging|assets|originals)/' || p_image_id::text || '/.+$') THEN
    RAISE EXCEPTION 'Invalid upload locator or checksum' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO image_row FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002'; END IF;
  IF image_row.created_by IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF image_row.storage_provider IS DISTINCT FROM 'r2' OR image_row.original_bucket IS NULL OR image_row.upload_purpose IS NULL THEN
    RAISE EXCEPTION 'Invalid upload session' USING ERRCODE = '22023';
  END IF;
  IF image_row.processing_status IN ('queued', 'processing', 'ready') THEN
    SELECT * INTO ingest_job FROM public.media_jobs WHERE image_id = image_row.id AND job_type = 'ingest_image' ORDER BY created_at DESC LIMIT 1;
    IF FOUND AND image_row.original_key = p_original_key THEN RETURN ingest_job; END IF;
  END IF;
  staging_key := image_row.original_key;
  IF staging_key IS DISTINCT FROM p_original_key AND staging_key ~ ('^images/staging/' || p_image_id::text || '/')
     AND p_original_key ~ ('^images/(assets|originals)/' || p_image_id::text || '/') THEN
    PERFORM public.enqueue_media_deletion_job(image_row.original_bucket, staging_key, 'staging_replaced', 'image', image_row.id, image_row.id);
  END IF;
  UPDATE public.images SET original_key = p_original_key, storage_path = p_original_key, checksum_sha256 = lower(p_checksum_sha256) WHERE id = image_row.id;
  SELECT * INTO ingest_job FROM public.queue_media_ingest_job(image_row.id, image_row.original_bucket, p_original_key, 'r2', image_row.upload_purpose, uid, 'upload', false);
  RETURN ingest_job;
END; $$;

-- Recovery compares the exact health snapshot, preserves the failed row, and creates a fresh replay.
CREATE OR REPLACE FUNCTION public.recover_media_ingest_jobs(p_snapshots jsonb, p_run_id bigint, p_digest text)
RETURNS SETOF public.media_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb; old_job public.media_jobs%ROWTYPE; fresh public.media_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' OR p_run_id <= 0 OR p_digest !~ '^sha256:[0-9a-f]{64}$' OR jsonb_typeof(p_snapshots) <> 'array' OR jsonb_array_length(p_snapshots) NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid recovery request' USING ERRCODE = '22023'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_snapshots) LOOP
    SELECT * INTO old_job FROM public.media_jobs WHERE id = (s->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR old_job.status <> 'failed' OR s <> jsonb_build_object('kind','ingest_job','id',old_job.id::text,'status',old_job.status,'updatedAt',old_job.updated_at::text,'runAt',old_job.run_at::text,'lockedAt',old_job.locked_at::text,'lockedBy',old_job.locked_by,'attempts',old_job.attempts,'maxAttempts',old_job.max_attempts,'imageId',old_job.image_id::text,'reason',NULL,'bucket',NULL,'objectKey',NULL,'deliveryVerifiedAt',NULL) THEN RAISE EXCEPTION 'Current job does not exactly match reviewed failed snapshot' USING ERRCODE = '55000'; END IF;
    IF EXISTS (SELECT 1 FROM public.media_jobs WHERE replay_of_job_id = old_job.id) THEN RAISE EXCEPTION 'Active recovery duplicate exists' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.media_jobs (image_id,job_type,status,payload,attempts,max_attempts,run_at,replay_of_job_id,recovery_run_id,recovery_artifact_digest,recovery_reason)
      VALUES (old_job.image_id,old_job.job_type,'queued',old_job.payload,0,old_job.max_attempts,now(),old_job.id,p_run_id,p_digest,'reviewed failed lifecycle recovery') RETURNING * INTO fresh;
    RETURN NEXT fresh;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.recover_media_deletion_jobs(p_snapshots jsonb, p_run_id bigint, p_digest text)
RETURNS SETOF public.media_deletion_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb; old_job public.media_deletion_jobs%ROWTYPE; fresh public.media_deletion_jobs%ROWTYPE; original_url text;
BEGIN
  IF auth.role() <> 'service_role' OR p_run_id <= 0 OR p_digest !~ '^sha256:[0-9a-f]{64}$' OR jsonb_typeof(p_snapshots) <> 'array' OR jsonb_array_length(p_snapshots) NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid recovery request' USING ERRCODE = '22023'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_snapshots) LOOP
    SELECT * INTO old_job FROM public.media_deletion_jobs WHERE id = (s->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR old_job.status <> 'failed' OR old_job.reason = 'reconciled_orphan' OR s <> jsonb_build_object('kind','deletion_job','id',old_job.id::text,'status',old_job.status,'updatedAt',old_job.updated_at::text,'runAt',old_job.run_at::text,'lockedAt',old_job.locked_at::text,'lockedBy',old_job.locked_by,'attempts',old_job.attempts,'maxAttempts',old_job.max_attempts,'imageId',old_job.image_id::text,'reason',old_job.reason,'bucket',old_job.bucket,'objectKey',old_job.object_key,'deliveryVerifiedAt',old_job.delivery_verified_at::text) THEN RAISE EXCEPTION 'Current job does not exactly match reviewed failed snapshot' USING ERRCODE = '55000'; END IF;
    IF old_job.reason = 'source_replaced' AND old_job.image_id IS NOT NULL THEN
      original_url := 'private://' || old_job.bucket || '/' || old_job.object_key;
      IF EXISTS (SELECT 1 FROM public.images i WHERE i.id = old_job.image_id AND (i.original_bucket, i.original_key) IS DISTINCT FROM (old_job.bucket, old_job.object_key)) OR EXISTS (SELECT 1 FROM public.submission_draft_images WHERE storage_bucket = old_job.bucket AND storage_path = old_job.object_key) OR EXISTS (SELECT 1 FROM public.crag_images WHERE url = original_url) THEN RAISE EXCEPTION 'Source replacement locator is still referenced' USING ERRCODE = '55000'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.media_deletion_jobs WHERE replay_of_job_id = old_job.id) THEN RAISE EXCEPTION 'Active recovery duplicate exists' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.media_deletion_jobs (bucket,object_key,reason,source_type,source_id,image_id,status,attempts,max_attempts,run_at,delivery_verified_at,replay_of_job_id,recovery_run_id,recovery_artifact_digest,recovery_reason)
      VALUES (old_job.bucket,old_job.object_key,old_job.reason,old_job.source_type,old_job.source_id,old_job.image_id,'queued',0,old_job.max_attempts,now(),old_job.delivery_verified_at,old_job.id,p_run_id,p_digest,'reviewed failed lifecycle recovery') RETURNING * INTO fresh;
    RETURN NEXT fresh;
  END LOOP;
END; $$;

-- Worker completion and delivery verification are fenced by the ingest claim.
DROP FUNCTION IF EXISTS public.commit_media_webp(uuid,text,text,text,text,text,bigint,integer,integer,jsonb,text);
CREATE FUNCTION public.commit_media_webp(p_image_id uuid,p_expected_original_bucket text,p_expected_original_key text,p_optimized_bucket text,p_optimized_key text,p_optimized_mime text,p_optimized_bytes bigint,p_optimized_width integer,p_optimized_height integer,p_manifest jsonb,p_url text,p_media_job_id uuid,p_claim_token uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.media_jobs%ROWTYPE; result uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO j FROM public.media_jobs WHERE id=p_media_job_id AND image_id=p_image_id AND status='processing' AND claim_token=p_claim_token AND lease_expires_at >= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001'; END IF;
  IF p_optimized_mime <> 'image/webp' OR p_optimized_bytes <= 0 OR p_optimized_width <= 0 OR p_optimized_height <= 0 OR jsonb_typeof(p_manifest) <> 'object' OR p_optimized_bucket IS DISTINCT FROM p_expected_original_bucket OR p_optimized_key !~ ('^images/assets/' || p_image_id::text || '/[0-9a-fA-F]{64}/[^/]+[.]webp$') OR p_expected_original_key !~ ('^images/(staging|assets|originals)/' || p_image_id::text || '/') THEN RAISE EXCEPTION 'Invalid canonical WebP metadata' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.images WHERE id=p_image_id AND optimized_key IS NOT NULL) THEN
    SELECT id INTO result FROM public.media_deletion_jobs WHERE image_id=p_image_id AND reason='source_replaced' ORDER BY created_at,id LIMIT 1; IF result IS NULL THEN RAISE EXCEPTION 'Canonical WebP commit is missing its deletion job' USING ERRCODE = '55000'; END IF; RETURN result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.images WHERE id=p_image_id AND status <> 'deleted' AND original_bucket=p_expected_original_bucket AND original_key=p_expected_original_key) THEN RAISE EXCEPTION 'Stale image source' USING ERRCODE = '40001'; END IF;
  result := public.enqueue_media_deletion_job(p_expected_original_bucket,p_expected_original_key,'source_replaced','image',p_image_id,p_image_id);
  UPDATE public.images SET optimized_bucket=p_optimized_bucket,optimized_key=p_optimized_key,optimized_mime=p_optimized_mime,optimized_bytes=p_optimized_bytes,optimized_width=p_optimized_width,optimized_height=p_optimized_height,storage_bucket=p_optimized_bucket,storage_path=p_optimized_key,variants=p_manifest,url=p_url,processing_status='ready',status='approved',visibility='public',moderation_status='skipped',moderation_provider='disabled',moderation_error=NULL,moderation_labels='[]'::jsonb,original_deletion_queued_at=now(),processed_at=now() WHERE id=p_image_id;
  UPDATE public.submission_draft_images
  SET storage_bucket=p_optimized_bucket, storage_path=p_optimized_key,
      width=p_optimized_width, height=p_optimized_height, processing_status='ready'
  WHERE linked_image_id=p_image_id
     OR (storage_bucket=p_expected_original_bucket AND storage_path=p_expected_original_key);
  UPDATE public.crag_images
  SET url='private://' || p_optimized_bucket || '/' || p_optimized_key,
      width=p_optimized_width, height=p_optimized_height
  WHERE linked_image_id=p_image_id OR source_image_id=p_image_id
     OR url='private://' || p_expected_original_bucket || '/' || p_expected_original_key;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.verify_media_replacement_delivery(p_job_id uuid,p_expected_optimized_key text,p_media_job_id uuid,p_claim_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.media_deletion_jobs%ROWTYPE; i public.images%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO d FROM public.media_deletion_jobs WHERE id=p_job_id AND reason='source_replaced' FOR UPDATE;
  SELECT * INTO i FROM public.images WHERE id=d.image_id;
  IF NOT FOUND OR i.id IS DISTINCT FROM d.image_id OR i.optimized_key IS DISTINCT FROM p_expected_optimized_key THEN RAISE EXCEPTION 'Canonical delivery locator mismatch' USING ERRCODE = '40001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.media_jobs WHERE id=p_media_job_id AND image_id=d.image_id AND status='processing' AND claim_token=p_claim_token AND lease_expires_at >= now()) THEN RAISE EXCEPTION 'Media job claim is no longer active' USING ERRCODE = '40001'; END IF;
  IF d.delivery_verified_at IS NULL THEN UPDATE public.media_deletion_jobs SET delivery_verified_at=now() WHERE id=d.id; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.capture_image_media_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deletion_reason text; original_key text := COALESCE(OLD.original_key, OLD.storage_path);
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='deleted' AND NEW.status IS DISTINCT FROM 'deleted' THEN RAISE EXCEPTION 'Deleted images cannot be restored'; END IF;
  IF OLD.storage_provider='r2' AND (TG_OP='DELETE' OR (OLD.status IS DISTINCT FROM 'deleted' AND NEW.status='deleted')) THEN
    IF OLD.created_by IS NOT NULL AND EXISTS (SELECT 1 FROM public.deleted_accounts WHERE user_id=OLD.created_by AND delete_route_uploads) THEN
      deletion_reason := 'account_deleted';
    ELSIF TG_OP='UPDATE' AND auth.role()='service_role' THEN
      deletion_reason := 'published_submission_deleted';
    ELSIF TG_OP='UPDATE' THEN
      deletion_reason := 'admin_image_deleted';
    ELSE
      deletion_reason := 'image_hard_deleted';
    END IF;
    UPDATE public.media_jobs SET status='cancelled',locked_at=NULL,locked_by=NULL,claim_token=NULL,lease_expires_at=NULL,last_error='Image deleted before ingest completed' WHERE image_id=OLD.id AND status IN ('queued','processing');
    IF original_key ~ ('^images/(staging|assets|originals)/'||OLD.id::text||'/') AND OLD.original_deleted_at IS NULL THEN
      PERFORM public.enqueue_media_deletion_job(COALESCE(OLD.original_bucket,OLD.storage_bucket),original_key,deletion_reason,'image',OLD.id,OLD.id);
    END IF;
    IF OLD.optimized_key ~ ('^images/assets/'||OLD.id::text||'/[0-9a-fA-F]{64}/[^/]+[.]webp$') THEN
      PERFORM public.enqueue_media_deletion_job(OLD.optimized_bucket,OLD.optimized_key,deletion_reason,'image',OLD.id,OLD.id);
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;

DROP VIEW IF EXISTS public.worker_health;
CREATE VIEW internal.media_lifecycle_health AS
SELECT now() AS observed_at,
  (SELECT count(*) FROM public.media_jobs WHERE status='queued') AS ingest_queued,
  (SELECT count(*) FROM public.media_jobs WHERE status='processing') AS ingest_processing,
  (SELECT count(*) FROM public.media_jobs WHERE status='failed') AS ingest_failed,
  (SELECT count(*) FROM public.media_deletion_jobs WHERE status='queued') AS deletion_queued,
  (SELECT count(*) FROM public.media_deletion_jobs WHERE status='processing') AS deletion_processing,
  (SELECT count(*) FROM public.media_deletion_jobs WHERE status='failed') AS deletion_failed,
  (SELECT min(created_at) FROM public.media_jobs WHERE status IN ('queued','processing','failed')) AS oldest_ingest_at,
  (SELECT min(created_at) FROM public.media_deletion_jobs WHERE status IN ('queued','processing','failed')) AS oldest_deletion_at;

ALTER VIEW internal.media_lifecycle_health OWNER TO postgres;
REVOKE ALL ON public.media_jobs, public.media_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_jobs, public.media_deletion_jobs TO service_role;
REVOKE ALL ON internal.media_lifecycle_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON internal.media_lifecycle_health TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('claim_media_job','claim_media_job_for_image','complete_media_job','retry_media_job','fail_media_job','recover_media_ingest_jobs','recover_media_deletion_jobs','commit_media_webp','verify_media_replacement_delivery') LOOP
    EXECUTE 'ALTER FUNCTION ' || r.signature || ' OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.signature || ' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.signature || ' TO service_role';
  END LOOP;
END $$;
