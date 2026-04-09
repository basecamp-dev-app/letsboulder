CREATE TABLE IF NOT EXISTS public.crag_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crag_id UUID NOT NULL REFERENCES public.crags(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(trim(url)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crag_images_crag_id ON public.crag_images(crag_id);
CREATE INDEX IF NOT EXISTS idx_crag_images_created_at ON public.crag_images(created_at DESC);
