-- Attach the images trigger function to the images table
-- This ensures crags are deleted when their last image is deleted

DROP TRIGGER IF EXISTS images_trigger_on_crag_location ON public.images;
CREATE TRIGGER images_trigger_on_crag_location
AFTER INSERT OR UPDATE OR DELETE ON public.images
FOR EACH ROW
EXECUTE FUNCTION public.images_recompute_crag_location_trigger();
