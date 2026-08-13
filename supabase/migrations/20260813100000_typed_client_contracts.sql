INSERT INTO public.grade_votes (climb_id, user_id, grade, created_at)
SELECT climb_id, user_id, grade, created_at
FROM public.route_grades
ON CONFLICT (climb_id, user_id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated update own correction"
  ON public.climb_corrections;

CREATE OR REPLACE FUNCTION public.protect_climb_correction_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.climb_id IS DISTINCT FROM OLD.climb_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.correction_type IS DISTINCT FROM OLD.correction_type
     OR NEW.original_value IS DISTINCT FROM OLD.original_value
     OR NEW.suggested_value IS DISTINCT FROM OLD.suggested_value
     OR NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'Correction payload cannot be changed after submission';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER climb_corrections_protect_payload
BEFORE UPDATE ON public.climb_corrections
FOR EACH ROW EXECUTE FUNCTION public.protect_climb_correction_payload();

REVOKE ALL ON FUNCTION public.protect_climb_correction_payload()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_flag_and_soft_delete(
  p_flag_id uuid,
  p_reason text
)
RETURNS public.climb_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.climb_flags%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target
  FROM public.climb_flags
  WHERE id = p_flag_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Flag not found'; END IF;
  IF target.status = 'resolved' THEN RAISE EXCEPTION 'Flag is already resolved'; END IF;

  IF target.climb_id IS NOT NULL THEN
    PERFORM public.soft_delete_climb(target.climb_id, p_reason);
  ELSIF target.image_id IS NOT NULL THEN
    PERFORM public.soft_delete_image(target.image_id, p_reason);
  ELSIF target.crag_id IS NOT NULL THEN
    PERFORM public.soft_delete_crag(target.crag_id, p_reason);
  ELSE
    RAISE EXCEPTION 'Flag has no content target';
  END IF;

  UPDATE public.climb_flags
  SET status = 'resolved', action_taken = 'remove', resolved_by = auth.uid(), resolved_at = now()
  WHERE id = target.id
  RETURNING * INTO target;

  RETURN target;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_flag_and_soft_delete(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_flag_and_soft_delete(uuid, text)
  TO authenticated;
