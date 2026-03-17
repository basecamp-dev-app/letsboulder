-- Migration: Restore PostGIS and add boundary column to countries
-- Date: 2026-03-16
-- Purpose: Re-enable PostGIS for Zero-Click GPS resolution

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add boundary column to countries table
ALTER TABLE public.countries 
ADD COLUMN IF NOT EXISTS boundary geometry(Geometry, 4326);

-- Create spatial index for fast lookups (GiST index on geometry)
CREATE INDEX IF NOT EXISTS idx_countries_boundary 
ON public.countries USING GIST(boundary);
