-- Backfill country_id on crags from existing country_code
-- Fix for 404 errors on map pins after geography migration

UPDATE crags c
SET country_id = (
  SELECT id FROM countries co 
  WHERE co.iso_a2 = c.country_code
)
WHERE c.country_id IS NULL AND c.country_code IS NOT NULL;
