ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase'
CHECK (storage_provider IN ('supabase', 'r2'));

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_bucket TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_key TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_mime_type TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_bytes BIGINT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_width INTEGER;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS original_height INTEGER;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS asset_version INTEGER NOT NULL DEFAULT 1
CHECK (asset_version >= 1);

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private', 'public'));

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending'
CHECK (processing_status IN ('pending', 'queued', 'processing', 'ready', 'failed'));

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS moderation_provider TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS moderation_error TEXT;

UPDATE public.images
SET
  storage_provider = CASE
    WHEN coalesce(original_bucket, storage_bucket) IS NOT NULL OR coalesce(original_key, storage_path) IS NOT NULL THEN 'supabase'
    ELSE storage_provider
  END,
  original_bucket = COALESCE(original_bucket, storage_bucket),
  original_key = COALESCE(original_key, storage_path),
  original_width = COALESCE(original_width, width),
  original_height = COALESCE(original_height, height),
  visibility = CASE
    WHEN moderation_status = 'approved' THEN 'public'
    ELSE visibility
  END,
  processing_status = CASE
    WHEN moderation_status = 'approved' THEN 'ready'
    ELSE processing_status
  END
WHERE original_bucket IS NULL
   OR original_key IS NULL
   OR original_width IS NULL
   OR original_height IS NULL
   OR visibility = 'private'
   OR processing_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_images_original_location
ON public.images(original_bucket, original_key);

CREATE INDEX IF NOT EXISTS idx_images_processing_status
ON public.images(processing_status, visibility);

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase'
CHECK (storage_provider IN ('supabase', 'r2'));

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS original_bucket TEXT;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS original_key TEXT;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS original_mime_type TEXT;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS original_bytes BIGINT;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS preview_variants JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'pending'
CHECK (processing_status IN ('pending', 'queued', 'processing', 'ready', 'failed'));

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;

ALTER TABLE public.submission_draft_images
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

UPDATE public.submission_draft_images
SET
  original_bucket = COALESCE(original_bucket, storage_bucket),
  original_key = COALESCE(original_key, storage_path)
WHERE original_bucket IS NULL
   OR original_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_submission_draft_images_original_location
ON public.submission_draft_images(original_bucket, original_key);

CREATE TABLE IF NOT EXISTS public.media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('ingest_image')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_status_run_at
ON public.media_jobs(status, run_at);

CREATE INDEX IF NOT EXISTS idx_media_jobs_image_id
ON public.media_jobs(image_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_media_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_media_jobs_updated_at'
  ) THEN
    CREATE TRIGGER trg_media_jobs_updated_at
      BEFORE UPDATE ON public.media_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_media_jobs_updated_at();
  END IF;
END $$;

ALTER TABLE public.media_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'media_jobs' AND policyname = 'Service role manage media_jobs'
  ) THEN
    CREATE POLICY "Service role manage media_jobs"
      ON public.media_jobs
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
