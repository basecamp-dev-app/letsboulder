-- Conditionally create index only if countries table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'countries'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_countries_boundary
    ON public.countries
    USING GIST (boundary);
  ELSE
    RAISE NOTICE 'Skipping countries boundary index - table does not exist';
  END IF;
END $$;
