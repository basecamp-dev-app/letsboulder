CREATE OR REPLACE FUNCTION public.handle_submission_draft_promoted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_submission_draft_promoted$
DECLARE
  draft_latitude DOUBLE PRECISION;
  draft_longitude DOUBLE PRECISION;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    IF jsonb_typeof(COALESCE(NEW.metadata->'location'->'latitude', 'null'::jsonb)) = 'number' THEN
      draft_latitude := (NEW.metadata->'location'->>'latitude')::DOUBLE PRECISION;
    END IF;

    IF jsonb_typeof(COALESCE(NEW.metadata->'location'->'longitude', 'null'::jsonb)) = 'number' THEN
      draft_longitude := (NEW.metadata->'location'->>'longitude')::DOUBLE PRECISION;
    END IF;

    IF draft_latitude IS NULL OR draft_longitude IS NULL
      OR draft_latitude < -90 OR draft_latitude > 90
      OR draft_longitude < -180 OR draft_longitude > 180 THEN
      RAISE EXCEPTION 'Draft location is required before publishing';
    END IF;

    UPDATE public.images i
    SET
      latitude = draft_latitude,
      longitude = draft_longitude
    FROM public.submission_draft_images di
    WHERE di.draft_id = NEW.id
      AND di.linked_image_id IS NOT NULL
      AND i.id = di.linked_image_id;

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
