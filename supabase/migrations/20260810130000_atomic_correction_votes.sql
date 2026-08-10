CREATE OR REPLACE FUNCTION public.vote_on_climb_correction(
  p_correction_id uuid,
  p_vote_type text DEFAULT NULL
)
RETURNS TABLE (
  approval_count integer,
  rejection_count integer,
  status text,
  vote_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_correction public.climb_corrections%ROWTYPE;
  v_existing_vote text;
  v_approval_count integer;
  v_rejection_count integer;
  v_status text;
BEGIN
  IF auth.role() <> 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_correction_id IS NULL THEN
    RAISE EXCEPTION 'Correction ID is required' USING ERRCODE = '22023';
  END IF;
  IF p_vote_type IS NOT NULL AND p_vote_type NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid correction vote type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_correction
  FROM public.climb_corrections
  WHERE id = p_correction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_correction.status <> 'pending' THEN
    RAISE EXCEPTION 'This correction has already been resolved' USING ERRCODE = '22023';
  END IF;
  IF v_correction.user_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot vote on your own correction' USING ERRCODE = '42501';
  END IF;

  SELECT vote_type INTO v_existing_vote
  FROM public.correction_votes
  WHERE correction_id = p_correction_id AND user_id = v_user_id;

  IF p_vote_type IS NULL THEN
    DELETE FROM public.correction_votes
    WHERE correction_id = p_correction_id AND user_id = v_user_id;
    vote_action := CASE WHEN v_existing_vote IS NULL THEN 'unchanged' ELSE 'removed' END;
  ELSE
    INSERT INTO public.correction_votes (correction_id, user_id, vote_type)
    VALUES (p_correction_id, v_user_id, p_vote_type)
    ON CONFLICT (correction_id, user_id) DO UPDATE
    SET vote_type = EXCLUDED.vote_type;
    vote_action := CASE
      WHEN v_existing_vote IS NULL THEN 'added'
      WHEN v_existing_vote = p_vote_type THEN 'unchanged'
      ELSE 'changed'
    END;
  END IF;

  SELECT
    count(*) FILTER (WHERE vote_type = 'approve')::integer,
    count(*) FILTER (WHERE vote_type = 'reject')::integer
  INTO v_approval_count, v_rejection_count
  FROM public.correction_votes
  WHERE correction_id = p_correction_id;

  v_status := CASE
    WHEN v_approval_count >= 3 THEN 'approved'
    WHEN v_rejection_count >= 3 THEN 'rejected'
    ELSE 'pending'
  END;

  UPDATE public.climb_corrections
  SET approval_count = v_approval_count,
      rejection_count = v_rejection_count,
      status = v_status,
      resolved_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END
  WHERE id = p_correction_id;

  approval_count := v_approval_count;
  rejection_count := v_rejection_count;
  status := v_status;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.vote_on_climb_correction(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vote_on_climb_correction(uuid, text) TO authenticated;
