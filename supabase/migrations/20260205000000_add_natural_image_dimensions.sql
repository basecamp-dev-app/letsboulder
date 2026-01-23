-- Add natural dimensions columns for correct route coordinate mapping
-- These columns store the actual image dimensions (from the image file itself)
-- which are used for route coordinate normalization and rendering

ALTER TABLE images ADD COLUMN IF NOT EXISTS natural_width INTEGER;
ALTER TABLE images ADD COLUMN IF NOT EXISTS natural_height INTEGER;

-- Update existing images that have width/height but no natural dimensions
-- This is a safe update that populates natural dimensions from existing width/height
UPDATE images
SET natural_width = width,
    natural_height = height
WHERE natural_width IS NULL
  AND natural_height IS NULL
  AND width IS NOT NULL
  AND width > 0;
