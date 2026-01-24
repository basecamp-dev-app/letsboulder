-- Add crag-specific flag types to climb_flags table
-- This allows users to flag crags with relevant issue types

-- First, get the current constraint definition
-- We need to drop and recreate with additional crag-specific types

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE climb_flags DROP CONSTRAINT IF EXISTS climb_flags_flag_type_check;
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- Add new constraint with crag-specific flag types
ALTER TABLE climb_flags ADD CONSTRAINT climb_flags_flag_type_check 
  CHECK (flag_type IN (
    'location', 
    'route_line', 
    'route_name', 
    'image_quality', 
    'wrong_crag',
    'boundary',
    'access',
    'description',
    'rock_type',
    'name',
    'other'
  ));
