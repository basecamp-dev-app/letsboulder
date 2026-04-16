-- Fix: Add security_invoker to public.worker_health view
-- This ensures the view respects RLS policies of the calling user
-- rather than running with view owner privileges (SECURITY DEFINER behavior)
CREATE OR REPLACE VIEW "public"."worker_health" WITH ("security_invoker"='true') AS
 SELECT "count"(*) FILTER (WHERE ("status" = 'pending'::"text")) AS "backlog_count",
     "count"(*) FILTER (WHERE ("status" = 'processing'::"text")) AS "active_jobs",
     "max"(("now"() - "created_at")) AS "oldest_job_age"
    FROM "public"."media_jobs";

ALTER VIEW "public"."worker_health" OWNER TO "postgres";