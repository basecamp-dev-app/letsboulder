-- Remove permissive defaults inherited from the production baseline. New API
-- objects must declare their privileges in the migration that creates them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.add_correction_type_value(text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owner update profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin update profiles" ON public.profiles;

CREATE POLICY "Read visible profiles"
  ON public.profiles
  FOR SELECT
  USING (is_public OR id = auth.uid());

CREATE POLICY "Owner update profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  bio,
  country,
  country_code,
  preferred_grade_system,
  preferred_style,
  is_public,
  created_at
) ON public.profiles TO anon, authenticated;

GRANT UPDATE (
  username,
  display_name,
  avatar_url,
  bio,
  gender,
  country,
  country_code,
  preferred_grade_system,
  preferred_style,
  grade_system,
  boulder_system,
  route_system,
  trad_system,
  units,
  is_public,
  theme_preference,
  first_name,
  last_name,
  name,
  default_location,
  default_location_name,
  default_location_lat,
  default_location_lng,
  default_location_zoom,
  height_cm,
  reach_cm,
  contribution_credit_platform,
  contribution_credit_handle,
  updated_at
) ON public.profiles TO authenticated;

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
  ) THEN
    RAISE EXCEPTION 'Protected profile field' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_fields ON public.profiles;
CREATE TRIGGER profiles_protect_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();

CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.*
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    );
$$;

-- Policies must not query the protected is_admin column as an API role. Route
-- every admin predicate through the identity-bound definer instead.
DROP POLICY IF EXISTS "Admin manage climb_flags" ON public.climb_flags;
CREATE POLICY "Admin manage climb_flags" ON public.climb_flags
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin read all notifications" ON public.notifications;
CREATE POLICY "Admin read all notifications" ON public.notifications
  FOR SELECT USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin read gym owner applications" ON public.gym_owner_applications;
CREATE POLICY "Admin read gym owner applications" ON public.gym_owner_applications
  FOR SELECT USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin update gym owner applications" ON public.gym_owner_applications;
CREATE POLICY "Admin update gym owner applications" ON public.gym_owner_applications
  FOR UPDATE
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin write gym_floor_plans" ON public.gym_floor_plans;
CREATE POLICY "Admin write gym_floor_plans" ON public.gym_floor_plans
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin write gym_route_markers" ON public.gym_route_markers;
CREATE POLICY "Admin write gym_route_markers" ON public.gym_route_markers
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin write gym_routes" ON public.gym_routes;
CREATE POLICY "Admin write gym_routes" ON public.gym_routes
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete climbs" ON public.climbs;
CREATE POLICY "Admins can delete climbs" ON public.climbs
  FOR DELETE USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete crags" ON public.crags;
CREATE POLICY "Admins can delete crags" ON public.crags
  FOR DELETE USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete images" ON public.images;
CREATE POLICY "Admins can delete images" ON public.images
  FOR DELETE USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins manage gym memberships" ON public.gym_memberships;
CREATE POLICY "Admins manage gym memberships" ON public.gym_memberships
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "User read own notifications" ON public.notifications;
CREATE POLICY "User read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id OR public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.get_top_contributors(p_limit integer DEFAULT 6)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  contributor_score_total integer,
  accepted_contribution_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.contributor_score_total,
    p.accepted_contribution_count
  FROM public.profiles AS p
  WHERE p.is_public = true
    AND p.accepted_contribution_count > 0
  ORDER BY
    p.contributor_score_total DESC,
    p.accepted_contribution_count DESC,
    p.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.get_visible_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean,
  total_climbs integer,
  total_points integer,
  highest_grade text,
  contributor_score_total integer,
  accepted_contribution_count integer,
  contributor_tier text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.is_public,
    p.total_climbs,
    p.total_points,
    p.highest_grade,
    p.contributor_score_total,
    p.accepted_contribution_count,
    p.contributor_tier
  FROM public.profiles AS p
  WHERE p.id = p_user_id
    AND (p.is_public = true OR p.id = auth.uid());
$$;

-- Privileged worker and maintenance functions also enforce their runtime role.
CREATE OR REPLACE FUNCTION public.claim_media_job(worker_name text)
RETURNS public.media_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_job public.media_jobs;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.media_jobs AS mj
  SET
    status = 'processing',
    locked_at = now(),
    locked_by = worker_name,
    attempts = mj.attempts + 1,
    updated_at = now()
  WHERE mj.id = (
    SELECT id
    FROM public.media_jobs
    WHERE status = 'queued'
      AND run_at <= now()
    ORDER BY run_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING mj.* INTO claimed_job;

  RETURN claimed_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_orphan_route_uploads(
  max_age interval DEFAULT interval '72 hours',
  max_delete integer DEFAULT 300
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  WITH candidates AS (
    SELECT o.name
    FROM storage.objects AS o
    LEFT JOIN public.images AS i
      ON i.storage_bucket = o.bucket_id
      AND i.storage_path = o.name
    WHERE o.bucket_id = 'route-uploads'
      AND i.id IS NULL
      AND o.created_at < now() - max_age
    ORDER BY o.created_at ASC
    LIMIT GREATEST(max_delete, 0)
  ), deleted AS (
    DELETE FROM storage.objects AS o
    USING candidates AS c
    WHERE o.bucket_id = 'route-uploads'
      AND o.name = c.name
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- The generic score writer is deliberately service-only. App code derives the
-- beneficiary and fixed score from authoritative source rows before calling it.
CREATE OR REPLACE FUNCTION public.record_contribution_event(
  p_user_id uuid,
  p_event_type text,
  p_score_delta integer,
  p_source_table text,
  p_source_id uuid,
  p_place_id uuid DEFAULT NULL,
  p_crag_id uuid DEFAULT NULL,
  p_image_id uuid DEFAULT NULL,
  p_climb_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'accepted'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid;
  v_current_score integer;
  v_next_score bigint;
  v_next_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_source_id IS NULL OR btrim(COALESCE(p_source_table, '')) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.contribution_events (
    user_id, place_id, crag_id, image_id, climb_id, event_type, status,
    score_delta, source_table, source_id, metadata, resolved_at
  ) VALUES (
    p_user_id, p_place_id, p_crag_id, p_image_id, p_climb_id, p_event_type,
    COALESCE(p_status, 'accepted'), p_score_delta, p_source_table, p_source_id,
    COALESCE(p_metadata, '{}'::jsonb),
    CASE WHEN COALESCE(p_status, 'accepted') = 'accepted' THEN now() ELSE NULL END
  )
  ON CONFLICT (event_type, user_id, source_table, source_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM public.contribution_events
    WHERE event_type = p_event_type
      AND user_id = p_user_id
      AND source_table = p_source_table
      AND source_id = p_source_id
    LIMIT 1;
    RETURN v_event_id;
  END IF;

  IF COALESCE(p_status, 'accepted') <> 'accepted' THEN
    RETURN v_event_id;
  END IF;

  SELECT contributor_score_total
  INTO v_current_score
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_next_score := COALESCE(v_current_score, 0)::bigint + p_score_delta::bigint;
  IF v_next_score < -2147483648 OR v_next_score > 2147483647 THEN
    RAISE EXCEPTION 'Contribution score overflow' USING ERRCODE = '22003';
  END IF;

  UPDATE public.profiles
  SET contributor_score_total = v_next_score::integer,
      accepted_contribution_count = accepted_contribution_count + 1
  WHERE id = p_user_id
  RETURNING accepted_contribution_count INTO v_next_count;

  IF v_next_count IS NOT NULL THEN
    UPDATE public.profiles
    SET contributor_tier = public.compute_contributor_tier(v_next_score::integer, v_next_count)
    WHERE id = p_user_id;
  END IF;

  IF p_place_id IS NOT NULL THEN
    INSERT INTO public.user_place_contributor_scores (
      user_id, place_id, contributor_score_total,
      accepted_contribution_count, last_contribution_at
    ) VALUES (p_user_id, p_place_id, p_score_delta, 1, now())
    ON CONFLICT (user_id, place_id) DO UPDATE SET
      contributor_score_total = public.user_place_contributor_scores.contributor_score_total
        + EXCLUDED.contributor_score_total,
      accepted_contribution_count = public.user_place_contributor_scores.accepted_contribution_count
        + EXCLUDED.accepted_contribution_count,
      last_contribution_at = EXCLUDED.last_contribution_at;
  END IF;

  RETURN v_event_id;
END;
$$;

-- Bind caller-selected identities used by published wiki helpers to the JWT.
CREATE OR REPLACE FUNCTION public.user_can_wiki_edit_submission(p_image_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.images AS i
      WHERE i.id = p_image_id
        AND i.created_by IS NOT NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.log_submission_edit(
  p_image_id uuid,
  p_edited_by uuid,
  p_edit_kind text,
  p_summary text,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR p_edited_by <> auth.uid()) THEN
    RAISE EXCEPTION 'Cannot record an edit for another user' USING ERRCODE = '42501';
  END IF;

  IF p_image_id IS NULL OR p_edited_by IS NULL OR p_edit_kind IS NULL
    OR btrim(COALESCE(p_summary, '')) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.submission_edit_history (
    image_id, edited_by, edit_kind, summary, before_data, after_data
  ) VALUES (
    p_image_id, p_edited_by, p_edit_kind, btrim(p_summary), p_before_data, p_after_data
  );

  PERFORM public.record_submission_contribution(p_image_id, p_edited_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_submission_edit(
  p_image_id uuid,
  p_edited_by uuid,
  p_edit_kind text,
  p_summary text,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_risk_level text DEFAULT 'safe',
  p_moderation_state text DEFAULT 'accepted',
  p_risk_reasons text[] DEFAULT ARRAY[]::text[],
  p_field_targets text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_risk_level text := COALESCE(p_risk_level, 'safe');
  v_moderation_state text := COALESCE(p_moderation_state, 'accepted');
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR p_edited_by <> auth.uid()) THEN
    RAISE EXCEPTION 'Cannot record an edit for another user' USING ERRCODE = '42501';
  END IF;

  IF p_image_id IS NULL OR p_edited_by IS NULL OR p_edit_kind IS NULL
    OR btrim(COALESCE(p_summary, '')) = '' THEN
    RETURN;
  END IF;

  IF v_risk_level NOT IN ('safe', 'suspicious', 'high_risk') THEN
    v_risk_level := 'safe';
  END IF;
  IF v_moderation_state NOT IN ('accepted', 'flagged', 'blocked') THEN
    v_moderation_state := 'accepted';
  END IF;

  INSERT INTO public.submission_edit_history (
    image_id, edited_by, edit_kind, summary, before_data, after_data,
    risk_level, moderation_state, risk_reasons, field_targets
  ) VALUES (
    p_image_id, p_edited_by, p_edit_kind, btrim(p_summary), p_before_data,
    p_after_data, v_risk_level, v_moderation_state,
    COALESCE(p_risk_reasons, ARRAY[]::text[]),
    COALESCE(p_field_targets, ARRAY[]::text[])
  );

  PERFORM public.record_submission_contribution(p_image_id, p_edited_by);
END;
$$;

-- First remove API execution from every current definer. Trigger functions and
-- internal helpers intentionally receive no API re-grant below.
DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_signature
    );
    IF function_signature LIKE 'public.add_correction_type_value(%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', function_signature);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'claim_submission_collaborator_invite',
        'claim_submission_draft_collaborator_invite',
        'create_notification',
        'create_unified_submission_atomic',
        'insert_grade_vote',
        'soft_delete_comment',
        'update_own_profile_submission_credit',
        'update_own_submission_anonymity',
        'update_own_submission_credit',
        'update_own_submitted_routes',
        'update_submission_crag_metadata',
        'update_submission_image_metadata',
        'update_submission_image_order',
        'user_can_edit_submission_draft',
        'user_can_wiki_edit_submission',
        'log_submission_edit',
        'promote_draft_to_submission',
        'queue_media_ingest_job',
        'assert_media_ready_for_publication',
        'delete_unassociated_upload_image',
        'delete_submission_draft_atomic',
        'delete_submission_draft_image_atomic',
        'get_own_profile',
        'is_current_user_admin'
      ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;
END;
$$;

-- Intentionally public, read-only RPCs.
GRANT EXECUTE ON FUNCTION public.get_active_climbers_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_boulders_with_gps_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_contributors_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_photos_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_pins() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_pins(boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_route_intelligence(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crags_mapped_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_climb_id(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_place_rankings_leaderboard(uuid, text, integer, integer, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_leaderboard(text, uuid, text, integer, integer, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_star_rating_summary(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_climbs_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_logs_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_sends_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_verified_routes_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_rankings_leaderboard(uuid, text, integer, integer, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_route_targets_page(uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_place_pins(boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_contributors(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_profile(uuid) TO anon, authenticated;

-- RLS helpers must remain executable by API roles because policies call them.
GRANT EXECUTE ON FUNCTION public.is_submission_collaborator(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_submission_draft_collaborator(uuid, uuid) TO anon, authenticated;
