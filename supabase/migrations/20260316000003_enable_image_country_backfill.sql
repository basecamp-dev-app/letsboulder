-- Migration: Enable image country backfill with spatial join
-- Date: 2026-03-16
-- Purpose: Populate atlas metadata for all existing images using ST_Covers

UPDATE public.images i
SET
  country_id = c.id,
  country_code = c.iso_a2,
  country_name = c.name,
  admin_region_name = r.name,
  un_region_name = r.un_region_name,
  continent_name = u.continent_name
FROM public.countries c
JOIN public.regions r ON c.region_id = r.id
JOIN public.un_regions u ON r.un_region_name = u.name
WHERE i.latitude IS NOT NULL
  AND i.longitude IS NOT NULL
  AND i.country_id IS NULL
  AND ST_Covers(c.boundary, ST_SetSRID(ST_Point(i.longitude, i.latitude), 4326));
