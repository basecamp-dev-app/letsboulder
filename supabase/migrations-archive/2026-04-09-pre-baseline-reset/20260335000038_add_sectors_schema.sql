-- 1. Create the sectors table
CREATE TABLE IF NOT EXISTS public.sectors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    name text NOT NULL,
    crag_id uuid REFERENCES public.crags(id) ON DELETE CASCADE NOT NULL
);

-- 2. Add sector_id to crag_images
ALTER TABLE public.crag_images 
ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL;

-- 3. Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- 4. Simple Select Policy
CREATE POLICY "Sectors are viewable by everyone" 
ON public.sectors FOR SELECT USING (true);
