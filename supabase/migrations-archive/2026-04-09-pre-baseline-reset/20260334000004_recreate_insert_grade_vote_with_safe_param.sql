DROP FUNCTION IF EXISTS public.insert_grade_vote(UUID, VARCHAR);

CREATE FUNCTION public.insert_grade_vote(p_climb_id UUID, vote_grade VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.grade_votes (climb_id, user_id, grade)
  VALUES (p_climb_id, auth.uid(), vote_grade)
  ON CONFLICT (climb_id, user_id)
  DO UPDATE SET grade = EXCLUDED.grade, created_at = NOW();
END;
$function$;
