-- Migration: Find Region by Location
-- Purpose: Find nearest region within 50km of GPS point using PostGIS
-- Created: 2026-01-11

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create function to find nearest region by location
CREATE OR REPLACE FUNCTION find_region_by_location(
  search_lat double precision,
  search_lng double precision
)
RETURNS TABLE (
  id uuid,
  name varchar(100),
  country_code varchar(2),
  center_lat decimal(10,8),
  center_lon decimal(11,8),
  distance_meters double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.country_code,
    r.center_lat,
    r.center_lon,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(r.center_lon, r.center_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography
    ) AS distance_meters
  FROM regions r
  WHERE r.center_lat IS NOT NULL AND r.center_lon IS NOT NULL
  ORDER BY distance_meters ASC
  LIMIT 1;
END;
$$;

-- Add indexes for region location queries
CREATE INDEX IF NOT EXISTS idx_regions_center ON regions(center_lat, center_lon);
