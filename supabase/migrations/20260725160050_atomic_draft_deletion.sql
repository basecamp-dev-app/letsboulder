CREATE OR REPLACE FUNCTION public.delete_submission_draft_atomic(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  draft_row public.submission_drafts%ROWTYPE;
  attachment record;
  linked_id uuid;
  candidate_ids uuid[] := ARRAY[]::uuid[];
  sorted_candidate_ids uuid[] := ARRAY[]::uuid[];
  image_row public.images%ROWTYPE;
  cleanup_rows jsonb := '[]'::jsonb;
  affected_count integer;
BEGIN
  SELECT * INTO draft_row FROM public.submission_drafts
  WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft not found', DETAIL = 'not_found';
  END IF;
  IF auth.uid() IS DISTINCT FROM draft_row.user_id AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING MESSAGE = 'Permission denied', DETAIL = 'permission_denied';
  END IF;
  IF draft_row.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft is not editable', DETAIL = 'draft_not_editable';
  END IF;

  FOR attachment IN
    SELECT di.id, di.linked_image_id, di.storage_provider,
      di.storage_bucket, di.storage_path
    FROM public.submission_draft_images di
    WHERE di.draft_id = draft_row.id
    ORDER BY di.id
    FOR UPDATE
  LOOP
    IF attachment.linked_image_id IS NULL THEN
      cleanup_rows := cleanup_rows || jsonb_build_array(jsonb_build_object(
        'image_id', NULL,
        'storage_provider', attachment.storage_provider,
        'storage_bucket', attachment.storage_bucket,
        'storage_path', attachment.storage_path
      ));
    ELSIF NOT attachment.linked_image_id = ANY(candidate_ids) THEN
      candidate_ids := array_append(candidate_ids, attachment.linked_image_id);
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
  INTO sorted_candidate_ids
  FROM unnest(candidate_ids) AS ids(id);
  FOR linked_id IN
    SELECT ids.id FROM unnest(sorted_candidate_ids) AS ids(id) ORDER BY ids.id
  LOOP
    PERFORM 1 FROM public.images i WHERE i.id = linked_id FOR UPDATE;
  END LOOP;
  SELECT COALESCE(array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
  INTO sorted_candidate_ids
  FROM unnest(sorted_candidate_ids) AS ids(id)
  JOIN public.images i ON i.id = ids.id
  WHERE i.created_by = draft_row.user_id
    OR EXISTS (
      SELECT 1
      FROM public.submission_draft_collaborators collaborator
      WHERE collaborator.draft_id = draft_row.id
        AND collaborator.user_id = i.created_by
    );
  LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.submission_drafts
  WHERE id = draft_row.id AND status = 'draft';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = 'Draft changed while deleting', DETAIL = 'draft_conflict';
  END IF;

  FOR linked_id IN
    SELECT ids.id FROM unnest(sorted_candidate_ids) AS ids(id) ORDER BY ids.id
  LOOP
    SELECT * INTO image_row FROM public.images WHERE id = linked_id;
    IF FOUND AND NOT public.image_has_content_references(linked_id) THEN
      DELETE FROM public.images i
      WHERE i.id = linked_id AND NOT public.image_has_content_references(i.id);
      IF FOUND THEN
        cleanup_rows := cleanup_rows || jsonb_build_array(jsonb_build_object(
          'image_id', image_row.id,
          'storage_provider', image_row.storage_provider,
          'storage_bucket', COALESCE(image_row.original_bucket, image_row.storage_bucket),
          'storage_path', COALESCE(image_row.original_key, image_row.storage_path)
        ));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'draft_id', draft_row.id, 'cleanup', cleanup_rows);
END;
$function$;
