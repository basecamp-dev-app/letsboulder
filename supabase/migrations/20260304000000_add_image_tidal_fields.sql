ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS is_tidal boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS tidal_max_height_m numeric(6,2),
ADD COLUMN IF NOT EXISTS tidal_buffer_min integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS tidal_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_tidal_buffer_non_negative'
  ) THEN
    ALTER TABLE public.images
    ADD CONSTRAINT images_tidal_buffer_non_negative
    CHECK (tidal_buffer_min >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_tidal_requires_max_height'
  ) THEN
    ALTER TABLE public.images
    ADD CONSTRAINT images_tidal_requires_max_height
    CHECK ((NOT is_tidal) OR tidal_max_height_m IS NOT NULL);
  END IF;
END $$;
