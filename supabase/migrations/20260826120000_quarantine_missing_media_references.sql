CREATE TABLE public.media_quarantine_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_kind text NOT NULL CHECK (record_kind IN ('image', 'draft_image')),
  record_id uuid NOT NULL,
  object_key text NOT NULL CHECK (char_length(btrim(object_key)) > 0),
  source_run_id bigint NOT NULL CHECK (source_run_id > 0),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  snapshot_before jsonb NOT NULL CHECK (jsonb_typeof(snapshot_before) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_kind, record_id, object_key, source_run_id, artifact_digest)
);

ALTER TABLE public.media_quarantine_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.media_quarantine_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.media_quarantine_events TO service_role;

CREATE FUNCTION public.quarantine_missing_media_references(
  p_items jsonb,
  p_source_run_id bigint,
  p_artifact_digest text
)
RETURNS TABLE(record_kind text, record_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  requested_count integer;
  image_row public.images%ROWTYPE;
  draft_row public.submission_draft_images%ROWTYPE;
  draft_status text;
  expected_id uuid;
  expected_key text;
  expected_status text;
  expected_processing_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_source_run_id IS NULL OR p_source_run_id <= 0
    OR p_artifact_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid remediation provenance' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Remediation items must be an array' USING ERRCODE = '22023';
  END IF;
  requested_count := jsonb_array_length(p_items);
  IF requested_count < 1 OR requested_count > 25 THEN
    RAISE EXCEPTION 'Remediation requires 1 to 25 items' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_items)) IS DISTINCT FROM
    (SELECT count(DISTINCT value->>'kind' || ':' || value->>'id') FROM jsonb_array_elements(p_items)) THEN
    RAISE EXCEPTION 'Remediation items contain duplicates' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'kind', value->>'id'
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR item->>'kind' IS NULL OR item->>'kind' NOT IN ('image', 'draft_image')
      OR item->>'id' IS NULL
      OR (item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR nullif(btrim(item->>'objectKey'), '') IS NULL
      OR nullif(btrim(item->>'status'), '') IS NULL
      OR nullif(btrim(item->>'processingStatus'), '') IS NULL THEN
      RAISE EXCEPTION 'Invalid remediation item' USING ERRCODE = '22023';
    END IF;
    expected_id := (item->>'id')::uuid;
    expected_key := btrim(item->>'objectKey');
    expected_status := item->>'status';
    expected_processing_status := item->>'processingStatus';

    IF EXISTS (
      SELECT 1 FROM public.media_quarantine_events event
      WHERE event.record_kind = item->>'kind' AND event.record_id = expected_id
        AND event.object_key = expected_key AND event.source_run_id = p_source_run_id
        AND event.artifact_digest = p_artifact_digest
    ) THEN
      record_kind := item->>'kind'; record_id := expected_id; action := 'already_quarantined';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF item->>'kind' = 'image' THEN
      SELECT * INTO image_row FROM public.images WHERE id = expected_id FOR UPDATE;
      IF NOT FOUND OR image_row.status IS DISTINCT FROM expected_status
        OR image_row.processing_status IS DISTINCT FROM expected_processing_status
        OR image_row.storage_provider IS DISTINCT FROM 'r2'
        OR image_row.original_bucket IS DISTINCT FROM 'lb-prod-media-private'
        OR image_row.original_key IS DISTINCT FROM expected_key
        OR image_row.storage_bucket IS DISTINCT FROM 'lb-prod-media-private'
        OR image_row.storage_path IS DISTINCT FROM expected_key
        OR image_row.optimized_bucket IS NOT NULL OR image_row.optimized_key IS NOT NULL THEN
        RAISE EXCEPTION 'Image changed after reviewed reconciliation: %', expected_id USING ERRCODE = '40001';
      END IF;
      INSERT INTO public.media_quarantine_events(
        record_kind, record_id, object_key, source_run_id, artifact_digest, snapshot_before
      ) VALUES ('image', image_row.id, expected_key, p_source_run_id, p_artifact_digest, to_jsonb(image_row));
      UPDATE public.images SET status = 'pending', visibility = 'private', processing_status = 'failed',
        moderation_error = 'Media source missing; quarantined by lifecycle remediation run ' || p_source_run_id::text,
        updated_at = now()
      WHERE id = image_row.id;
      record_kind := 'image'; record_id := image_row.id; action := 'quarantined';
      RETURN NEXT;
    ELSE
      SELECT * INTO draft_row
      FROM public.submission_draft_images
      WHERE id = expected_id
      FOR UPDATE;
      IF FOUND THEN
        SELECT status INTO draft_status
        FROM public.submission_drafts
        WHERE id = draft_row.draft_id
        FOR SHARE;
      END IF;
      IF NOT FOUND OR draft_status IS DISTINCT FROM expected_status
        OR draft_row.processing_status IS DISTINCT FROM expected_processing_status
        OR draft_row.storage_provider IS DISTINCT FROM 'r2'
        OR draft_row.storage_bucket IS DISTINCT FROM 'lb-prod-media-private'
        OR draft_row.storage_path IS DISTINCT FROM expected_key THEN
        RAISE EXCEPTION 'Draft image changed after reviewed reconciliation: %', expected_id USING ERRCODE = '40001';
      END IF;
      INSERT INTO public.media_quarantine_events(
        record_kind, record_id, object_key, source_run_id, artifact_digest, snapshot_before
      ) VALUES ('draft_image', draft_row.id, expected_key, p_source_run_id, p_artifact_digest, to_jsonb(draft_row));
      UPDATE public.submission_draft_images
      SET processing_status = 'failed', updated_at = now()
      WHERE id = draft_row.id;
      record_kind := 'draft_image'; record_id := draft_row.id; action := 'quarantined';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.quarantine_missing_media_references(jsonb, bigint, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.quarantine_missing_media_references(jsonb, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_missing_media_references(jsonb, bigint, text)
  TO service_role;
