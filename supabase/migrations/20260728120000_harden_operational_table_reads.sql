-- Operational rows contain user identities and free-form moderation details.
-- Keep direct reads owner/admin-only and publish counts through narrow views.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operational_aggregate_reader') THEN
    CREATE ROLE operational_aggregate_reader NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE operational_aggregate_reader WITH NOLOGIN NOINHERIT NOBYPASSRLS;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    WHERE membership.roleid = 'operational_aggregate_reader'::regrole
      AND membership.member <> 'postgres'::regrole
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    WHERE membership.member = 'operational_aggregate_reader'::regrole
  ) THEN
    RAISE EXCEPTION 'operational_aggregate_reader has unexpected role memberships';
  END IF;
END
$$;

REVOKE ALL ON TABLE public.climb_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.community_post_rsvps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crag_reports FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.climb_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_post_rsvps TO authenticated;
GRANT SELECT, INSERT ON TABLE public.crag_reports TO authenticated;

DROP POLICY IF EXISTS "Public read climb_flags" ON public.climb_flags;
DROP POLICY IF EXISTS "Public read community rsvps" ON public.community_post_rsvps;
DROP POLICY IF EXISTS "Public read crag reports" ON public.crag_reports;

DROP POLICY IF EXISTS "Admin manage climb_flags" ON public.climb_flags;
CREATE POLICY "Admin manage climb_flags" ON public.climb_flags
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Authenticated create climb_flags" ON public.climb_flags;
CREATE POLICY "Authenticated create climb_flags" ON public.climb_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = flagger_id
    AND status = 'pending'
    AND action_taken IS NULL
    AND resolved_by IS NULL
    AND resolved_at IS NULL
  );

CREATE POLICY "Users read own climb flags" ON public.climb_flags
  FOR SELECT TO authenticated
  USING (auth.uid() = flagger_id);

DROP POLICY IF EXISTS "Users manage own community rsvps" ON public.community_post_rsvps;
CREATE POLICY "Users manage own community rsvps" ON public.community_post_rsvps
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read community rsvps" ON public.community_post_rsvps
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Authenticated create crag report" ON public.crag_reports;
CREATE POLICY "Authenticated create crag report" ON public.crag_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'pending'
    AND moderator_id IS NULL
    AND moderator_note IS NULL
    AND resolved_at IS NULL
  );

CREATE POLICY "Users read own crag reports" ON public.crag_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

CREATE POLICY "Admins read crag reports" ON public.crag_reports
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

GRANT USAGE ON SCHEMA public TO operational_aggregate_reader;
GRANT SELECT (image_id, climb_id, crag_id, status)
  ON TABLE public.climb_flags TO operational_aggregate_reader;
GRANT SELECT (post_id, status)
  ON TABLE public.community_post_rsvps TO operational_aggregate_reader;
GRANT SELECT (crag_id, status)
  ON TABLE public.crag_reports TO operational_aggregate_reader;
GRANT SELECT (id)
  ON TABLE public.images TO operational_aggregate_reader;

CREATE POLICY "Aggregate reader counts climb flags" ON public.climb_flags
  FOR SELECT TO operational_aggregate_reader
  USING (true);

CREATE POLICY "Aggregate reader counts community rsvps" ON public.community_post_rsvps
  FOR SELECT TO operational_aggregate_reader
  USING (true);

CREATE POLICY "Aggregate reader counts crag reports" ON public.crag_reports
  FOR SELECT TO operational_aggregate_reader
  USING (true);

CREATE OR REPLACE FUNCTION public.get_image_pending_flag_count(p_image_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.images AS image
    WHERE image.id = p_image_id
      AND (
        image.created_by = auth.uid()
        OR public.is_submission_collaborator(image.id, auth.uid())
        OR (
          image.processing_status = 'ready'
          AND image.moderation_status IN ('approved', 'skipped')
          AND image.visibility = 'public'
          AND image.status = 'approved'
        )
      )
  ) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT count(*)
    FROM public.climb_flags AS flag
    WHERE flag.image_id = p_image_id
      AND flag.status = 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_image_pending_flag_count(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_image_pending_flag_count(uuid) TO authenticated;

CREATE VIEW public.community_post_rsvp_counts
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  post_id,
  count(*) FILTER (WHERE status = 'going') AS going_count,
  count(*) FILTER (WHERE status = 'interested') AS interested_count
FROM public.community_post_rsvps
GROUP BY post_id;

CREATE VIEW public.climb_flag_counts
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  'image'::text AS target_type,
  image_id AS target_id,
  count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count
FROM public.climb_flags
WHERE image_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.images AS public_image
    WHERE public_image.id = climb_flags.image_id
  )
GROUP BY image_id
UNION ALL
SELECT
  'climb'::text AS target_type,
  climb_id AS target_id,
  count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count
FROM public.climb_flags
WHERE climb_id IS NOT NULL
GROUP BY climb_id
UNION ALL
SELECT
  'crag'::text AS target_type,
  crag_id AS target_id,
  count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count
FROM public.climb_flags
WHERE crag_id IS NOT NULL
GROUP BY crag_id;

CREATE VIEW public.crag_report_counts
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  crag_id,
  count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count,
  count(*) FILTER (WHERE status = 'investigating') AS investigating_count,
  count(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  count(*) FILTER (WHERE status = 'dismissed') AS dismissed_count
FROM public.crag_reports
GROUP BY crag_id;

REVOKE ALL ON TABLE public.community_post_rsvp_counts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.climb_flag_counts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crag_report_counts FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.community_post_rsvp_counts TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.climb_flag_counts TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.crag_report_counts TO anon, authenticated, service_role;

COMMENT ON VIEW public.community_post_rsvp_counts IS
  'Public RSVP totals by session post; attendee identities are intentionally omitted.';
COMMENT ON VIEW public.climb_flag_counts IS
  'Public flag totals by target; flagger identities and moderation details are intentionally omitted.';
COMMENT ON VIEW public.crag_report_counts IS
  'Public report totals by crag; reporter identities and moderation details are intentionally omitted.';
COMMENT ON FUNCTION public.get_image_pending_flag_count(uuid) IS
  'Returns pending flag totals only for images visible to the authenticated caller.';

-- The view owner has only the grouping/status columns above and is itself
-- subject to RLS, so view-owner execution cannot expose sensitive columns.
GRANT CREATE ON SCHEMA public TO operational_aggregate_reader;
GRANT operational_aggregate_reader TO postgres;
ALTER VIEW public.community_post_rsvp_counts OWNER TO operational_aggregate_reader;
ALTER VIEW public.climb_flag_counts OWNER TO operational_aggregate_reader;
ALTER VIEW public.crag_report_counts OWNER TO operational_aggregate_reader;
REVOKE operational_aggregate_reader FROM postgres;
REVOKE CREATE ON SCHEMA public FROM operational_aggregate_reader;
