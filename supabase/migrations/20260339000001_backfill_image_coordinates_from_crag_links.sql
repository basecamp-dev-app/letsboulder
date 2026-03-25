WITH selectable_image_coords AS (
  SELECT DISTINCT ON (target.id)
    target.id AS target_id,
    source.latitude AS latitude,
    source.longitude AS longitude
  FROM public.crag_images ci
  JOIN public.images target
    ON target.id IN (ci.linked_image_id, ci.source_image_id)
  JOIN public.images source
    ON source.id = CASE
      WHEN target.id = ci.linked_image_id THEN ci.source_image_id
      ELSE ci.linked_image_id
    END
  WHERE ci.linked_image_id IS NOT NULL
    AND ci.source_image_id IS NOT NULL
    AND target.crag_id = ci.crag_id
    AND (target.latitude IS NULL OR target.longitude IS NULL)
    AND source.latitude IS NOT NULL
    AND source.longitude IS NOT NULL
  ORDER BY target.id, source.id
)
UPDATE public.images i
SET
  latitude = COALESCE(i.latitude, coords.latitude),
  longitude = COALESCE(i.longitude, coords.longitude)
FROM selectable_image_coords coords
WHERE coords.target_id = i.id
  AND (i.latitude IS NULL OR i.longitude IS NULL);
