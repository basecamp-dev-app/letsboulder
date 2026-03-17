-- Migrate existing crag coordinates to geography type
UPDATE public.crags
SET location = ST_SetSRID(ST_Point(longitude, latitude), 4326)::geography
WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND location IS NULL;

-- Template for region boundaries (Morocco, Spain, France examples)
-- Note: These are simplified polygons - replace with Natural Earth data
-- DELETED: Region boundary updates moved to countries table with Natural Earth geometries