UPDATE public.images i
SET
  latitude = COALESCE(i.latitude, di.latitude::NUMERIC),
  longitude = COALESCE(i.longitude, di.longitude::NUMERIC),
  capture_date = COALESCE(i.capture_date, di.capture_date)
FROM public.submission_draft_images di
WHERE di.linked_image_id = i.id
  AND (i.latitude IS NULL OR i.longitude IS NULL OR i.capture_date IS NULL)
  AND (di.latitude IS NOT NULL OR di.longitude IS NOT NULL OR di.capture_date IS NOT NULL);

UPDATE public.images i
SET
  latitude = COALESCE(i.latitude, ci.latitude),
  longitude = COALESCE(i.longitude, ci.longitude)
FROM public.crag_images ci
WHERE ci.linked_image_id = i.id
  AND (i.latitude IS NULL OR i.longitude IS NULL)
  AND (ci.latitude IS NOT NULL OR ci.longitude IS NOT NULL);

WITH crag_image_coords AS (
  SELECT
    ci.id,
    COALESCE(ci.latitude, linked.latitude, source.latitude) AS latitude,
    COALESCE(ci.longitude, linked.longitude, source.longitude) AS longitude
  FROM public.crag_images ci
  LEFT JOIN public.images linked ON linked.id = ci.linked_image_id
  LEFT JOIN public.images source ON source.id = ci.source_image_id
)
UPDATE public.crag_images ci
SET
  latitude = COALESCE(ci.latitude, coords.latitude),
  longitude = COALESCE(ci.longitude, coords.longitude)
FROM crag_image_coords coords
WHERE coords.id = ci.id
  AND (coords.latitude IS NOT NULL OR coords.longitude IS NOT NULL)
  AND (ci.latitude IS NULL OR ci.longitude IS NULL);
