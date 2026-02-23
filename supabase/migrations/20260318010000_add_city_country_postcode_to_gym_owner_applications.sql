ALTER TABLE public.gym_owner_applications
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS postcode_or_zip TEXT;

UPDATE public.gym_owner_applications
SET
  city = COALESCE(NULLIF(city, ''), 'Unknown'),
  country = COALESCE(NULLIF(country, ''), 'Unknown'),
  postcode_or_zip = COALESCE(NULLIF(postcode_or_zip, ''), 'Unknown')
WHERE city IS NULL OR city = '' OR country IS NULL OR country = '' OR postcode_or_zip IS NULL OR postcode_or_zip = '';

ALTER TABLE public.gym_owner_applications
  ALTER COLUMN city SET NOT NULL,
  ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN postcode_or_zip SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_city_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_city_length CHECK (char_length(city) BETWEEN 1 AND 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_country_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_country_length CHECK (char_length(country) BETWEEN 1 AND 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gym_owner_applications_postcode_or_zip_length'
      AND conrelid = 'public.gym_owner_applications'::regclass
  ) THEN
    ALTER TABLE public.gym_owner_applications
      ADD CONSTRAINT gym_owner_applications_postcode_or_zip_length CHECK (char_length(postcode_or_zip) BETWEEN 1 AND 32);
  END IF;
END $$;
