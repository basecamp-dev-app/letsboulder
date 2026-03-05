CREATE OR REPLACE FUNCTION public.handle_submission_draft_promoted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_submission_draft_promoted$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    INSERT INTO public.submission_collaborators (image_id, user_id, role, created_by)
    SELECT
      di.linked_image_id,
      c.user_id,
      c.role,
      COALESCE(c.created_by, NEW.user_id)
    FROM public.submission_draft_collaborators c
    CROSS JOIN public.submission_draft_images di
    WHERE c.draft_id = NEW.id
      AND di.draft_id = NEW.id
      AND di.linked_image_id IS NOT NULL
    ON CONFLICT (image_id, user_id) DO NOTHING;

    DELETE FROM public.submission_draft_collaborator_invites
    WHERE draft_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$handle_submission_draft_promoted$;
