-- 1. Extend images table with atlas hierarchy columns
ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id);

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS country_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS admin_region_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS un_region_name text;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS continent_name text;

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_images_country_id ON public.images(country_id);
CREATE INDEX IF NOT EXISTS idx_images_country_code ON public.images(country_code);
CREATE INDEX IF NOT EXISTS idx_images_continent ON public.images(continent_name);

-- 3. Add comment explaining the source of truth
COMMENT ON COLUMN public.images.country_id IS 'Derived from location GPS via Natural Earth Admin-0 boundaries';

-- 4. Backfill existing images with atlas data using ST_Point constructor
-- NOTE: ST_Covers check was disabled here because countries.boundary was not yet populated.
-- Boundaries were populated later in 20260335000047_fix_get_upload_context_country_lookup.sql.
-- This migration is historical and should not be re-run. New images get country resolution
-- via get_upload_context RPC which uses ST_Covers with the GIST index on countries.boundary.
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
  AND false; -- Disabled: was historical, boundaries populated in 20260335000047
