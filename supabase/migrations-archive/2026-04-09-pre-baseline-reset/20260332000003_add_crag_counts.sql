-- =====================================================
-- Add image_count and route_count to crags table
-- Created: 2026-02-25
-- =====================================================

-- Add columns
ALTER TABLE public.crags 
  ADD COLUMN IF NOT EXISTS image_count INTEGER DEFAULT 0;

ALTER TABLE public.crags 
  ADD COLUMN IF NOT EXISTS route_count INTEGER DEFAULT 0;

-- Create index for efficient sorting/filtering
CREATE INDEX IF NOT EXISTS idx_crags_image_count ON public.crags(image_count);
CREATE INDEX IF NOT EXISTS idx_crags_route_count ON public.crags(route_count);

-- Create function to recompute counts
CREATE OR REPLACE FUNCTION public.recompute_crag_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.crags c SET
    image_count = (
      SELECT COUNT(*)::INTEGER 
      FROM public.images i 
      WHERE i.crag_id = c.id 
        AND i.status = 'approved' 
        AND i.latitude IS NOT NULL
    ),
    route_count = (
      SELECT COUNT(*)::INTEGER 
      FROM public.climbs cl 
      WHERE cl.crag_id = c.id 
        AND cl.status = 'approved'
    );
END;
$$;

-- Backfill existing crags (one-time)
SELECT public.recompute_crag_counts();

-- Create trigger function for images
CREATE OR REPLACE FUNCTION public.trigger_recompute_crag_counts_images()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_crag_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_crag_id := OLD.crag_id;
  ELSE
    target_crag_id := NEW.crag_id;
  END IF;

  IF target_crag_id IS NOT NULL THEN
    UPDATE public.crags c SET
      image_count = (
        SELECT COUNT(*)::INTEGER 
        FROM public.images i 
        WHERE i.crag_id = c.id 
          AND i.status = 'approved' 
          AND i.latitude IS NOT NULL
      )
    WHERE c.id = target_crag_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger function for climbs
CREATE OR REPLACE FUNCTION public.trigger_recompute_crag_counts_climbs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_crag_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_crag_id := OLD.crag_id;
  ELSE
    target_crag_id := NEW.crag_id;
  END IF;

  IF target_crag_id IS NOT NULL THEN
    UPDATE public.crags c SET
      route_count = (
        SELECT COUNT(*)::INTEGER 
        FROM public.climbs cl 
        WHERE cl.crag_id = c.id 
          AND cl.status = 'approved'
      )
    WHERE c.id = target_crag_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS trigger_crag_counts_images ON public.images;
DROP TRIGGER IF EXISTS trigger_crag_counts_climbs ON public.climbs;

-- Create triggers
CREATE TRIGGER trigger_crag_counts_images
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.images
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_crag_counts_images();

CREATE TRIGGER trigger_crag_counts_climbs
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.climbs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_crag_counts_climbs();
