ALTER TABLE public.images
  ADD COLUMN optimized_bucket text,
  ADD COLUMN optimized_key text,
  ADD COLUMN optimized_mime text,
  ADD COLUMN optimized_bytes bigint,
  ADD COLUMN optimized_width integer,
  ADD COLUMN optimized_height integer,
  ADD COLUMN original_deletion_queued_at timestamptz,
  ADD COLUMN original_deleted_at timestamptz;

ALTER TABLE public.images
  ADD CONSTRAINT images_optimized_webp_check CHECK (
    num_nonnulls(optimized_bucket, optimized_key, optimized_mime, optimized_bytes,
      optimized_width, optimized_height) = 0
    OR
    (num_nonnulls(optimized_bucket, optimized_key, optimized_mime, optimized_bytes,
        optimized_width, optimized_height) = 6
      AND char_length(btrim(optimized_bucket)) > 0
      AND char_length(btrim(optimized_key)) > 0
      AND optimized_mime = 'image/webp'
      AND optimized_bytes > 0 AND optimized_width > 0 AND optimized_height > 0)
  ),
  ADD CONSTRAINT images_original_deletion_lifecycle_check CHECK (
    original_deleted_at IS NULL OR original_deletion_queued_at IS NOT NULL
  );

ALTER TABLE public.media_deletion_jobs
  DROP CONSTRAINT media_deletion_jobs_reason_check,
  ADD CONSTRAINT media_deletion_jobs_reason_check CHECK (reason IN (
    'account_deleted',
    'published_submission_deleted',
    'admin_image_deleted',
    'draft_image_deleted',
    'unassociated_upload_deleted',
    'image_hard_deleted',
    'source_replaced'
  ));

CREATE FUNCTION public.guard_canonical_webp_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF num_nonnulls(NEW.optimized_bucket, NEW.optimized_key, NEW.optimized_mime,
      NEW.optimized_bytes, NEW.optimized_width, NEW.optimized_height,
      NEW.original_deletion_queued_at, NEW.original_deleted_at) > 0 THEN
      RAISE EXCEPTION 'Canonical WebP state is service-managed' USING ERRCODE = '42501';
    END IF;
  ELSIF (OLD.optimized_bucket, OLD.optimized_key, OLD.optimized_mime,
      OLD.optimized_bytes, OLD.optimized_width, OLD.optimized_height,
      OLD.original_deletion_queued_at, OLD.original_deleted_at)
    IS DISTINCT FROM
    (NEW.optimized_bucket, NEW.optimized_key, NEW.optimized_mime,
      NEW.optimized_bytes, NEW.optimized_width, NEW.optimized_height,
      NEW.original_deletion_queued_at, NEW.original_deleted_at) THEN
    RAISE EXCEPTION 'Canonical WebP state is service-managed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER images_guard_canonical_webp_state
BEFORE INSERT OR UPDATE ON public.images
FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_webp_state();

REVOKE ALL ON FUNCTION public.guard_canonical_webp_state() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.capture_image_media_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deletion_reason text;
  original_deletion_key text := COALESCE(OLD.original_key, OLD.storage_path);
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

  UPDATE public.media_jobs
  SET status = 'cancelled', locked_at = NULL, locked_by = NULL,
      last_error = 'Image deleted before ingest completed'
  WHERE image_id = OLD.id AND status IN ('queued', 'processing');

  IF original_deletion_key ~ (
    '^images/(staging|assets|originals)/' || OLD.id::text || '/'
  ) AND OLD.original_deleted_at IS NULL THEN
    PERFORM public.enqueue_media_deletion_job(
      COALESCE(OLD.original_bucket, OLD.storage_bucket),
      original_deletion_key,
      deletion_reason,
      'image',
      OLD.id,
      OLD.id
    );
  END IF;

  IF OLD.optimized_key ~ (
    '^images/assets/' || OLD.id::text || '/[0-9a-fA-F]{64}/[^/]+[.]webp$'
  ) THEN
    PERFORM public.enqueue_media_deletion_job(
      OLD.optimized_bucket,
      OLD.optimized_key,
      deletion_reason,
      'image',
      OLD.id,
      OLD.id
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_media_deletion_job(p_job_id uuid, p_claim_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  completed_job public.media_deletion_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.media_deletion_jobs
  SET status = 'completed', locked_at = NULL, locked_by = NULL, claim_token = NULL,
      last_error = NULL, completed_at = now()
  WHERE id = p_job_id AND status = 'processing' AND claim_token = p_claim_token
  RETURNING * INTO completed_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media deletion job claim is no longer active' USING ERRCODE = '40001';
  END IF;

  IF completed_job.reason = 'source_replaced' AND completed_job.image_id IS NOT NULL THEN
    UPDATE public.images
    SET original_deleted_at = COALESCE(original_deleted_at, now())
    WHERE id = completed_job.image_id
      AND COALESCE(original_bucket, storage_bucket) = completed_job.bucket
      AND COALESCE(original_key, storage_path) = completed_job.object_key;
  END IF;
END;
$$;

CREATE FUNCTION public.commit_media_webp(
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
  WHERE linked_image_id = image_row.id;

  UPDATE public.crag_images
  SET url = 'private://' || btrim(p_optimized_bucket) || '/' || btrim(p_optimized_key),
      width = p_optimized_width,
      height = p_optimized_height
  WHERE linked_image_id = image_row.id OR source_image_id = image_row.id;

  RETURN deletion_job_id;
END;
$$;

ALTER FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_media_webp(uuid, text, text, text, text, text, bigint, integer, integer, jsonb, text) TO service_role;
