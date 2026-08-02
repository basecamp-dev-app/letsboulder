ALTER TABLE public.media_deletion_jobs
  ADD COLUMN expected_object_etag text,
  ADD COLUMN expected_object_bytes bigint,
  ADD COLUMN reconciliation_run_id bigint,
  ADD COLUMN reconciliation_artifact_digest text,
  DROP CONSTRAINT media_deletion_jobs_reason_check,
  ADD CONSTRAINT media_deletion_jobs_reason_check CHECK (reason IN (
    'account_deleted',
    'published_submission_deleted',
    'admin_image_deleted',
    'draft_image_deleted',
    'unassociated_upload_deleted',
    'image_hard_deleted',
    'source_replaced',
    'reconciled_orphan'
  )),
  ADD CONSTRAINT media_deletion_jobs_reconciled_orphan_proof_check CHECK (
    (reason <> 'reconciled_orphan'
      AND expected_object_etag IS NULL
      AND expected_object_bytes IS NULL
      AND reconciliation_run_id IS NULL
      AND reconciliation_artifact_digest IS NULL)
    OR (reason = 'reconciled_orphan'
      AND bucket = 'lb-prod-media-private'
      AND source_type = 'image'
      AND source_id IS NOT NULL
      AND image_id IS NOT NULL
      AND source_id = image_id
      AND object_key ~ ('^images/originals/' || image_id::text || '/[^/]+$')
      AND expected_object_etag IS NOT NULL
      AND char_length(btrim(expected_object_etag)) > 0
      AND expected_object_bytes IS NOT NULL
      AND expected_object_bytes > 0
      AND reconciliation_run_id IS NOT NULL
      AND reconciliation_run_id > 0
      AND reconciliation_artifact_digest IS NOT NULL
      AND reconciliation_artifact_digest ~ '^sha256:[0-9a-f]{64}$')
  );

CREATE FUNCTION public.enqueue_reconciled_media_orphans(
  p_bucket text,
  p_keys text[],
  p_expected_etags text[],
  p_expected_bytes bigint[],
  p_reconciliation_run_id bigint,
  p_artifact_digest text
)
RETURNS TABLE(object_key text, job_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  candidate_key text;
  candidate_image_id uuid;
  candidate_index integer;
  candidate_etag text;
  candidate_bytes bigint;
  reference_column record;
  has_reference boolean;
  deletion_job_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_bucket IS DISTINCT FROM 'lb-prod-media-private' THEN
    RAISE EXCEPTION 'Invalid reconciled orphan bucket' USING ERRCODE = '22023';
  END IF;
  IF p_keys IS NULL OR cardinality(p_keys) < 1 OR cardinality(p_keys) > 25 THEN
    RAISE EXCEPTION 'Reconciled orphan batch must contain between 1 and 25 keys'
      USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_expected_etags) IS DISTINCT FROM cardinality(p_keys)
    OR cardinality(p_expected_bytes) IS DISTINCT FROM cardinality(p_keys)
    OR p_reconciliation_run_id IS NULL OR p_reconciliation_run_id <= 0
    OR p_artifact_digest IS NULL
    OR p_artifact_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Reconciled orphan proof metadata is invalid' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_keys) IS DISTINCT FROM (
    SELECT count(DISTINCT key_value)::integer FROM unnest(p_keys) AS key_value
  ) THEN
    RAISE EXCEPTION 'Reconciled orphan keys must be unique' USING ERRCODE = '22023';
  END IF;

  -- Deterministic locks make overlapping batches safe without introducing deadlocks.
  FOR candidate_index IN
    SELECT item_index FROM generate_subscripts(p_keys, 1) AS item_index ORDER BY p_keys[item_index]
  LOOP
    candidate_key := p_keys[candidate_index];
    candidate_etag := btrim(p_expected_etags[candidate_index], '"');
    candidate_bytes := p_expected_bytes[candidate_index];
    IF candidate_key IS NULL OR candidate_key !~ (
      '^images/originals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    ) THEN
      RAISE EXCEPTION 'Invalid reconciled orphan key: %', candidate_key USING ERRCODE = '22023';
    END IF;

    BEGIN
      candidate_image_id := split_part(candidate_key, '/', 3)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid reconciled orphan key: %', candidate_key USING ERRCODE = '22023';
    END;
    IF NULLIF(candidate_etag, '') IS NULL OR candidate_bytes IS NULL OR candidate_bytes <= 0 THEN
      RAISE EXCEPTION 'Invalid reviewed object metadata: %', candidate_key USING ERRCODE = '22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_bucket || ':' || candidate_key, 0)
    );

    IF EXISTS (SELECT 1 FROM public.images WHERE id = candidate_image_id) THEN
      RAISE EXCEPTION 'Reconciled orphan namespace belongs to an existing image: %', candidate_image_id
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.media_deletion_jobs AS job
      WHERE job.bucket = p_bucket
        AND job.object_key = candidate_key
        AND job.status IN ('queued', 'processing')
        AND (job.reason IS DISTINCT FROM 'reconciled_orphan'
          OR job.source_type IS DISTINCT FROM 'image'
          OR job.source_id IS DISTINCT FROM candidate_image_id
          OR job.image_id IS DISTINCT FROM candidate_image_id
          OR job.expected_object_etag IS DISTINCT FROM candidate_etag
          OR job.expected_object_bytes IS DISTINCT FROM candidate_bytes
          OR job.reconciliation_run_id IS DISTINCT FROM p_reconciliation_run_id
          OR job.reconciliation_artifact_digest IS DISTINCT FROM p_artifact_digest)
    ) THEN
      RAISE EXCEPTION 'Conflicting deletion work exists for reconciled orphan: %', candidate_key
        USING ERRCODE = '40001';
    END IF;

    FOR reference_column IN
      SELECT namespace.nspname AS schema_name,
             relation.relname AS table_name,
             attribute.attname AS column_name
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_type AS column_type ON column_type.oid = attribute.atttypid
      LEFT JOIN pg_catalog.pg_type AS element_type ON element_type.oid = column_type.typelem
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
        AND relation.relname <> 'media_deletion_jobs'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (column_type.typcategory = 'S'
          OR column_type.typname IN ('json', 'jsonb')
          OR element_type.typcategory = 'S'
          OR element_type.typname IN ('json', 'jsonb'))
      ORDER BY relation.oid, attribute.attnum
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE strpos(%I::text, $1) > 0)',
        reference_column.schema_name,
        reference_column.table_name,
        reference_column.column_name
      ) INTO has_reference USING candidate_key;

      IF has_reference THEN
        RAISE EXCEPTION 'Reconciled orphan is referenced by %.%.%: %',
          reference_column.schema_name,
          reference_column.table_name,
          reference_column.column_name,
          candidate_key
          USING ERRCODE = '55000';
      END IF;
    END LOOP;
  END LOOP;

  FOR candidate_index IN SELECT generate_subscripts(p_keys, 1) LOOP
    candidate_key := p_keys[candidate_index];
    candidate_image_id := split_part(candidate_key, '/', 3)::uuid;
    candidate_etag := btrim(p_expected_etags[candidate_index], '"');
    candidate_bytes := p_expected_bytes[candidate_index];

    SELECT job.id INTO deletion_job_id
    FROM public.media_deletion_jobs AS job
    WHERE job.bucket = p_bucket
      AND job.object_key = candidate_key
      AND job.status IN ('queued', 'processing')
      AND job.reason = 'reconciled_orphan'
      AND job.source_type = 'image'
      AND job.source_id = candidate_image_id
      AND job.image_id = candidate_image_id
    ORDER BY job.created_at, job.id
    LIMIT 1;

    IF deletion_job_id IS NULL THEN
      INSERT INTO public.media_deletion_jobs (
        bucket, object_key, reason, source_type, source_id, image_id,
        expected_object_etag, expected_object_bytes, reconciliation_run_id,
        reconciliation_artifact_digest
      ) VALUES (
        p_bucket, candidate_key, 'reconciled_orphan', 'image', candidate_image_id, candidate_image_id,
        candidate_etag, candidate_bytes, p_reconciliation_run_id, p_artifact_digest
      )
      ON CONFLICT (bucket, object_key) WHERE status IN ('queued', 'processing') DO NOTHING
      RETURNING id INTO deletion_job_id;
    END IF;

    IF deletion_job_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.media_deletion_jobs AS job
      WHERE job.id = deletion_job_id
        AND job.bucket = p_bucket
        AND job.object_key = candidate_key
        AND job.reason = 'reconciled_orphan'
        AND job.source_type = 'image'
        AND job.source_id = candidate_image_id
        AND job.image_id = candidate_image_id
        AND job.expected_object_etag = candidate_etag
        AND job.expected_object_bytes = candidate_bytes
        AND job.reconciliation_run_id = p_reconciliation_run_id
        AND job.reconciliation_artifact_digest = p_artifact_digest
    ) THEN
      RAISE EXCEPTION 'Durable reconciled orphan enqueue returned conflicting metadata: %', candidate_key
        USING ERRCODE = '40001';
    END IF;

    object_key := candidate_key;
    job_id := deletion_job_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE FUNCTION public.guard_reconciled_orphan_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'images' AND EXISTS (
    SELECT 1
    FROM public.media_deletion_jobs AS job
    WHERE job.reason = 'reconciled_orphan'
      AND job.status IN ('queued', 'processing')
      AND job.image_id = (to_jsonb(NEW)->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Image namespace is reserved by reviewed orphan deletion' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.media_deletion_jobs AS job
    WHERE job.reason = 'reconciled_orphan'
      AND job.status IN ('queued', 'processing')
      AND strpos(to_jsonb(NEW)::text, job.object_key) > 0
  ) THEN
    RAISE EXCEPTION 'Media locator is reserved by reviewed orphan deletion' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_table record;
BEGIN
  FOR target_table IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND NOT relation.relispartition
      AND relation.relname <> 'media_deletion_jobs'
    ORDER BY relation.oid
  LOOP
    EXECUTE format(
      'CREATE TRIGGER guard_reconciled_orphan_reservations '
      'BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW '
      'EXECUTE FUNCTION public.guard_reconciled_orphan_reservations()',
      target_table.schema_name,
      target_table.table_name
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.verify_reconciled_orphan_deletion(
  p_job_id uuid,
  p_claim_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row public.media_deletion_jobs%ROWTYPE;
  reference_column record;
  has_reference boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO job_row
  FROM public.media_deletion_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR job_row.reason IS DISTINCT FROM 'reconciled_orphan'
    OR job_row.status IS DISTINCT FROM 'processing'
    OR job_row.claim_token IS DISTINCT FROM p_claim_token
    OR job_row.source_type IS DISTINCT FROM 'image'
    OR job_row.source_id IS DISTINCT FROM job_row.image_id
    OR job_row.expected_object_etag IS NULL
    OR job_row.expected_object_bytes IS NULL THEN
    RAISE EXCEPTION 'Claimed reconciled orphan proof is inconsistent' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.images WHERE id = job_row.image_id) THEN
    RAISE EXCEPTION 'Reconciled orphan namespace now belongs to an image' USING ERRCODE = '55000';
  END IF;

  FOR reference_column IN
    SELECT namespace.nspname AS schema_name,
           relation.relname AS table_name,
           attribute.attname AS column_name
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_type AS column_type ON column_type.oid = attribute.atttypid
    LEFT JOIN pg_catalog.pg_type AS element_type ON element_type.oid = column_type.typelem
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> 'media_deletion_jobs'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (column_type.typcategory = 'S'
        OR column_type.typname IN ('json', 'jsonb')
        OR element_type.typcategory = 'S'
        OR element_type.typname IN ('json', 'jsonb'))
    ORDER BY relation.oid, attribute.attnum
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE strpos(%I::text, $1) > 0)',
      reference_column.schema_name,
      reference_column.table_name,
      reference_column.column_name
    ) INTO has_reference USING job_row.object_key;
    IF has_reference THEN
      RAISE EXCEPTION 'Reconciled orphan acquired a reference in %.%.%',
        reference_column.schema_name,
        reference_column.table_name,
        reference_column.column_name
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  UPDATE public.media_deletion_jobs
  SET delivery_verified_at = now()
  WHERE id = job_row.id;
END;
$$;

ALTER FUNCTION public.enqueue_reconciled_media_orphans(text, text[], text[], bigint[], bigint, text) OWNER TO postgres;
ALTER FUNCTION public.verify_reconciled_orphan_deletion(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.guard_reconciled_orphan_reservations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_reconciled_media_orphans(text, text[], text[], bigint[], bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_reconciled_orphan_deletion(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reconciled_orphan_reservations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_reconciled_media_orphans(text, text[], text[], bigint[], bigint, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_reconciled_orphan_deletion(uuid, uuid)
  TO service_role;
