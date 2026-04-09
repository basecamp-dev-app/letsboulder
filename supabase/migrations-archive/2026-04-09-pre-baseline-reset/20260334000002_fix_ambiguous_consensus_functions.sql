CREATE OR REPLACE FUNCTION public.is_climb_verified(climb_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.climb_verifications cv
    WHERE cv.climb_id = is_climb_verified.climb_id
    GROUP BY cv.climb_id
    HAVING COUNT(*) >= 3
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_verification_count(climb_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.climb_verifications cv
    WHERE cv.climb_id = get_verification_count.climb_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_grade_vote_distribution(climb_id UUID)
RETURNS TABLE (grade VARCHAR(10), vote_count INTEGER)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT gv.grade, COUNT(*)::INTEGER AS vote_count
  FROM public.grade_votes gv
  WHERE gv.climb_id = get_grade_vote_distribution.climb_id
  GROUP BY gv.grade
  ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consensus_grade(climb_id UUID)
RETURNS VARCHAR(10)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT gv.grade
    FROM public.grade_votes gv
    WHERE gv.climb_id = get_consensus_grade.climb_id
    GROUP BY gv.grade
    ORDER BY COUNT(*) DESC
    LIMIT 1
  );
END;
$$;
