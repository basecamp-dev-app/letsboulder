-- Add sector_id to climbs table
ALTER TABLE public.climbs 
ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL;
