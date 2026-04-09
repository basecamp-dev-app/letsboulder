-- Add British E-grade equivalents to grade_mappings
ALTER TABLE grade_mappings ADD COLUMN IF NOT EXISTS british_equivalent VARCHAR(10);

UPDATE grade_mappings SET british_equivalent = 
  CASE grade_index
    WHEN 0 THEN 'VB'       -- 5.6 / 4
    WHEN 1 THEN 'V0'       -- 5.9 / 5
    WHEN 2 THEN 'E1'       -- 5.10a / 6a
    WHEN 3 THEN 'E2'       -- 5.10c / 6a+
    WHEN 4 THEN 'E3'       -- 5.11a / 6b
    WHEN 5 THEN 'E4'       -- 5.11c / 6c
    WHEN 6 THEN 'E5'       -- 5.12a / 7a
    WHEN 7 THEN 'E6'       -- 5.12b / 7a+
    WHEN 8 THEN 'E7'       -- 5.13a / 7b
    WHEN 9 THEN 'E8'       -- 5.13b / 7c
    WHEN 10 THEN 'E9'      -- 5.13c / 7c+
    WHEN 11 THEN 'E10'     -- 5.14a / 8a
    WHEN 12 THEN 'E11'     -- 5.14c / 8a+
    WHEN 13 THEN 'E11'     -- 5.15a / 8b
    WHEN 14 THEN 'E11'     -- 5.15b / 8c
    WHEN 15 THEN 'E11'     -- 5.15c / 9a
    WHEN 16 THEN 'E11'     -- 5.15d / 9a+
    WHEN 17 THEN 'E11'     -- 5.16a / 9b
  END;
