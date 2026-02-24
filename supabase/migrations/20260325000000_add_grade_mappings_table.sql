-- Grade Mappings Table for Multi-Grade System Support
-- Allows users to view grades in V-Scale, Font, YDS, or French

-- 1.1 Create the mapping table
CREATE TABLE IF NOT EXISTS grade_mappings (
  grade_index INT PRIMARY KEY,
  v_scale VARCHAR(10),
  font_scale VARCHAR(10),
  yds_equivalent VARCHAR(10),
  french_equivalent VARCHAR(10),
  difficulty_group VARCHAR(20)
);

-- 1.2 Insert bouldering data (VB to V16)
-- Explicitly setting grade_index starting at 0 for consistent sorting
INSERT INTO grade_mappings (grade_index, v_scale, font_scale, yds_equivalent, french_equivalent, difficulty_group) VALUES
(0,  'VB',  '3',    '5.6',   '4',   'Beginner'),
(1,  'V0',  '4',    '5.9',   '5',   'Beginner'),
(2,  'V1',  '5',    '5.10a', '6a',  'Intermediate'),
(3,  'V2',  '5+',   '5.10c', '6a+', 'Intermediate'),
(4,  'V3',  '6A',   '5.11a', '6b',  'Intermediate'),
(5,  'V4',  '6B',   '5.11c', '6c',  'Advanced'),
(6,  'V5',  '6C',   '5.12a', '7a',  'Advanced'),
(7,  'V6',  '6C+',  '5.12b', '7a+', 'Advanced'),
(8,  'V7',  '7A',   '5.13a', '7b',  'Expert'),
(9,  'V8',  '7B',   '5.13b', '7c',  'Expert'),
(10, 'V9',  '7B+',  '5.13c', '7c+', 'Expert'),
(11, 'V10', '7C',   '5.14a', '8a',  'Elite'),
(12, 'V11', '8A',   '5.14c', '8a+', 'Elite'),
(13, 'V12', '8A+',  '5.15a', '8b',  'Elite'),
(14, 'V13', '8B',   '5.15b', '8c',  'Elite'),
(15, 'V14', '8B+',  '5.15c', '9a',  'Elite'),
(16, 'V15', '8C',   '5.15d', '9a+', 'Elite'),
(17, 'V16', '8C+',  '5.16a', '9b',  'Elite')
ON CONFLICT (grade_index) DO NOTHING;

-- 1.3 Add columns to climbs table for grade_index support
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS grade_index INT REFERENCES grade_mappings(grade_index);
ALTER TABLE climbs ADD COLUMN IF NOT EXISTS original_grade_string VARCHAR(24);

-- 1.4 Backfill existing climbs with grade_index
-- Uses french_equivalent (lowercase) to match existing French grade data
UPDATE climbs
SET 
  grade_index = gm.grade_index,
  original_grade_string = climbs.grade
FROM grade_mappings gm
WHERE LOWER(climbs.grade) = gm.french_equivalent
  AND climbs.grade IS NOT NULL;

-- 1.5 Add index for performance on grade_index queries
CREATE INDEX IF NOT EXISTS idx_climbs_grade_index ON climbs(grade_index);

-- 1.6 Enable RLS on grade_mappings (public read)
ALTER TABLE grade_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read grade mappings" ON grade_mappings;
CREATE POLICY "Public read grade mappings" ON grade_mappings FOR SELECT USING (true);
