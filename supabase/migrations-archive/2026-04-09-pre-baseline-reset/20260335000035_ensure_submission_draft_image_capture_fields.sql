ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS latitude NUMERIC;

ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

ALTER TABLE public.submission_draft_images
  ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.touch_submission_draft_images_schema_reload()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$function$;

SELECT public.touch_submission_draft_images_schema_reload();

DROP FUNCTION public.touch_submission_draft_images_schema_reload();

NOTIFY pgrst, 'reload schema';
