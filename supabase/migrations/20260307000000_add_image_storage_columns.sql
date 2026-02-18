ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS storage_bucket TEXT;

ALTER TABLE public.images
ADD COLUMN IF NOT EXISTS storage_path TEXT;

UPDATE public.images
SET
  storage_bucket = 'route-uploads',
  storage_path = split_part(split_part(url, '/route-uploads/', 2), '?', 1)
WHERE
  storage_bucket IS NULL
  AND storage_path IS NULL
  AND url LIKE '%/route-uploads/%';

CREATE INDEX IF NOT EXISTS idx_images_storage_location
ON public.images(storage_bucket, storage_path);
