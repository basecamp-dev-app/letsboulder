CREATE OR REPLACE FUNCTION public.cleanup_orphan_route_uploads(
  max_age INTERVAL DEFAULT INTERVAL '72 hours',
  max_delete INTEGER DEFAULT 300
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT o.name
    FROM storage.objects o
    LEFT JOIN public.images i
      ON i.storage_bucket = o.bucket_id
     AND i.storage_path = o.name
    WHERE o.bucket_id = 'route-uploads'
      AND i.id IS NULL
      AND o.created_at < NOW() - max_age
    ORDER BY o.created_at ASC
    LIMIT GREATEST(max_delete, 0)
  ), deleted AS (
    DELETE FROM storage.objects o
    USING candidates c
    WHERE o.bucket_id = 'route-uploads'
      AND o.name = c.name
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_route_uploads(INTERVAL, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_route_uploads(INTERVAL, INTEGER) TO service_role;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup-orphan-route-uploads';

    PERFORM cron.schedule(
      'cleanup-orphan-route-uploads',
      '25 3 * * *',
      'SELECT public.cleanup_orphan_route_uploads(INTERVAL ''72 hours'', 300);'
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
  END;
END;
$$;
