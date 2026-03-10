CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE VIEW internal.worker_health
WITH (security_invoker = true) AS
SELECT
  count(*) FILTER (WHERE status = 'queued') AS backlog_count,
  count(*) FILTER (WHERE status = 'processing') AS active_jobs,
  max(now() - created_at) AS oldest_job_age
FROM public.media_jobs;

REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON internal.worker_health FROM PUBLIC;
REVOKE ALL ON internal.worker_health FROM anon;
REVOKE ALL ON internal.worker_health FROM authenticated;

GRANT USAGE ON SCHEMA internal TO service_role;
GRANT SELECT ON internal.worker_health TO service_role;
