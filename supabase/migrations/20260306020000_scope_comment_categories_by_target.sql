-- Scope comment categories by target type to reduce duplicate discussion.

DROP TRIGGER IF EXISTS comments_soft_delete_only_trigger ON public.comments;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_target_type_check;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_category_check;

UPDATE public.comments
SET category = CASE
  WHEN target_type = 'crag' THEN
    CASE
      WHEN category = 'access' THEN 'access'
      WHEN category IN ('approach', 'approach_beta') THEN 'approach'
      WHEN category = 'parking' THEN 'parking'
      WHEN category = 'closure' THEN 'closure'
      ELSE 'general'
    END
  WHEN target_type = 'image' THEN
    CASE
      WHEN category = 'topo_error' THEN 'topo_error'
      WHEN category = 'line_request' THEN 'line_request'
      WHEN category = 'photo_outdated' THEN 'photo_outdated'
      ELSE 'other_topo'
    END
  WHEN target_type = 'climb' THEN
    CASE
      WHEN category = 'beta' THEN 'beta'
      WHEN category = 'broken_hold' THEN 'broken_hold'
      WHEN category = 'conditions' THEN 'conditions'
      WHEN category = 'grade' THEN 'grade'
      WHEN category = 'history' THEN 'history'
      ELSE 'beta'
    END
  ELSE 'general'
END;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('crag', 'image', 'climb'));

ALTER TABLE public.comments
  ADD CONSTRAINT comments_category_check
  CHECK (
    category IN (
      'access',
      'approach',
      'parking',
      'closure',
      'general',
      'topo_error',
      'line_request',
      'photo_outdated',
      'other_topo',
      'beta',
      'broken_hold',
      'conditions',
      'grade',
      'history'
    )
  );

CREATE OR REPLACE FUNCTION public.validate_comment_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_type = 'crag' THEN
    IF NOT EXISTS (SELECT 1 FROM public.crags c WHERE c.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target crag does not exist';
    END IF;
  ELSIF NEW.target_type = 'image' THEN
    IF NOT EXISTS (SELECT 1 FROM public.images i WHERE i.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target image does not exist';
    END IF;
  ELSIF NEW.target_type = 'climb' THEN
    IF NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.id = NEW.target_id) THEN
      RAISE EXCEPTION 'Target climb does not exist';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_soft_delete_only_trigger
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_comment_soft_delete_only();
