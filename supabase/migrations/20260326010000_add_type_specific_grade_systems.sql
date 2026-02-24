-- Add type-specific grade system columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boulder_system VARCHAR(20) DEFAULT 'v_scale';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS route_system VARCHAR(20) DEFAULT 'yds_equivalent';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trad_system VARCHAR(20) DEFAULT 'yds_equivalent';

-- Migrate existing grade_system to boulder_system for backward compatibility
UPDATE profiles 
SET boulder_system = CASE 
  WHEN grade_system = 'v' THEN 'v_scale'
  WHEN grade_system = 'font' THEN 'font_scale'
  ELSE 'v_scale'
END
WHERE boulder_system = 'v_scale';
