-- Note: PostGIS removal is handled in 20260334000001_remove_postgis_and_boundary_artifacts.sql
-- This migration handles the other security fixes
CREATE SCHEMA IF NOT EXISTS extensions;

DROP POLICY IF EXISTS "Public create gym owner applications" ON public.gym_owner_applications;

CREATE POLICY "Public create gym owner applications"
  ON public.gym_owner_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'validate_comment_target',
        'increment_crag_report_count',
        'enforce_comment_soft_delete_only',
        'touch_submission_drafts_updated_at',
        'normalize_climb_route_type',
        'sync_place_to_crag',
        'get_grade_vote_distribution',
        'sync_crag_type_from_climbs',
        'is_profile_public',
        'touch_submission_draft_images_updated_at',
        'refresh_crag_type_from_climbs',
        'update_climb_consensus_safe',
        'update_climb_consensus',
        'get_climbs_with_consensus',
        'is_climb_verified',
        'initialize_climb_consensus',
        'find_region_by_location',
        'get_consensus_grade',
        'sync_crag_to_place',
        'get_verification_count',
        'slugify'
      ])
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, auth, extensions;',
      fn
    );
  END LOOP;
END $$;
