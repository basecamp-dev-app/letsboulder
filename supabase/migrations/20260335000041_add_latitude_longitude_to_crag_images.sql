-- Add EXIF GPS columns to crag_images table
-- DECIMAL(8,6) allows -90.000000 to 90.000000 (11cm precision)
-- DECIMAL(9,6) allows -180.000000 to 180.000000 (11cm precision)

ALTER TABLE public.crag_images
ADD COLUMN IF NOT EXISTS latitude DECIMAL(8,6) NULL,
ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6) NULL;

-- Create spatial index for efficient location queries
CREATE INDEX IF NOT EXISTS idx_crag_images_location 
ON public.crag_images(latitude, longitude);

-- Add check constraints for coordinate validity
ALTER TABLE public.crag_images
ADD CONSTRAINT crag_images_latitude_check 
CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE public.crag_images
ADD CONSTRAINT crag_images_longitude_check 
CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
