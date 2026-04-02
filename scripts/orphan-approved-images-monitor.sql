-- Monitor approved orphan images that should never appear as valid submissions.
-- Replace the user_id literal as needed for targeted checks.

WITH orphan_approved_images AS (
  SELECT
    i.id,
    i.created_by,
    i.submission_id,
    i.crag_id,
    i.created_at,
    COUNT(rl.id) AS route_count
  FROM public.images i
  LEFT JOIN public.route_lines rl ON rl.image_id = i.id
  WHERE i.created_by = '3d4fcee7-7b78-42a5-bac5-8293378a86b2'
    AND i.moderation_status = 'approved'
    AND i.submission_id IS NULL
    AND i.crag_id IS NULL
  GROUP BY i.id, i.created_by, i.submission_id, i.crag_id, i.created_at
  HAVING COUNT(rl.id) = 0
)
SELECT
  COUNT(*) AS orphan_image_count,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM orphan_approved_images;

WITH orphan_approved_images AS (
  SELECT
    i.id,
    i.created_by,
    i.created_at,
    COUNT(rl.id) AS route_count
  FROM public.images i
  LEFT JOIN public.route_lines rl ON rl.image_id = i.id
  WHERE i.created_by = '3d4fcee7-7b78-42a5-bac5-8293378a86b2'
    AND i.moderation_status = 'approved'
    AND i.submission_id IS NULL
    AND i.crag_id IS NULL
  GROUP BY i.id, i.created_by, i.created_at
  HAVING COUNT(rl.id) = 0
)
SELECT id, created_at
FROM orphan_approved_images
ORDER BY created_at DESC;
