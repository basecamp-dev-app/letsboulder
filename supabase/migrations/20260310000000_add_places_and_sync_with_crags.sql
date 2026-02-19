-- =====================================================
-- Places model (indoor + outdoor) with legacy crags sync
-- =====================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('crag', 'gym')),
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  description TEXT,
  access_notes TEXT,
  rock_type VARCHAR(50),
  boundary GEOMETRY(POLYGON, 4326),
  region_name VARCHAR(100),
  country VARCHAR(100),
  country_code VARCHAR(2),
  tide_dependency VARCHAR(20),
  report_count INTEGER NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  slug TEXT,
  primary_discipline TEXT,
  disciplines TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT places_primary_discipline_valid
    CHECK (
      primary_discipline IS NULL
      OR primary_discipline = ANY(ARRAY['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
    ),
  CONSTRAINT places_disciplines_valid
    CHECK (
      disciplines <@ ARRAY['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope']::TEXT[]
    ),
  CONSTRAINT places_primary_discipline_in_disciplines
    CHECK (
      primary_discipline IS NULL
      OR primary_discipline = ANY(disciplines)
    ),
  CONSTRAINT places_gym_disciplines_guard
    CHECK (
      type <> 'gym'
      OR NOT (disciplines && ARRAY['trad', 'deep_water_solo']::TEXT[])
    )
);

CREATE INDEX IF NOT EXISTS idx_places_type ON public.places(type);
CREATE INDEX IF NOT EXISTS idx_places_name ON public.places(name);
CREATE INDEX IF NOT EXISTS idx_places_location ON public.places(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_places_region ON public.places(region_id);
CREATE INDEX IF NOT EXISTS idx_places_country_code ON public.places(country_code);
CREATE INDEX IF NOT EXISTS idx_places_slug ON public.places(slug);
CREATE INDEX IF NOT EXISTS idx_places_boundary ON public.places USING GIST(boundary);

CREATE UNIQUE INDEX IF NOT EXISTS uq_places_country_code_slug
  ON public.places(country_code, slug)
  WHERE country_code IS NOT NULL AND slug IS NOT NULL;

INSERT INTO public.places (
  id,
  type,
  name,
  latitude,
  longitude,
  region_id,
  description,
  access_notes,
  rock_type,
  boundary,
  region_name,
  country,
  country_code,
  tide_dependency,
  report_count,
  is_flagged,
  slug,
  primary_discipline,
  disciplines,
  created_at,
  updated_at
)
SELECT
  c.id,
  'crag'::TEXT,
  c.name,
  c.latitude,
  c.longitude,
  c.region_id,
  c.description,
  c.access_notes,
  c.rock_type,
  c.boundary,
  c.region_name,
  c.country,
  c.country_code,
  c.tide_dependency,
  COALESCE(c.report_count, 0),
  COALESCE(c.is_flagged, false),
  c.slug,
  CASE
    WHEN c.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN c.type
    WHEN c.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END AS primary_discipline,
  ARRAY[
    CASE
      WHEN c.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN c.type
      WHEN c.type = 'crag' THEN 'mixed'
      ELSE 'boulder'
    END
  ]::TEXT[] AS disciplines,
  c.created_at,
  c.updated_at
FROM public.crags c
ON CONFLICT (id) DO UPDATE
SET
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  region_id = EXCLUDED.region_id,
  description = EXCLUDED.description,
  access_notes = EXCLUDED.access_notes,
  rock_type = EXCLUDED.rock_type,
  boundary = EXCLUDED.boundary,
  region_name = EXCLUDED.region_name,
  country = EXCLUDED.country,
  country_code = EXCLUDED.country_code,
  tide_dependency = EXCLUDED.tide_dependency,
  report_count = EXCLUDED.report_count,
  is_flagged = EXCLUDED.is_flagged,
  slug = EXCLUDED.slug,
  primary_discipline = EXCLUDED.primary_discipline,
  disciplines = EXCLUDED.disciplines,
  updated_at = NOW();

ALTER TABLE public.images ADD COLUMN IF NOT EXISTS place_id UUID;
ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS place_id UUID;

UPDATE public.images
SET place_id = crag_id
WHERE place_id IS NULL
  AND crag_id IS NOT NULL;

UPDATE public.climbs
SET place_id = crag_id
WHERE place_id IS NULL
  AND crag_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'images_place_id_fkey'
  ) THEN
    ALTER TABLE public.images
      ADD CONSTRAINT images_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'climbs_place_id_fkey'
  ) THEN
    ALTER TABLE public.climbs
      ADD CONSTRAINT climbs_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_images_place ON public.images(place_id);
CREATE INDEX IF NOT EXISTS idx_climbs_place ON public.climbs(place_id);

CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.places WHERE id = OLD.id AND type = 'crag';
    RETURN OLD;
  END IF;

  resolved_primary := CASE
    WHEN NEW.type IN ('boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope') THEN NEW.type
    WHEN NEW.type = 'crag' THEN 'mixed'
    ELSE 'boulder'
  END;

  INSERT INTO public.places (
    id,
    type,
    name,
    latitude,
    longitude,
    region_id,
    description,
    access_notes,
    rock_type,
    boundary,
    region_name,
    country,
    country_code,
    tide_dependency,
    report_count,
    is_flagged,
    slug,
    primary_discipline,
    disciplines,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'crag',
    NEW.name,
    NEW.latitude,
    NEW.longitude,
    NEW.region_id,
    NEW.description,
    NEW.access_notes,
    NEW.rock_type,
    NEW.boundary,
    NEW.region_name,
    NEW.country,
    NEW.country_code,
    NEW.tide_dependency,
    COALESCE(NEW.report_count, 0),
    COALESCE(NEW.is_flagged, false),
    NEW.slug,
    resolved_primary,
    ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    type = 'crag',
    name = EXCLUDED.name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    region_id = EXCLUDED.region_id,
    description = EXCLUDED.description,
    access_notes = EXCLUDED.access_notes,
    rock_type = EXCLUDED.rock_type,
    boundary = EXCLUDED.boundary,
    region_name = EXCLUDED.region_name,
    country = EXCLUDED.country,
    country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count,
    is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug,
    primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crags_sync_to_places_after_write ON public.crags;
CREATE TRIGGER crags_sync_to_places_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.crags
FOR EACH ROW
EXECUTE FUNCTION public.sync_crag_to_place();

CREATE OR REPLACE FUNCTION public.sync_place_to_crag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'crag' THEN
      DELETE FROM public.crags WHERE id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.type = 'crag' THEN
    INSERT INTO public.crags (
      id,
      name,
      latitude,
      longitude,
      region_id,
      description,
      access_notes,
      rock_type,
      type,
      created_at,
      updated_at,
      report_count,
      is_flagged,
      boundary,
      region_name,
      country,
      tide_dependency,
      country_code,
      slug
    )
    VALUES (
      NEW.id,
      NEW.name,
      NEW.latitude,
      NEW.longitude,
      NEW.region_id,
      NEW.description,
      NEW.access_notes,
      NEW.rock_type,
      COALESCE(NEW.primary_discipline, 'boulder'),
      COALESCE(NEW.created_at, NOW()),
      COALESCE(NEW.updated_at, NOW()),
      COALESCE(NEW.report_count, 0),
      COALESCE(NEW.is_flagged, false),
      NEW.boundary,
      NEW.region_name,
      NEW.country,
      NEW.tide_dependency,
      NEW.country_code,
      NEW.slug
    )
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      region_id = EXCLUDED.region_id,
      description = EXCLUDED.description,
      access_notes = EXCLUDED.access_notes,
      rock_type = EXCLUDED.rock_type,
      type = EXCLUDED.type,
      updated_at = NOW(),
      report_count = EXCLUDED.report_count,
      is_flagged = EXCLUDED.is_flagged,
      boundary = EXCLUDED.boundary,
      region_name = EXCLUDED.region_name,
      country = EXCLUDED.country,
      tide_dependency = EXCLUDED.tide_dependency,
      country_code = EXCLUDED.country_code,
      slug = EXCLUDED.slug;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS places_sync_to_crags_after_write ON public.places;
CREATE TRIGGER places_sync_to_crags_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.places
FOR EACH ROW
EXECUTE FUNCTION public.sync_place_to_crag();

DO $$
BEGIN
  ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'places'
      AND policyname = 'Public read places'
  ) THEN
    CREATE POLICY "Public read places"
      ON public.places
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'places'
      AND policyname = 'Authenticated create places'
  ) THEN
    CREATE POLICY "Authenticated create places"
      ON public.places
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
