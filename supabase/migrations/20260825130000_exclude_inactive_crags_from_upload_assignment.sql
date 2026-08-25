CREATE OR REPLACE FUNCTION public.get_upload_context(
  search_lat double precision,
  search_lng double precision
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  result json;
  search_point extensions.geography;
BEGIN
  search_point := extensions.ST_SetSRID(
    extensions.ST_Point(search_lng, search_lat),
    4326
  )::extensions.geography;

  SELECT pg_catalog.json_build_object(
    'continent', (
      SELECT pg_catalog.json_build_object('name', un_region.continent_name)
      FROM public.countries AS country
      JOIN public.regions AS region ON country.region_id = region.id
      JOIN public.un_regions AS un_region ON region.un_region_name = un_region.name
      WHERE extensions.ST_Covers(
        country.boundary,
        extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
      )
      LIMIT 1
    ),
    'un_region', (
      SELECT pg_catalog.json_build_object(
        'name', region.un_region_name,
        'continent_name', un_region.continent_name
      )
      FROM public.countries AS country
      JOIN public.regions AS region ON country.region_id = region.id
      JOIN public.un_regions AS un_region ON region.un_region_name = un_region.name
      WHERE extensions.ST_Covers(
        country.boundary,
        extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
      )
      LIMIT 1
    ),
    'region', (
      SELECT pg_catalog.json_build_object(
        'name', region.name,
        'country_code', country.iso_a2
      )
      FROM public.countries AS country
      JOIN public.regions AS region ON country.region_id = region.id
      WHERE extensions.ST_Covers(
        country.boundary,
        extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
      )
      LIMIT 1
    ),
    'country', (
      SELECT pg_catalog.json_build_object(
        'id', country.id,
        'name', country.name,
        'iso_a2', country.iso_a2
      )
      FROM public.countries AS country
      WHERE extensions.ST_Covers(
        country.boundary,
        extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
      )
      LIMIT 1
    ),
    'country_intersects', (
      SELECT pg_catalog.json_build_object(
        'id', country.id,
        'name', country.name,
        'iso_a2', country.iso_a2
      )
      FROM public.countries AS country
      WHERE extensions.ST_Intersects(
          country.boundary,
          extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
        )
        AND NOT extensions.ST_Covers(
          country.boundary,
          extensions.ST_SetSRID(extensions.ST_Point(search_lng, search_lat), 4326)
        )
      LIMIT 1
    ),
    'crag', (
      SELECT COALESCE(
        (
          SELECT pg_catalog.json_build_object(
            'id', crag.id,
            'name', crag.name,
            'distance_meters', extensions.ST_Distance(crag.location, search_point)
          )
          FROM public.crags AS crag
          WHERE crag.deleted_at IS NULL
            AND crag.superseded_by IS NULL
            AND crag.location IS NOT NULL
            AND extensions.ST_DWithin(crag.location, search_point, 150)
          ORDER BY crag.location OPERATOR(extensions.<->) search_point, crag.id
          LIMIT 1
        ),
        (
          SELECT pg_catalog.json_build_object(
            'id', fallback.crag_id,
            'name', fallback.crag_name,
            'distance_meters', fallback.closest_image_distance_meters
          )
          FROM (
            SELECT
              crag_image.crag_id,
              crag.name AS crag_name,
              MIN(extensions.ST_Distance(
                extensions.ST_SetSRID(
                  extensions.ST_Point(crag_image.longitude, crag_image.latitude),
                  4326
                )::extensions.geography,
                search_point
              )) AS closest_image_distance_meters,
              COUNT(*) AS nearby_image_count
            FROM public.crag_images AS crag_image
            JOIN public.crags AS crag ON crag.id = crag_image.crag_id
            WHERE crag.deleted_at IS NULL
              AND crag.superseded_by IS NULL
              AND crag_image.latitude IS NOT NULL
              AND crag_image.longitude IS NOT NULL
              AND extensions.ST_DWithin(
                extensions.ST_SetSRID(
                  extensions.ST_Point(crag_image.longitude, crag_image.latitude),
                  4326
                )::extensions.geography,
                search_point,
                50
              )
            GROUP BY crag_image.crag_id, crag.name
            ORDER BY closest_image_distance_meters, nearby_image_count DESC, crag.name, crag_image.crag_id
            LIMIT 1
          ) AS fallback
        )
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_submission_draft_active_crag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.crag_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crags AS crag
    WHERE crag.id = NEW.crag_id
      AND crag.deleted_at IS NULL
      AND crag.superseded_by IS NULL
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Draft cannot be associated with an unavailable crag',
      DETAIL = 'inactive_crag';
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.submission_drafts AS draft
SET crag_id = NULL
FROM public.crags AS crag
WHERE draft.crag_id = crag.id
  AND draft.status = 'draft'
  AND (crag.deleted_at IS NOT NULL OR crag.superseded_by IS NOT NULL);

DROP TRIGGER IF EXISTS ensure_submission_draft_active_crag_trigger ON public.submission_drafts;
CREATE TRIGGER ensure_submission_draft_active_crag_trigger
BEFORE INSERT OR UPDATE OF crag_id ON public.submission_drafts
FOR EACH ROW EXECUTE FUNCTION public.ensure_submission_draft_active_crag();

REVOKE ALL ON FUNCTION public.ensure_submission_draft_active_crag() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_submission_draft_active_crag() FROM anon, authenticated, service_role;
