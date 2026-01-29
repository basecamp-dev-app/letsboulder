-- Add stable, SEO-friendly slugs for crags and routes
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- Columns
-- =====================================================

ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE public.crags ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.climbs ADD COLUMN IF NOT EXISTS slug TEXT;

-- =====================================================
-- Slug helper
-- =====================================================

CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- =====================================================
-- Backfill crag_id on climbs (best-effort)
-- =====================================================

UPDATE public.climbs c
SET crag_id = x.crag_id
FROM (
  SELECT rl.climb_id, min(i.crag_id::text)::uuid AS crag_id
  FROM public.route_lines rl
  JOIN public.images i ON i.id = rl.image_id
  WHERE i.crag_id IS NOT NULL
  GROUP BY rl.climb_id
) x
WHERE c.crag_id IS NULL
  AND c.id = x.climb_id
  AND x.crag_id IS NOT NULL;

-- =====================================================
-- Backfill country_code on crags from region
-- =====================================================

UPDATE public.crags c
SET country_code = upper(r.country_code)
FROM public.regions r
WHERE c.country_code IS NULL
  AND c.region_id = r.id
  AND r.country_code IS NOT NULL;

-- =====================================================
-- Backfill crag slugs (unique per country_code)
-- =====================================================

WITH base AS (
  SELECT
    id,
    country_code,
    NULLIF(public.slugify(name), '') AS base_slug
  FROM public.crags
  WHERE slug IS NULL OR slug = ''
),
ranked AS (
  SELECT
    id,
    country_code,
    coalesce(base_slug, 'crag') AS base_slug,
    row_number() OVER (PARTITION BY country_code, coalesce(base_slug, 'crag') ORDER BY id) AS rn
  FROM base
)
UPDATE public.crags c
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn::text END
FROM ranked r
WHERE c.id = r.id;

-- =====================================================
-- Backfill climb slugs (unique per crag_id)
-- =====================================================

WITH base AS (
  SELECT
    id,
    crag_id,
    NULLIF(public.slugify(name), '') AS base_slug
  FROM public.climbs
  WHERE (slug IS NULL OR slug = '')
    AND crag_id IS NOT NULL
),
ranked AS (
  SELECT
    id,
    crag_id,
    coalesce(base_slug, 'route') AS base_slug,
    row_number() OVER (PARTITION BY crag_id, coalesce(base_slug, 'route') ORDER BY id) AS rn
  FROM base
)
UPDATE public.climbs c
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn::text END
FROM ranked r
WHERE c.id = r.id;

-- =====================================================
-- Indexes / constraints
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_crags_country_code ON public.crags(country_code);
CREATE INDEX IF NOT EXISTS idx_crags_slug ON public.crags(slug);
CREATE INDEX IF NOT EXISTS idx_climbs_slug ON public.climbs(slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crags_country_code_slug
  ON public.crags(country_code, slug)
  WHERE country_code IS NOT NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_climbs_crag_id_slug
  ON public.climbs(crag_id, slug)
  WHERE crag_id IS NOT NULL AND slug IS NOT NULL;
