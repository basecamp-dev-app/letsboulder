-- Grades lookup table for leaderboard calculations
-- Complete scale: 1A through 9C+ with 16-point progression

-- Create grades table
CREATE TABLE IF NOT EXISTS public.grades (
  grade text PRIMARY KEY,
  points int NOT NULL
);

-- Insert all grades (1A–3C+)
INSERT INTO public.grades (grade, points) VALUES
  ('1A', 100), ('1A+', 116), ('1B', 132), ('1B+', 148), ('1C', 164), ('1C+', 180),
  ('2A', 196), ('2A+', 212), ('2B', 228), ('2B+', 244), ('2C', 260), ('2C+', 276),
  ('3A', 292), ('3A+', 308), ('3B', 324), ('3B+', 340), ('3C', 356), ('3C+', 372),
  ('4A', 388), ('4A+', 404), ('4B', 420), ('4B+', 436), ('4C', 452), ('4C+', 468),
  ('5A', 484), ('5A+', 500), ('5B', 516), ('5B+', 532), ('5C', 548), ('5C+', 564),
  ('6A', 580), ('6A+', 596), ('6B', 612), ('6B+', 628), ('6C', 644), ('6C+', 660),
  ('7A', 676), ('7A+', 692), ('7B', 708), ('7B+', 724), ('7C', 740), ('7C+', 756),
  ('8A', 772), ('8A+', 788), ('8B', 804), ('8B+', 820), ('8C', 836), ('8C+', 852),
  ('9A', 868), ('9A+', 884), ('9B', 900), ('9B+', 916), ('9C', 932), ('9C+', 948)
ON CONFLICT (grade) DO NOTHING;

-- Add foreign key constraint allowing NULL grades (lenient on legacy data)
-- This ensures new inserts reference valid grades, but existing NULL grades don't break
ALTER TABLE public.climbs
DROP CONSTRAINT IF EXISTS climbs_grade_fk;

ALTER TABLE public.climbs
ADD CONSTRAINT climbs_grade_fk
FOREIGN KEY (grade) REFERENCES public.grades(grade)
ON DELETE SET NULL;  -- If a grade is deleted, set climb grade to NULL

-- Index for leaderboard performance
CREATE INDEX IF NOT EXISTS idx_grades_points ON public.grades(points);
CREATE INDEX IF NOT EXISTS idx_climbs_grade ON public.climbs(grade);
