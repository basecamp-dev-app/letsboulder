-- Increase grade_system column size to accommodate new values
ALTER TABLE profiles ALTER COLUMN grade_system TYPE VARCHAR(20);
