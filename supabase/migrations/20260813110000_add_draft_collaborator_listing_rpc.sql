CREATE OR REPLACE FUNCTION public.list_submission_draft_collaborators(p_draft_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  created_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
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
    FROM public.submission_drafts AS draft
    WHERE draft.id = p_draft_id
      AND (
        draft.user_id = auth.uid()
        OR public.is_submission_draft_collaborator(draft.id, auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'Draft collaborator access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    collaborator.user_id,
    collaborator.role,
    collaborator.created_at,
    CASE WHEN profile.is_public OR profile.id = auth.uid() THEN profile.display_name END,
    CASE WHEN profile.is_public OR profile.id = auth.uid() THEN profile.username END,
    CASE WHEN profile.is_public OR profile.id = auth.uid() THEN profile.avatar_url END
  FROM public.submission_draft_collaborators AS collaborator
  LEFT JOIN public.profiles AS profile ON profile.id = collaborator.user_id
  WHERE collaborator.draft_id = p_draft_id
  ORDER BY collaborator.created_at ASC, collaborator.user_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_submission_draft_collaborators(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_submission_draft_collaborators(uuid)
  TO authenticated;
