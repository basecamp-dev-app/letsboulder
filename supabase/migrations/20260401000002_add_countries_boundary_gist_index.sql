CREATE INDEX IF NOT EXISTS idx_countries_boundary
ON public.countries
USING GIST (boundary);
