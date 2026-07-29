ALTER TABLE public.profiles
  ADD COLUMN open_data_consent_version text,
  ADD COLUMN consent_timestamp timestamptz;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_open_data_consent_complete
  CHECK (
    (open_data_consent_version IS NULL AND consent_timestamp IS NULL)
    OR (open_data_consent_version IS NOT NULL AND consent_timestamp IS NOT NULL)
  );

COMMENT ON COLUMN public.profiles.open_data_consent_version IS
  'Latest Open Data Contributor Terms version accepted by this user.';
COMMENT ON COLUMN public.profiles.consent_timestamp IS
  'Database-generated timestamp for acceptance of open_data_consent_version.';

CREATE OR REPLACE FUNCTION public.current_open_data_consent_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '2026-07-29-v1'::text;
$$;

CREATE OR REPLACE FUNCTION public.has_valid_open_data_consent(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = p_user_id
        AND p.consent_timestamp IS NOT NULL
        AND p.open_data_consent_version = public.current_open_data_consent_version()
    );
$$;

CREATE OR REPLACE FUNCTION public.require_open_data_consent()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_valid_open_data_consent(auth.uid()) THEN
    RAISE EXCEPTION 'Open data consent required'
      USING ERRCODE = 'P0001',
        DETAIL = 'open_data_consent_required',
        HINT = public.current_open_data_consent_version();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_open_data_consent(p_expected_version text)
RETURNS TABLE(open_data_consent_version text, consent_timestamp timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS DISTINCT FROM public.current_open_data_consent_version() THEN
    RAISE EXCEPTION 'Open data consent version changed'
      USING ERRCODE = '22023', DETAIL = 'consent_version_changed';
  END IF;

  RETURN QUERY
  UPDATE public.profiles AS p
  SET open_data_consent_version = public.current_open_data_consent_version(),
    consent_timestamp = statement_timestamp(),
    updated_at = statement_timestamp()
  WHERE p.id = auth.uid()
  RETURNING p.open_data_consent_version, p.consent_timestamp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_open_data_consent_status()
RETURNS TABLE(
  required_version text,
  accepted_version text,
  consent_timestamp timestamptz,
  is_valid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_open_data_consent_version(),
    p.open_data_consent_version,
    p.consent_timestamp,
    p.consent_timestamp IS NOT NULL
      AND p.open_data_consent_version = public.current_open_data_consent_version()
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
    OR NEW.total_climbs IS DISTINCT FROM OLD.total_climbs
    OR NEW.total_points IS DISTINCT FROM OLD.total_points
    OR NEW.highest_grade IS DISTINCT FROM OLD.highest_grade
    OR NEW.contributor_score_total IS DISTINCT FROM OLD.contributor_score_total
    OR NEW.accepted_contribution_count IS DISTINCT FROM OLD.accepted_contribution_count
    OR NEW.contributor_tier IS DISTINCT FROM OLD.contributor_tier
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.name_updated_at IS DISTINCT FROM OLD.name_updated_at
    OR NEW.tos_accepted_at IS DISTINCT FROM OLD.tos_accepted_at
    OR NEW.welcome_email_sent_at IS DISTINCT FROM OLD.welcome_email_sent_at
    OR (
      current_user <> 'postgres'
      AND (
        NEW.open_data_consent_version IS DISTINCT FROM OLD.open_data_consent_version
        OR NEW.consent_timestamp IS DISTINCT FROM OLD.consent_timestamp
      )
    )
  ) THEN
    RAISE EXCEPTION 'Protected profile field' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_open_data_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_open_data_consent();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_draft_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM 'submitted'
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.crag_id IS DISTINCT FROM OLD.crag_id
  THEN
    PERFORM public.require_open_data_consent();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER images_require_open_data_consent
  BEFORE INSERT ON public.images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER draft_routes_require_open_data_consent
  BEFORE INSERT OR UPDATE ON public.submission_draft_routes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER drafts_require_open_data_consent
  BEFORE UPDATE ON public.submission_drafts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_draft_consent();

CREATE TRIGGER grade_votes_require_open_data_consent
  BEFORE INSERT OR UPDATE ON public.grade_votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER route_grades_require_open_data_consent
  BEFORE INSERT OR UPDATE ON public.route_grades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER crag_proposals_require_open_data_consent
  BEFORE INSERT ON public.crag_metadata_proposals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER comments_require_open_data_consent
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER comment_edits_require_open_data_consent
  BEFORE UPDATE OF body, category, target_id, target_type ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER community_posts_require_open_data_consent
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER community_post_edits_require_open_data_consent
  BEFORE UPDATE OF body, title, type, discipline, grade_min, grade_max, start_at, end_at
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER community_comments_require_open_data_consent
  BEFORE INSERT ON public.community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER community_comment_edits_require_open_data_consent
  BEFORE UPDATE OF body ON public.community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER corrections_require_open_data_consent
  BEFORE INSERT ON public.climb_corrections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER correction_edits_require_open_data_consent
  BEFORE UPDATE OF correction_type, suggested_value, reason ON public.climb_corrections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER correction_votes_require_open_data_consent
  BEFORE INSERT OR UPDATE ON public.correction_votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER verifications_require_open_data_consent
  BEFORE INSERT ON public.climb_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER video_betas_require_open_data_consent
  BEFORE INSERT ON public.climb_video_betas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER video_beta_edits_require_open_data_consent
  BEFORE UPDATE OF url, title, notes, platform ON public.climb_video_betas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_open_data_consent();

CREATE TRIGGER published_edits_require_open_data_consent
  BEFORE INSERT ON public.wiki_revision_commits
  FOR EACH ROW
  WHEN (NEW.author_kind = 'user')
  EXECUTE FUNCTION public.enforce_open_data_consent();

REVOKE ALL ON FUNCTION public.current_open_data_consent_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_valid_open_data_consent(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_open_data_consent() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_open_data_consent(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_open_data_consent_status() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_open_data_consent() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_draft_consent() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_valid_open_data_consent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_open_data_consent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_data_consent_status() TO authenticated;
