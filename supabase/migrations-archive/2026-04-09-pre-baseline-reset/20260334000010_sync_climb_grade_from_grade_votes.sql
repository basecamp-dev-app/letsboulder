CREATE OR REPLACE FUNCTION public.sync_climb_grade_from_votes(p_climb_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  top_grade VARCHAR(10);
  top_vote_count INTEGER;
  top_grade_count INTEGER;
BEGIN
  IF p_climb_id IS NULL THEN
    RETURN;
  END IF;

  SELECT ranked.grade, ranked.vote_count
  INTO top_grade, top_vote_count
  FROM (
    SELECT gv.grade, COUNT(*)::INTEGER AS vote_count
    FROM public.grade_votes gv
    WHERE gv.climb_id = p_climb_id
    GROUP BY gv.grade
    ORDER BY COUNT(*) DESC, gv.grade ASC
    LIMIT 1
  ) AS ranked;

  IF top_grade IS NULL OR top_vote_count IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO top_grade_count
  FROM (
    SELECT COUNT(*)::INTEGER AS vote_count
    FROM public.grade_votes gv
    WHERE gv.climb_id = p_climb_id
    GROUP BY gv.grade
  ) AS per_grade
  WHERE per_grade.vote_count = top_vote_count;

  IF top_grade_count = 1 THEN
    UPDATE public.climbs
    SET grade = top_grade
    WHERE id = p_climb_id
      AND grade IS DISTINCT FROM top_grade;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_votes_sync_climb_grade_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_climb_id UUID;
BEGIN
  target_climb_id := COALESCE(NEW.climb_id, OLD.climb_id);
  PERFORM public.sync_climb_grade_from_votes(target_climb_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_grade_votes_sync_climb_grade ON public.grade_votes;

CREATE TRIGGER trg_grade_votes_sync_climb_grade
AFTER INSERT OR UPDATE OF grade OR DELETE
ON public.grade_votes
FOR EACH ROW
EXECUTE FUNCTION public.grade_votes_sync_climb_grade_trigger();

WITH vote_counts AS (
  SELECT
    gv.climb_id,
    gv.grade,
    COUNT(*)::INTEGER AS vote_count
  FROM public.grade_votes gv
  GROUP BY gv.climb_id, gv.grade
),
ranked AS (
  SELECT
    vc.climb_id,
    vc.grade,
    vc.vote_count,
    DENSE_RANK() OVER (PARTITION BY vc.climb_id ORDER BY vc.vote_count DESC) AS vote_rank
  FROM vote_counts vc
),
leaders AS (
  SELECT r.climb_id, r.grade
  FROM ranked r
  WHERE r.vote_rank = 1
),
leader_counts AS (
  SELECT climb_id, COUNT(*)::INTEGER AS leader_count
  FROM leaders
  GROUP BY climb_id
)
UPDATE public.climbs c
SET grade = l.grade
FROM leaders l
JOIN leader_counts lc ON lc.climb_id = l.climb_id
WHERE c.id = l.climb_id
  AND lc.leader_count = 1
  AND c.grade IS DISTINCT FROM l.grade;
