-- Use SECURITY DEFINER RPC for comment soft-delete to avoid
-- PostgREST UPDATE+RLS visibility edge cases.

CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_comment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.comments
  SET deleted_at = NOW()
  WHERE id = p_comment_id
    AND author_id = current_user_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_comment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(UUID) TO service_role;
