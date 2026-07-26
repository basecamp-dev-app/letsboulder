-- Enable RLS on public reference tables (lint: rls_disabled_in_public)
-- These are static lookup tables; public read access is appropriate.

ALTER TABLE public.continents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.un_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Public read policies for reference data
CREATE POLICY "Public read continents" ON public.continents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read un_regions" ON public.un_regions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read countries" ON public.countries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read regions" ON public.regions FOR SELECT TO anon, authenticated USING (true);