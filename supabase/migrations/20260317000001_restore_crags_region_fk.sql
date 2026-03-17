-- Restore the foreign key relationship between crags and regions
-- This was severed when the regions table was rebuilt for the Atlas hierarchy

-- First, clear orphaned region_ids that reference non-existent regions
UPDATE public.crags 
SET region_id = NULL 
WHERE region_id IS NOT NULL 
AND NOT EXISTS (SELECT 1 FROM public.regions r WHERE r.id = crags.region_id);

-- Add FK from crags to regions
ALTER TABLE public.crags 
ADD CONSTRAINT crags_region_id_fkey 
FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;

-- Add FK from countries to regions (needed for the PostgREST join in crags page)
ALTER TABLE public.countries 
ADD CONSTRAINT countries_region_id_fkey 
FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;
