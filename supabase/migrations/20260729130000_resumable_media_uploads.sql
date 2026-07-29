ALTER TABLE public.images
  ADD COLUMN client_upload_id uuid,
  ADD COLUMN upload_purpose text,
  ADD COLUMN upload_draft_id uuid REFERENCES public.submission_drafts(id) ON DELETE SET NULL,
  ADD COLUMN upload_crag_id uuid REFERENCES public.crags(id) ON DELETE SET NULL;

ALTER TABLE public.images
  ADD CONSTRAINT images_upload_purpose_check
  CHECK (upload_purpose IS NULL OR upload_purpose IN ('submission_image', 'draft_image', 'crag_image'));

CREATE UNIQUE INDEX images_created_by_client_upload_id_unique
  ON public.images(created_by, client_upload_id)
  WHERE client_upload_id IS NOT NULL;

CREATE UNIQUE INDEX submission_draft_images_draft_linked_image_unique
  ON public.submission_draft_images(draft_id, linked_image_id)
  WHERE linked_image_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_media_upload(
  p_image_id uuid,
  p_original_key text,
  p_checksum_sha256 text
) RETURNS public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  image_row public.images%ROWTYPE;
  ingest_job public.media_jobs%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO image_row
  FROM public.images
  WHERE id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image not found' USING ERRCODE = 'P0002';
  END IF;

  IF image_row.created_by IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF image_row.storage_provider IS DISTINCT FROM 'r2'
    OR image_row.original_bucket IS NULL
    OR image_row.upload_purpose IS NULL THEN
    RAISE EXCEPTION 'Invalid upload session' USING ERRCODE = '22023';
  END IF;

  IF image_row.processing_status IN ('queued', 'processing', 'ready') THEN
    SELECT * INTO ingest_job
    FROM public.media_jobs
    WHERE image_id = image_row.id AND job_type = 'ingest_image'
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND THEN RETURN ingest_job; END IF;
  END IF;

  UPDATE public.images
  SET original_key = p_original_key,
      storage_path = p_original_key,
      checksum_sha256 = p_checksum_sha256
  WHERE id = image_row.id;

  SELECT * INTO ingest_job
  FROM public.queue_media_ingest_job(
    image_row.id,
    image_row.original_bucket,
    p_original_key,
    'r2',
    image_row.upload_purpose,
    current_user_id,
    'upload',
    false
  );

  RETURN ingest_job;
END;
$$;

ALTER FUNCTION public.finalize_media_upload(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_media_upload(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_media_upload(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_media_upload(uuid, text, text) TO service_role;
