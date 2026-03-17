-- Enable PostGIS extension (~50MB)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column to crags for precise point matching
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_crags_location ON public.crags USING GIST (location);

-- Add geometry column to regions for boundary containment checks
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon, 4326);
CREATE INDEX IF NOT EXISTS idx_regions_boundary ON public.regions USING GIST (boundary);