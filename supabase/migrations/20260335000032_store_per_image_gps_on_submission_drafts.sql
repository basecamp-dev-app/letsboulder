ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS latitude NUMERIC;

ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ;
