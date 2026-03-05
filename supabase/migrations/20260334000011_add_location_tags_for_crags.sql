-- Crag-first location tags (region + optional sub-area)

CREATE TABLE IF NOT EXISTS public.location_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('region', 'sub_area')),
  name VARCHAR(120) NOT NULL,
  slug TEXT NOT NULL,
  country_code VARCHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_tags_kind ON public.location_tags(kind);
CREATE INDEX IF NOT EXISTS idx_location_tags_name ON public.location_tags(name);
CREATE INDEX IF NOT EXISTS idx_location_tags_country_code ON public.location_tags(country_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_tags_kind_country_name
  ON public.location_tags(kind, COALESCE(country_code, ''), LOWER(name));

CREATE TABLE IF NOT EXISTS public.crag_location_tags (
  crag_id UUID NOT NULL REFERENCES public.crags(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.location_tags(id) ON DELETE CASCADE,
  is_primary_region BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (crag_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_crag_location_tags_crag_id ON public.crag_location_tags(crag_id);
CREATE INDEX IF NOT EXISTS idx_crag_location_tags_tag_id ON public.crag_location_tags(tag_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crag_primary_region_tag
  ON public.crag_location_tags(crag_id)
  WHERE is_primary_region;

ALTER TABLE public.crags
  ADD COLUMN IF NOT EXISTS sub_area VARCHAR(120);

WITH crag_region_candidates AS (
  SELECT DISTINCT
    TRIM(COALESCE(NULLIF(c.region_name, ''), NULLIF(r.name, ''))) AS region_name,
    NULLIF(UPPER(TRIM(COALESCE(c.country_code, r.country_code, ''))), '') AS country_code
  FROM public.crags c
  LEFT JOIN public.regions r ON r.id = c.region_id
  WHERE TRIM(COALESCE(NULLIF(c.region_name, ''), NULLIF(r.name, ''))) <> ''
)
INSERT INTO public.location_tags (kind, name, slug, country_code)
SELECT
  'region',
  candidate.region_name,
  TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(candidate.region_name), '[^a-z0-9]+', '-', 'g')),
  candidate.country_code
FROM crag_region_candidates candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM public.location_tags existing
  WHERE existing.kind = 'region'
    AND COALESCE(existing.country_code, '') = COALESCE(candidate.country_code, '')
    AND LOWER(existing.name) = LOWER(candidate.region_name)
);

WITH crag_regions AS (
  SELECT
    c.id AS crag_id,
    TRIM(COALESCE(NULLIF(c.region_name, ''), NULLIF(r.name, ''))) AS region_name,
    NULLIF(UPPER(TRIM(COALESCE(c.country_code, r.country_code, ''))), '') AS country_code
  FROM public.crags c
  LEFT JOIN public.regions r ON r.id = c.region_id
  WHERE TRIM(COALESCE(NULLIF(c.region_name, ''), NULLIF(r.name, ''))) <> ''
)
INSERT INTO public.crag_location_tags (crag_id, tag_id, is_primary_region)
SELECT
  cr.crag_id,
  lt.id,
  true
FROM crag_regions cr
JOIN public.location_tags lt
  ON lt.kind = 'region'
 AND LOWER(lt.name) = LOWER(cr.region_name)
 AND COALESCE(lt.country_code, '') = COALESCE(cr.country_code, '')
WHERE NOT EXISTS (
  SELECT 1
  FROM public.crag_location_tags existing
  WHERE existing.crag_id = cr.crag_id
    AND existing.tag_id = lt.id
);

ALTER TABLE public.location_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crag_location_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'location_tags'
      AND policyname = 'Public read location tags'
  ) THEN
    CREATE POLICY "Public read location tags"
      ON public.location_tags
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
      AND tablename = 'location_tags'
      AND policyname = 'Authenticated create location tags'
  ) THEN
    CREATE POLICY "Authenticated create location tags"
      ON public.location_tags
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crag_location_tags'
      AND policyname = 'Public read crag location tags'
  ) THEN
    CREATE POLICY "Public read crag location tags"
      ON public.crag_location_tags
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
      AND tablename = 'crag_location_tags'
      AND policyname = 'Authenticated create crag location tags'
  ) THEN
    CREATE POLICY "Authenticated create crag location tags"
      ON public.crag_location_tags
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
