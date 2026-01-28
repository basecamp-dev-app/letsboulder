-- Allow crag coordinates to be NULL (will be calculated from climbs later)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'crags'
      AND a.attname = 'latitude'
      AND a.attnotnull
  ) THEN
    ALTER TABLE public.crags ALTER COLUMN latitude DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'crags'
      AND a.attname = 'longitude'
      AND a.attnotnull
  ) THEN
    ALTER TABLE public.crags ALTER COLUMN longitude DROP NOT NULL;
  END IF;
END $$;
