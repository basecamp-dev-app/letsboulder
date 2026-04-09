-- =====================================================
-- Harden bidirectional crags <-> places sync triggers
-- Add synced_at columns and improved guard conditions
-- to prevent infinite trigger loops and deadlocks
-- =====================================================

-- Step 1: Recreate functions first (before adding columns)
-- so that any trigger fired during column addition uses updated logic

-- =====================================================
-- sync_crag_to_place: crags -> places (preliminary version)
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  -- Guard 1: Prevent direct trigger recursion
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
    id, type, name, latitude, longitude, region_id, description, access_notes,
    rock_type, region_name, country, country_code, tide_dependency,
    report_count, is_flagged, slug, primary_discipline, disciplines,
    created_at, updated_at
  )
  VALUES (
    NEW.id, 'crag', NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
    NEW.description, NEW.access_notes, NEW.rock_type,
    NEW.region_name, NEW.country, NEW.country_code, NEW.tide_dependency,
    COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false),
    NEW.slug, resolved_primary, ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
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

-- =====================================================
-- sync_place_to_crag: places -> crags (preliminary version)
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_place_to_crag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard 1: Prevent direct trigger recursion
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
      id, name, latitude, longitude, region_id, description, access_notes,
      rock_type, type, created_at, updated_at, report_count, is_flagged,
      region_name, country, tide_dependency, country_code, slug
    )
    VALUES (
      NEW.id, NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
      NEW.description, NEW.access_notes, NEW.rock_type,
      COALESCE(NEW.primary_discipline, 'boulder'),
      COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
      COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false),
      NEW.region_name, NEW.country, NEW.tide_dependency,
      NEW.country_code, NEW.slug
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
      region_name = EXCLUDED.region_name,
      country = EXCLUDED.country,
      tide_dependency = EXCLUDED.tide_dependency,
      country_code = EXCLUDED.country_code,
      slug = EXCLUDED.slug;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 2: Add synced_at columns
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

-- Step 3: Initialize synced_at to updated_at for existing rows
-- Disable user triggers to prevent infinite loops during backfill
-- (DISABLE TRIGGER USER only affects user-defined triggers, not system FK triggers)
ALTER TABLE public.crags DISABLE TRIGGER USER;
ALTER TABLE public.places DISABLE TRIGGER USER;
UPDATE public.crags SET synced_at = COALESCE(updated_at, NOW()) WHERE synced_at IS NULL;
UPDATE public.places SET synced_at = COALESCE(updated_at, NOW()) WHERE synced_at IS NULL;
ALTER TABLE public.crags ENABLE TRIGGER USER;
ALTER TABLE public.places ENABLE TRIGGER USER;

-- Step 4: Recreate final versions with synced_at guard

-- =====================================================
-- sync_crag_to_place: crags -> places (final version with synced_at guard)
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_crag_to_place()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_primary TEXT;
BEGIN
  -- Guard 1: Prevent direct trigger recursion
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Guard 2: Skip if this row was just synced (prevents indirect loops)
  IF TG_OP = 'UPDATE' AND NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
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
    id, type, name, latitude, longitude, region_id, description, access_notes,
    rock_type, region_name, country, country_code, tide_dependency,
    report_count, is_flagged, slug, primary_discipline, disciplines,
    created_at, updated_at, synced_at
  )
  VALUES (
    NEW.id, 'crag', NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
    NEW.description, NEW.access_notes, NEW.rock_type,
    NEW.region_name, NEW.country, NEW.country_code, NEW.tide_dependency,
    COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false),
    NEW.slug, resolved_primary, ARRAY[resolved_primary]::TEXT[],
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
    NOW()
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
    region_name = EXCLUDED.region_name,
    country = EXCLUDED.country,
    country_code = EXCLUDED.country_code,
    tide_dependency = EXCLUDED.tide_dependency,
    report_count = EXCLUDED.report_count,
    is_flagged = EXCLUDED.is_flagged,
    slug = EXCLUDED.slug,
    primary_discipline = EXCLUDED.primary_discipline,
    disciplines = EXCLUDED.disciplines,
    updated_at = NOW(),
    synced_at = NOW();

  RETURN NEW;
END;
$$;

-- =====================================================
-- sync_place_to_crag: places -> crags (final version with synced_at guard)
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_place_to_crag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Guard 1: Prevent direct trigger recursion
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Guard 2: Skip if this row was just synced (prevents indirect loops)
  IF TG_OP = 'UPDATE' AND NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
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
      id, name, latitude, longitude, region_id, description, access_notes,
      rock_type, type, created_at, updated_at, report_count, is_flagged,
      region_name, country, tide_dependency, country_code, slug,
      synced_at
    )
    VALUES (
      NEW.id, NEW.name, NEW.latitude, NEW.longitude, NEW.region_id,
      NEW.description, NEW.access_notes, NEW.rock_type,
      COALESCE(NEW.primary_discipline, 'boulder'),
      COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW()),
      COALESCE(NEW.report_count, 0), COALESCE(NEW.is_flagged, false),
      NEW.region_name, NEW.country, NEW.tide_dependency,
      NEW.country_code, NEW.slug, NOW()
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
      region_name = EXCLUDED.region_name,
      country = EXCLUDED.country,
      tide_dependency = EXCLUDED.tide_dependency,
      country_code = EXCLUDED.country_code,
      slug = EXCLUDED.slug,
      synced_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;
