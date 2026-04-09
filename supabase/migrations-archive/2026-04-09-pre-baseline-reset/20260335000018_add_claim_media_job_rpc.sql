CREATE OR REPLACE FUNCTION public.claim_media_job(worker_name TEXT)
RETURNS public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  claimed_job public.media_jobs;
BEGIN
  UPDATE public.media_jobs mj
  SET
    status = 'processing',
    locked_at = NOW(),
    locked_by = worker_name,
    attempts = mj.attempts + 1,
    updated_at = NOW()
  WHERE mj.id = (
    SELECT id
    FROM public.media_jobs
    WHERE status = 'queued'
      AND run_at <= NOW()
    ORDER BY run_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING mj.* INTO claimed_job;

  RETURN claimed_job;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_media_job(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_media_job(TEXT) TO service_role;
