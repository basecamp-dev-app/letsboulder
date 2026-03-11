UPDATE public.images
SET
  visibility = 'public',
  moderation_status = 'approved',
  processing_status = 'ready',
  status = 'approved'
WHERE crag_id IS NOT NULL
  AND visibility = 'private'
  AND COALESCE(moderation_status, 'pending') = 'pending'
  AND COALESCE(processing_status, 'pending') = 'pending'
  AND COALESCE(status, 'pending') = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.route_lines
    WHERE route_lines.image_id = images.id
  );
