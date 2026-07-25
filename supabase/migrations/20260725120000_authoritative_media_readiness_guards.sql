-- Media state is owned by the ingest worker. Application publication paths may
-- only associate rows that the worker has made publicly deliverable.
CREATE OR REPLACE FUNCTION public.assert_media_ready_for_publication(p_image_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_count integer;
  ready_count integer;
BEGIN
  SELECT count(DISTINCT image_id)
  INTO expected_count
  FROM unnest(COALESCE(p_image_ids, ARRAY[]::uuid[])) AS image_id;

  IF expected_count = 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Some photos are still being prepared or reviewed.',
      DETAIL = 'media_not_ready';
  END IF;

  WITH locked_images AS (
    SELECT id
    FROM public.images
    WHERE id = ANY(p_image_ids)
      AND processing_status = 'ready'
      AND moderation_status IN ('approved', 'skipped')
      AND visibility = 'public'
      AND status = 'approved'
    FOR UPDATE
  )
  SELECT count(*) INTO ready_count FROM locked_images;

  IF ready_count <> expected_count THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Some photos are still being prepared or reviewed.',
      DETAIL = 'media_not_ready';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_media_ready_for_publication(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_media_ready_for_publication(uuid[]) TO authenticated, service_role;

-- Publication RPCs historically finalized media themselves. Reject that for
-- non-ready R2 rows and preserve worker-owned delivery fields for ready rows.
CREATE OR REPLACE FUNCTION public.guard_worker_owned_media_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.storage_provider = 'r2'
      AND (NEW.processing_status = 'ready' OR NEW.visibility = 'public' OR NEW.status = 'approved') THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Some photos are still being prepared or reviewed.',
        DETAIL = 'media_not_ready';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.storage_provider = 'r2' OR NEW.storage_provider = 'r2' THEN
    IF OLD.processing_status <> 'ready'
      AND (NEW.processing_status = 'ready' OR NEW.visibility = 'public' OR NEW.status = 'approved') THEN
      RAISE EXCEPTION USING
        MESSAGE = 'Some photos are still being prepared or reviewed.',
        DETAIL = 'media_not_ready';
    END IF;

    IF OLD.processing_status = 'ready' AND NEW.status = 'approved' AND NEW.visibility = 'public' THEN
      NEW.url := OLD.url;
      NEW.storage_provider := OLD.storage_provider;
      NEW.variants := OLD.variants;
      NEW.visibility := OLD.visibility;
      NEW.processing_status := OLD.processing_status;
      NEW.processed_at := OLD.processed_at;
      NEW.moderation_status := OLD.moderation_status;
      NEW.moderation_provider := OLD.moderation_provider;
      NEW.moderation_labels := OLD.moderation_labels;
      NEW.moderation_error := OLD.moderation_error;
      NEW.moderated_at := OLD.moderated_at;
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS images_guard_worker_owned_media_state ON public.images;
CREATE TRIGGER images_guard_worker_owned_media_state
BEFORE INSERT OR UPDATE ON public.images
FOR EACH ROW EXECUTE FUNCTION public.guard_worker_owned_media_state();

CREATE OR REPLACE FUNCTION public.guard_public_media_association()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_media_ready_for_publication(ARRAY[NEW.image_id]);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_lines_guard_media_readiness ON public.route_lines;
CREATE TRIGGER route_lines_guard_media_readiness
BEFORE INSERT OR UPDATE OF image_id ON public.route_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_public_media_association();

CREATE OR REPLACE FUNCTION public.guard_crag_image_media_readiness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  path_match text[];
BEGIN
  IF NEW.linked_image_id IS NULL THEN
    path_match := regexp_match(NEW.url, 'images/originals/([0-9a-fA-F-]{36})');
    IF path_match IS NOT NULL THEN
      SELECT image.id INTO NEW.linked_image_id
      FROM public.images AS image
      WHERE image.id = path_match[1]::uuid
        AND image.created_by = auth.uid();
    END IF;
  END IF;

  IF NEW.linked_image_id IS NOT NULL THEN
    PERFORM public.assert_media_ready_for_publication(ARRAY[NEW.linked_image_id]);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crag_images_guard_media_readiness ON public.crag_images;
CREATE TRIGGER crag_images_guard_media_readiness
BEFORE INSERT OR UPDATE OF linked_image_id ON public.crag_images
FOR EACH ROW EXECUTE FUNCTION public.guard_crag_image_media_readiness();

-- Link draft attachments to the upload-session row so readiness always comes
-- from the authoritative images record.
CREATE OR REPLACE FUNCTION public.link_submission_draft_image_upload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  payload_image_id uuid;
  path_match text[];
BEGIN
  IF NEW.linked_image_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  path_match := regexp_match(NEW.storage_path, 'images/originals/([0-9a-fA-F-]{36})');
  IF path_match IS NULL THEN
    RETURN NEW;
  END IF;
  payload_image_id := path_match[1]::uuid;

  SELECT image.id INTO NEW.linked_image_id
  FROM public.images AS image
  WHERE image.id = payload_image_id
    AND image.created_by = auth.uid()
    AND (
      (image.original_bucket = NEW.storage_bucket AND image.original_key = NEW.storage_path)
      OR (image.storage_bucket = NEW.storage_bucket AND image.storage_path = NEW.storage_path)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submission_draft_images_link_upload ON public.submission_draft_images;
CREATE TRIGGER submission_draft_images_link_upload
BEFORE INSERT ON public.submission_draft_images
FOR EACH ROW EXECUTE FUNCTION public.link_submission_draft_image_upload();

DROP POLICY IF EXISTS "Public read approved images" ON public.images;
DROP POLICY IF EXISTS "Public read deliverable images" ON public.images;
CREATE POLICY "Public read deliverable images" ON public.images
FOR SELECT USING (
  processing_status = 'ready'
  AND moderation_status IN ('approved', 'skipped')
  AND visibility = 'public'
  AND status = 'approved'
);

CREATE OR REPLACE FUNCTION public.get_community_photos_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, auth, extensions
AS $$
  SELECT COUNT(*)
  FROM images
  WHERE status = 'approved'
    AND moderation_status IN ('approved', 'skipped')
    AND processing_status = 'ready'
    AND parent_image_id IS NULL
    AND crag_id IS NOT NULL;
$$;
