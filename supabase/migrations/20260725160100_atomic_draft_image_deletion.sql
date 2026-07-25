CREATE OR REPLACE FUNCTION public.delete_submission_draft_image_atomic(
  p_draft_id uuid,
  p_draft_image_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  draft_row public.submission_drafts%ROWTYPE;
  draft_image_row public.submission_draft_images%ROWTYPE;
  image_row public.images%ROWTYPE;
  remaining_count integer;
  new_updated_at timestamptz := clock_timestamp();
  new_metadata jsonb;
  cleanup_rows jsonb := '[]'::jsonb;
  updated_draft public.submission_drafts%ROWTYPE;
  current_primary_index integer;
  next_primary_index integer;
  next_face_directions jsonb;
  image_can_cleanup boolean := false;
BEGIN
  SELECT * INTO draft_row FROM public.submission_drafts
  WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft not found', DETAIL = 'not_found';
  END IF;
  IF auth.role() <> 'service_role'
    AND auth.uid() IS DISTINCT FROM draft_row.user_id
    AND NOT public.is_submission_draft_collaborator(draft_row.id, auth.uid()) THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;
  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft is not editable', DETAIL = 'draft_not_editable';
  END IF;
  IF p_expected_updated_at IS NULL
    OR date_trunc('milliseconds', draft_row.updated_at)
      IS DISTINCT FROM date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Draft changed while deleting image',
      DETAIL = 'draft_conflict',
      HINT = draft_row.updated_at::text;
  END IF;

  PERFORM 1 FROM public.submission_draft_images di
  WHERE di.draft_id = draft_row.id ORDER BY di.id FOR UPDATE;
  SELECT * INTO draft_image_row
  FROM public.submission_draft_images di
  WHERE di.draft_id = draft_row.id AND di.id = p_draft_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft image not found', DETAIL = 'not_found';
  END IF;
  SELECT count(*) INTO remaining_count
  FROM public.submission_draft_images di WHERE di.draft_id = draft_row.id;
  IF remaining_count <= 1 THEN
    RAISE EXCEPTION USING MESSAGE = 'A draft must retain at least one image', DETAIL = 'draft_conflict';
  END IF;
  IF draft_image_row.linked_image_id IS NOT NULL THEN
    SELECT * INTO image_row
    FROM public.images i
    WHERE i.id = draft_image_row.linked_image_id
    FOR UPDATE;
    image_can_cleanup := FOUND AND (
      image_row.created_by = draft_row.user_id
      OR public.is_submission_draft_collaborator(draft_row.id, image_row.created_by)
    );
  END IF;
  LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.submission_draft_images di
  WHERE di.id = draft_image_row.id AND di.draft_id = draft_row.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while deleting image', DETAIL = 'draft_conflict';
  END IF;

  WITH ordered AS (
    SELECT di.id, row_number() OVER (ORDER BY di.display_order, di.id) - 1 AS next_order
    FROM public.submission_draft_images di WHERE di.draft_id = draft_row.id
  )
  UPDATE public.submission_draft_images di
  SET display_order = ordered.next_order, updated_at = new_updated_at
  FROM ordered WHERE di.id = ordered.id;

  new_metadata := COALESCE(draft_row.metadata, '{}'::jsonb);
  new_metadata := jsonb_set(
    new_metadata,
    '{images}',
    COALESCE(new_metadata->'images', '{}'::jsonb) - draft_image_row.id::text,
    true
  );

  IF jsonb_typeof(new_metadata->'primaryIndex') = 'number' THEN
    current_primary_index := (new_metadata->>'primaryIndex')::integer;
    next_primary_index := CASE
      WHEN current_primary_index > draft_image_row.display_order THEN current_primary_index - 1
      WHEN current_primary_index >= remaining_count - 1 THEN GREATEST(remaining_count - 2, 0)
      ELSE current_primary_index
    END;
    new_metadata := jsonb_set(new_metadata, '{primaryIndex}', to_jsonb(next_primary_index), true);
  END IF;

  IF jsonb_typeof(new_metadata->'faceDirectionsByImage') = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(
      CASE
        WHEN entry.key::integer > draft_image_row.display_order
          THEN (entry.key::integer - 1)::text
        ELSE entry.key
      END,
      entry.value
    ), '{}'::jsonb)
    INTO next_face_directions
    FROM jsonb_each(new_metadata->'faceDirectionsByImage') AS entry
    WHERE entry.key <> ''
      AND entry.key !~ '[^0-9]'
      AND entry.key::integer <> draft_image_row.display_order;
    new_metadata := jsonb_set(
      new_metadata,
      '{faceDirectionsByImage}',
      next_face_directions,
      true
    );
  END IF;
  IF new_metadata->'navigation'->>'defaultImageId' = draft_image_row.id::text THEN
    new_metadata := jsonb_set(
      new_metadata,
      '{navigation,defaultImageId}',
      to_jsonb((SELECT di.id::text FROM public.submission_draft_images di
        WHERE di.draft_id = draft_row.id ORDER BY di.display_order, di.id LIMIT 1)),
      true
    );
  END IF;

  UPDATE public.submission_drafts SET
    metadata = new_metadata,
    updated_at = new_updated_at,
    last_edited_by = auth.uid()
  WHERE id = draft_row.id AND status = 'draft'
  RETURNING * INTO updated_draft;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while deleting image', DETAIL = 'draft_conflict';
  END IF;

  IF draft_image_row.linked_image_id IS NOT NULL THEN
    SELECT * INTO image_row FROM public.images WHERE id = draft_image_row.linked_image_id;
    IF FOUND AND image_can_cleanup
      AND NOT public.image_has_content_references(image_row.id) THEN
      DELETE FROM public.images i
      WHERE i.id = image_row.id AND NOT public.image_has_content_references(i.id);
      IF FOUND THEN
        cleanup_rows := jsonb_build_array(jsonb_build_object(
          'image_id', image_row.id,
          'storage_provider', image_row.storage_provider,
          'storage_bucket', COALESCE(image_row.original_bucket, image_row.storage_bucket),
          'storage_path', COALESCE(image_row.original_key, image_row.storage_path)
        ));
      END IF;
    END IF;
  ELSE
    cleanup_rows := jsonb_build_array(jsonb_build_object(
      'image_id', NULL,
      'storage_provider', draft_image_row.storage_provider,
      'storage_bucket', draft_image_row.storage_bucket,
      'storage_path', draft_image_row.storage_path
    ));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'draft', to_jsonb(updated_draft),
    'images', COALESCE((
      SELECT jsonb_agg(to_jsonb(di) ORDER BY di.display_order, di.id)
      FROM public.submission_draft_images di WHERE di.draft_id = draft_row.id
    ), '[]'::jsonb),
    'cleanup', cleanup_rows
  );
END;
$function$;
