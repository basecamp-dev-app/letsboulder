ALTER TABLE public.user_climbs
ADD COLUMN IF NOT EXISTS grade_opinion VARCHAR(10),
ADD COLUMN IF NOT EXISTS grade_vote_baseline VARCHAR(10),
ADD COLUMN IF NOT EXISTS star_rating SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_climbs_grade_opinion_check'
  ) THEN
    ALTER TABLE public.user_climbs
    ADD CONSTRAINT user_climbs_grade_opinion_check
    CHECK (grade_opinion IS NULL OR grade_opinion IN ('soft', 'agree', 'hard'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_climbs_star_rating_check'
  ) THEN
    ALTER TABLE public.user_climbs
    ADD CONSTRAINT user_climbs_star_rating_check
    CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_climbs_grade_opinion
ON public.user_climbs(climb_id, grade_opinion)
WHERE grade_opinion IS NOT NULL;
