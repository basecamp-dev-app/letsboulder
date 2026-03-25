-- Expand grade_mappings to 42 entries (3A through 9C+)
-- Font scale (PUBLIC_GRADES) is the master index.
-- V-scale, YDS, French, British are derived (some duplicates where resolution is coarser).
--
-- This migration:
-- 1. Drops the FK constraint on climbs.grade_index (to allow shifting)
-- 2. Shifts climbs.grade_index by +6 to match future mapping indices
-- 3. Shifts grade_mappings rows by +6
-- 4. Inserts 3A-3C+ at indices 0-5
-- 5. Migrates legacy Font strings in climbs/grade_votes
-- 6. Re-adds the FK constraint

-- Step 1: Drop the FK constraint so we can shift indices freely
ALTER TABLE climbs DROP CONSTRAINT IF EXISTS climbs_grade_index_fkey;

-- Step 2: Shift climbs.grade_index by +6 first (no FK to block us)
UPDATE climbs SET grade_index = grade_index + 6 WHERE grade_index IS NOT NULL;

-- Step 3: Shift grade_mappings rows by +6
-- Use temporary offset (+1000) to avoid primary key conflicts during the shift.
UPDATE grade_mappings SET grade_index = grade_index + 1000 WHERE grade_index >= 0;
UPDATE grade_mappings SET grade_index = grade_index - 1000 + 6 WHERE grade_index >= 1000;

-- Step 4: Insert 3A-3C+ at indices 0-5
INSERT INTO grade_mappings (grade_index, v_scale, font_scale, yds_equivalent, french_equivalent, british_equivalent, difficulty_group) VALUES
(0, 'VB', '3A',  '5.4', '3',   'M',  'Beginner'),
(1, 'VB', '3A+', '5.5', '3+',  'M',  'Beginner'),
(2, 'VB', '3B',  '5.5', '3+',  'D',  'Beginner'),
(3, 'VB', '3B+', '5.6', '4-',  'VD', 'Beginner'),
(4, 'VB', '3C',  '5.6', '4-',  'VD', 'Beginner'),
(5, 'VB', '3C+', '5.6', '4',   'VD', 'Beginner')
ON CONFLICT (grade_index) DO NOTHING;

-- Step 5: Update existing rows 6-23 (formerly 0-17) to use PUBLIC_GRADES font_scale
-- Old font_scale values ('3','4','5','5+') are NOT in PUBLIC_GRADES.
UPDATE grade_mappings SET font_scale = '4A',  v_scale = 'VB', yds_equivalent = '5.7',  french_equivalent = '4',   british_equivalent = 'VD', difficulty_group = 'Beginner'     WHERE grade_index = 6;
UPDATE grade_mappings SET font_scale = '4A+', v_scale = 'V0', yds_equivalent = '5.9',  french_equivalent = '5',   british_equivalent = 'D',  difficulty_group = 'Beginner'     WHERE grade_index = 7;
UPDATE grade_mappings SET font_scale = '4B',  v_scale = 'V0', yds_equivalent = '5.9',  french_equivalent = '5+',  british_equivalent = 'D',  difficulty_group = 'Beginner'     WHERE grade_index = 8;
UPDATE grade_mappings SET font_scale = '4B+', v_scale = 'V0', yds_equivalent = '5.10a', french_equivalent = '6a',  british_equivalent = 'HVD', difficulty_group = 'Intermediate' WHERE grade_index = 9;
UPDATE grade_mappings SET font_scale = '4C',  v_scale = 'V1', yds_equivalent = '5.10a', french_equivalent = '6a',  british_equivalent = 'S',   difficulty_group = 'Intermediate' WHERE grade_index = 10;
UPDATE grade_mappings SET font_scale = '4C+', v_scale = 'V1', yds_equivalent = '5.10b', french_equivalent = '6a+', british_equivalent = 'VS',  difficulty_group = 'Intermediate' WHERE grade_index = 11;
UPDATE grade_mappings SET font_scale = '5A',  v_scale = 'V1', yds_equivalent = '5.10b', french_equivalent = '6a+', british_equivalent = 'HVS', difficulty_group = 'Intermediate' WHERE grade_index = 12;
UPDATE grade_mappings SET font_scale = '5A+', v_scale = 'V2', yds_equivalent = '5.10c', french_equivalent = '6b',  british_equivalent = 'E1',  difficulty_group = 'Intermediate' WHERE grade_index = 13;
UPDATE grade_mappings SET font_scale = '5B',  v_scale = 'V2', yds_equivalent = '5.10c', french_equivalent = '6b',  british_equivalent = 'E1',  difficulty_group = 'Intermediate' WHERE grade_index = 14;
UPDATE grade_mappings SET font_scale = '5B+', v_scale = 'V2', yds_equivalent = '5.10d', french_equivalent = '6b',  british_equivalent = 'E2',  difficulty_group = 'Intermediate' WHERE grade_index = 15;
UPDATE grade_mappings SET font_scale = '5C',  v_scale = 'V2', yds_equivalent = '5.10d', french_equivalent = '6b+', british_equivalent = 'E2',  difficulty_group = 'Intermediate' WHERE grade_index = 16;
UPDATE grade_mappings SET font_scale = '5C+', v_scale = 'V3', yds_equivalent = '5.11a', french_equivalent = '6b+', british_equivalent = 'E3',  difficulty_group = 'Intermediate' WHERE grade_index = 17;
UPDATE grade_mappings SET font_scale = '6A',  v_scale = 'V3', yds_equivalent = '5.11a', french_equivalent = '6b',  british_equivalent = 'E3',  difficulty_group = 'Intermediate' WHERE grade_index = 18;
UPDATE grade_mappings SET font_scale = '6A+', v_scale = 'V3', yds_equivalent = '5.11b', french_equivalent = '6b+', british_equivalent = 'E3',  difficulty_group = 'Advanced'    WHERE grade_index = 19;
UPDATE grade_mappings SET font_scale = '6B',  v_scale = 'V4', yds_equivalent = '5.11c', french_equivalent = '6c',  british_equivalent = 'E4',  difficulty_group = 'Advanced'    WHERE grade_index = 20;
UPDATE grade_mappings SET font_scale = '6B+', v_scale = 'V4', yds_equivalent = '5.11d', french_equivalent = '6c+', british_equivalent = 'E4',  difficulty_group = 'Advanced'    WHERE grade_index = 21;
UPDATE grade_mappings SET font_scale = '6C',  v_scale = 'V5', yds_equivalent = '5.12a', french_equivalent = '7a',  british_equivalent = 'E5',  difficulty_group = 'Advanced'    WHERE grade_index = 22;
UPDATE grade_mappings SET font_scale = '6C+', v_scale = 'V5', yds_equivalent = '5.12b', french_equivalent = '7a+', british_equivalent = 'E6',  difficulty_group = 'Advanced'    WHERE grade_index = 23;

-- Step 6: Insert new rows 24-41 (formerly 18-35)
INSERT INTO grade_mappings (grade_index, v_scale, font_scale, yds_equivalent, french_equivalent, british_equivalent, difficulty_group) VALUES
(24, 'V6',  '7A',  '5.12b', '7a+', 'E6',  'Advanced'),
(25, 'V6',  '7A+', '5.12c', '7b',  'E7',  'Expert'),
(26, 'V7',  '7B',  '5.13a', '7c',  'E8',  'Expert'),
(27, 'V8',  '7B+', '5.13b', '7c+', 'E9',  'Expert'),
(28, 'V9',  '7C',  '5.13c', '7c+', 'E9',  'Expert'),
(29, 'V10', '7C+', '5.14a', '8a',  'E10', 'Elite'),
(30, 'V11', '8A',  '5.14a', '8a',  'E10', 'Elite'),
(31, 'V12', '8A+', '5.14c', '8a+', 'E11', 'Elite'),
(32, 'V13', '8B',  '5.15a', '8b',  'E11', 'Elite'),
(33, 'V14', '8B+', '5.15b', '8c',  'E11', 'Elite'),
(34, 'V15', '8C',  '5.15c', '9a',  'E11', 'Elite'),
(35, 'V16', '8C+', '5.15d', '9a+', 'E11', 'Elite'),
(36, 'V17', '9A',  '5.15d', '9a+', 'E11', 'Elite'),
(37, 'V17', '9A+', '5.16a', '9b',  'E11', 'Elite'),
(38, 'V18', '9B',  '5.16a', '9b+', 'E11', 'Elite'),
(39, 'V18', '9B+', '5.16b', '9c',  'E12', 'Elite'),
(40, 'V19', '9C',  '5.16c', '9c+', 'E12', 'Elite'),
(41, 'V19', '9C+', '5.16d', '9c+', 'E13', 'Elite')
ON CONFLICT (grade_index) DO NOTHING;

-- Step 7: Migrate legacy Font strings in climbs table
-- Old simplified Font values are not in PUBLIC_GRADES and will crash the app.
UPDATE climbs SET grade = '4A'  WHERE grade = '3';
UPDATE climbs SET grade = '4A+' WHERE grade = '4';
UPDATE climbs SET grade = '4C'  WHERE grade = '5';
UPDATE climbs SET grade = '5B'  WHERE grade = '5+';

-- Step 8: Migrate legacy Font strings in grade_votes table
UPDATE grade_votes SET grade = '4A'  WHERE grade = '3';
UPDATE grade_votes SET grade = '4A+' WHERE grade = '4';
UPDATE grade_votes SET grade = '4C'  WHERE grade = '5';
UPDATE grade_votes SET grade = '5B'  WHERE grade = '5+';

-- Step 9: Backfill grade_index for any climbs missing it
UPDATE climbs
SET grade_index = gm.grade_index
FROM grade_mappings gm
WHERE UPPER(climbs.grade) = gm.font_scale
  AND climbs.grade_index IS NULL
  AND climbs.grade IS NOT NULL;

-- Step 10: Re-add the FK constraint
ALTER TABLE climbs
  ADD CONSTRAINT climbs_grade_index_fkey
  FOREIGN KEY (grade_index) REFERENCES grade_mappings(grade_index);
