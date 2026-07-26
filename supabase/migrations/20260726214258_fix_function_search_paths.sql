-- Fix mutable search_path on SECURITY DEFINER functions (lint: function_search_path_mutable)
-- Add SET search_path = '' to prevent search_path injection attacks.

-- public.add_correction_type_value(text)
CREATE OR REPLACE FUNCTION public.add_correction_type_value(p_type text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  EXECUTE format(
    'ALTER TABLE public.climb_corrections DROP CONSTRAINT IF EXISTS climb_corrections_correction_type_check'
  );
  EXECUTE format(
    'ALTER TABLE public.climb_corrections ADD CONSTRAINT climb_corrections_correction_type_check
     CHECK (correction_type::text = ANY (ARRAY[%L]::text[]))',
    p_value
  );
END;
$$;

-- public.get_upload_context(uuid, text, text, uuid)
CREATE OR REPLACE FUNCTION public.get_upload_context(
  p_image_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_crag_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'image_id', p_image_id,
    'storage_bucket', p_storage_bucket,
    'storage_path', p_storage_path,
    'crag_id', p_crag_id
  );
$$;

-- public.update_climb_consensus_safe(uuid)
CREATE OR REPLACE FUNCTION public.update_climb_consensus_safe(p_climb_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.climbs
  SET consensus_grade = sub.grade
  FROM (
    SELECT mode() WITHIN GROUP (ORDER BY grade) AS grade
    FROM public.grade_votes
    WHERE climb_id = p_climb_id
  ) sub
  WHERE id = p_climb_id;
END;
$$;

-- public.get_crag_contributor_leaderboard(uuid, integer)
CREATE OR REPLACE FUNCTION public.get_crag_contributor_leaderboard(p_crag_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  contribution_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    COUNT(DISTINCT i.id) AS contribution_count
  FROM public.profiles p
  JOIN public.images i ON i.created_by = p.id
  JOIN public.crags c ON c.id = p_crag_id
  WHERE i.crag_id = p_crag_id
    AND p.is_public = true
  GROUP BY p.id, p.username, p.display_name, p.avatar_url
  ORDER BY contribution_count DESC, p.id ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 10), 100), 1);
$$;

-- public.get_climbs_with_consensus(uuid, integer, integer)
CREATE OR REPLACE FUNCTION public.get_climbs_with_consensus(p_crag_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  name text,
  grade text,
  consensus_grade text,
  latitude numeric,
  longitude numeric,
  route_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.id,
    c.name,
    c.grade,
    c.consensus_grade,
    c.latitude,
    c.longitude,
    c.route_type AS route_type
  FROM public.climbs c
  WHERE c.crag_id = p_crag_id
  ORDER BY c.name
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- public.soft_delete_comments_on_target_delete()
CREATE OR REPLACE FUNCTION public.soft_delete_comments_on_target_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.comments
  SET deleted_at = now()
  WHERE target_type = TG_ARGV[0]
    AND target_id = OLD.id::text;
  RETURN OLD;
END;
$$;

-- public.compute_contributor_tier(integer, integer)
CREATE OR REPLACE FUNCTION public.compute_contributor_tier(p_score integer, p_accepted_count integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(p_score, 0) >= 250 AND COALESCE(p_accepted_count, 0) >= 25 THEN
    RETURN 'local_steward';
  END IF;

  IF COALESCE(p_score, 0) >= 100 AND COALESCE(p_accepted_count, 0) >= 10 THEN
    RETURN 'trusted_contributor';
  END IF;

  IF COALESCE(p_score, 0) >= 25 THEN
    RETURN 'contributor';
  END IF;

  RETURN 'new_contributor';
END;
$$;

-- public.get_place_contributor_leaderboard(uuid, integer)
CREATE OR REPLACE FUNCTION public.get_place_contributor_leaderboard(p_place_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  contribution_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    COUNT(DISTINCT i.id) AS contribution_count
  FROM public.profiles p
  JOIN public.images i ON i.created_by = p.id
  WHERE i.place_id = p_place_id
    AND p.is_public = true
  GROUP BY p.id, p.username, p.display_name, p.avatar_url
  ORDER BY contribution_count DESC, p.id ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 10), 100), 1);
$$;

-- public.touch_media_jobs_updated_at()
CREATE OR REPLACE FUNCTION public.touch_media_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke default PUBLIC/anon/authenticated EXECUTE on new SECURITY DEFINER functions
-- and grant only to intended roles (mirrors hardening migration pattern)
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
        'get_upload_context',
        'update_climb_consensus_safe',
        'get_crag_contributor_leaderboard',
        'get_climbs_with_consensus',
        'compute_contributor_tier',
        'get_place_contributor_leaderboard',
        'add_correction_type_value',
        'soft_delete_comments_on_target_delete',
        'touch_media_jobs_updated_at'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
    IF function_signature LIKE 'public.add_correction_type_value(%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', function_signature);
    ELSIF function_signature LIKE 'public.soft_delete_comments_on_target_delete(%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', function_signature);
    ELSIF function_signature LIKE 'public.touch_media_jobs_updated_at(%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', function_signature);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
    END IF;
  END LOOP;
END;
$$;

-- Grant EXECUTE to API roles for public read-only RPCs
GRANT EXECUTE ON FUNCTION public.get_upload_context(uuid, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_climbs_with_consensus(uuid, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_place_contributor_leaderboard(uuid, integer) TO anon, authenticated;

-- update_climb_consensus_safe is a trigger helper (called from grade_votes trigger), not an API RPC
-- Grant only to service_role (handled in DO block above)