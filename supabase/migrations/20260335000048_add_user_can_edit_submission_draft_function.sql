CREATE OR REPLACE FUNCTION public.user_can_edit_submission_draft(
  p_draft_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $user_can_edit_submission_draft$
  SELECT EXISTS (
    SELECT 1
    FROM public.submission_drafts sd
    WHERE sd.id = p_draft_id
      AND (
        sd.user_id = p_user_id
        OR public.is_submission_draft_collaborator(sd.id, p_user_id)
      )
  );
$user_can_edit_submission_draft$;

REVOKE ALL ON FUNCTION public.user_can_edit_submission_draft(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_edit_submission_draft(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_edit_submission_draft(UUID, UUID) TO service_role;
