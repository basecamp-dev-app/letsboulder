CREATE OR REPLACE FUNCTION public.assign_crag_creator_as_maintainer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.crag_maintainers (crag_id, user_id, assigned_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT (crag_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_crag_creator_as_maintainer() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assign_crag_creator_as_maintainer
  AFTER INSERT ON public.crags
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_crag_creator_as_maintainer();

INSERT INTO public.crag_maintainers (crag_id, user_id, assigned_by)
SELECT crag.id, crag.created_by, crag.created_by
FROM public.crags AS crag
WHERE crag.created_by IS NOT NULL
  AND crag.deleted_at IS NULL
ON CONFLICT (crag_id, user_id) DO NOTHING;

DROP FUNCTION public.get_visible_profile(uuid);

CREATE FUNCTION public.get_visible_profile(p_user_id uuid)
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
  contributor_tier text,
  is_crag_maintainer boolean
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
    p.contributor_tier,
    EXISTS (
      SELECT 1
      FROM public.crag_maintainers AS maintainer
      JOIN public.crags AS crag ON crag.id = maintainer.crag_id
      WHERE maintainer.user_id = p.id
        AND crag.deleted_at IS NULL
    )
  FROM public.profiles AS p
  WHERE p.id = p_user_id
    AND (p.is_public = true OR p.id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_visible_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_profile(uuid) TO anon, authenticated;
