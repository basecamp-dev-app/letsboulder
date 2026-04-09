DROP VIEW IF EXISTS internal.worker_health;

CREATE VIEW internal.worker_health
WITH (security_invoker = true) AS
SELECT
  count(*) FILTER (WHERE status = 'queued') AS backlog_count,
  count(*) FILTER (WHERE status = 'processing') AS active_jobs,
  count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
  count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
  max(now() - created_at) FILTER (WHERE status = 'queued') AS oldest_queued_job_age,
  max(now() - updated_at) FILTER (WHERE status = 'processing') AS oldest_active_job_age,
  max(created_at) AS latest_job_created_at,
  max(updated_at) AS latest_job_updated_at
FROM public.media_jobs;

REVOKE ALL ON internal.worker_health FROM PUBLIC;
REVOKE ALL ON internal.worker_health FROM anon;
REVOKE ALL ON internal.worker_health FROM authenticated;

GRANT SELECT ON internal.worker_health TO service_role;
