-- Add displayed dimensions columns to route_lines for correct route rendering
-- These store the image dimensions at the time the route was drawn
ALTER TABLE route_lines ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE route_lines ADD COLUMN IF NOT EXISTS image_height INTEGER;

-- Update existing routes to use natural dimensions as fallback
UPDATE route_lines
SET image_width = (SELECT natural_width FROM images WHERE images.id = route_lines.image_id),
    image_height = (SELECT natural_height FROM images WHERE images.id = route_lines.image_id)
WHERE image_width IS NULL AND image_height IS NULL
  AND EXISTS (SELECT 1 FROM images WHERE images.id = route_lines.image_id AND natural_width IS NOT NULL);
