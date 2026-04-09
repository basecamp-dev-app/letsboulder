-- Add ON DELETE triggers to soft-delete orphan comments when their target is deleted.
-- The comments table uses a polymorphic target_id/target_type pattern with no FK constraints.
-- These triggers prevent orphaned comments when crags, images, or climbs are deleted.

CREATE OR REPLACE FUNCTION public.soft_delete_comments_on_target_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.comments
  SET deleted_at = now()
  WHERE target_type = TG_ARGV[0]
    AND target_id = OLD.id
    AND deleted_at IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_soft_delete_comments_on_crag_delete ON public.crags;
CREATE TRIGGER trg_soft_delete_comments_on_crag_delete
  AFTER DELETE ON public.crags
  FOR EACH ROW
  EXECUTE FUNCTION public.soft_delete_comments_on_target_delete('crag');

DROP TRIGGER IF EXISTS trg_soft_delete_comments_on_image_delete ON public.images;
CREATE TRIGGER trg_soft_delete_comments_on_image_delete
  AFTER DELETE ON public.images
  FOR EACH ROW
  EXECUTE FUNCTION public.soft_delete_comments_on_target_delete('image');

DROP TRIGGER IF EXISTS trg_soft_delete_comments_on_climb_delete ON public.climbs;
CREATE TRIGGER trg_soft_delete_comments_on_climb_delete
  AFTER DELETE ON public.climbs
  FOR EACH ROW
  EXECUTE FUNCTION public.soft_delete_comments_on_target_delete('climb');
