ALTER TABLE public.crag_images
ADD COLUMN IF NOT EXISTS width INTEGER,
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS linked_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crag_images_linked_image_id
ON public.crag_images(linked_image_id);
