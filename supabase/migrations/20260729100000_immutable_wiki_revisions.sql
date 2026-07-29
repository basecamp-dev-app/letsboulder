CREATE TABLE public.wiki_entities (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  entity_kind text NOT NULL CHECK (entity_kind IN ('image', 'climb', 'route_line', 'crag')),
  image_id uuid UNIQUE REFERENCES public.images(id) ON DELETE SET NULL,
  climb_id uuid UNIQUE REFERENCES public.climbs(id) ON DELETE SET NULL,
  route_line_id uuid UNIQUE REFERENCES public.route_lines(id) ON DELETE SET NULL,
  crag_id uuid UNIQUE REFERENCES public.crags(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wiki_entities_source_matches_kind CHECK (
    (image_id IS NULL AND climb_id IS NULL AND route_line_id IS NULL AND crag_id IS NULL)
    OR (entity_kind = 'image' AND image_id IS NOT NULL AND climb_id IS NULL AND route_line_id IS NULL AND crag_id IS NULL)
    OR (entity_kind = 'climb' AND image_id IS NULL AND climb_id IS NOT NULL AND route_line_id IS NULL AND crag_id IS NULL)
    OR (entity_kind = 'route_line' AND image_id IS NULL AND climb_id IS NULL AND route_line_id IS NOT NULL AND crag_id IS NULL)
    OR (entity_kind = 'crag' AND image_id IS NULL AND climb_id IS NULL AND route_line_id IS NULL AND crag_id IS NOT NULL)
  )
);

CREATE TABLE public.wiki_revision_commits (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  client_mutation_id uuid,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('user', 'admin', 'system', 'migration')),
  revision_kind text NOT NULL CHECK (revision_kind IN ('edit', 'rollback', 'merge', 'baseline')),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  transaction_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wiki_revision_commits_author_mutation_idx
  ON public.wiki_revision_commits (author_user_id, client_mutation_id)
  WHERE author_user_id IS NOT NULL AND client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX wiki_revision_commits_transaction_idx
  ON public.wiki_revision_commits (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE TABLE public.wiki_entity_revisions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.wiki_entities(id) ON DELETE RESTRICT,
  commit_id uuid NOT NULL REFERENCES public.wiki_revision_commits(id) ON DELETE RESTRICT,
  parent_revision_id uuid REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  patch jsonb NOT NULL CHECK (jsonb_typeof(patch) = 'array'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  restored_from_revision_id uuid REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  supersedes_revision_id uuid REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, revision_number)
);

CREATE INDEX wiki_entity_revisions_entity_created_idx
  ON public.wiki_entity_revisions (entity_id, created_at DESC, id DESC);
CREATE INDEX wiki_entity_revisions_commit_idx
  ON public.wiki_entity_revisions (commit_id);

CREATE TABLE public.wiki_revision_merge_parents (
  revision_id uuid NOT NULL REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  parent_revision_id uuid NOT NULL REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  PRIMARY KEY (revision_id, parent_revision_id),
  UNIQUE (revision_id, ordinal),
  CHECK (revision_id <> parent_revision_id)
);

CREATE TABLE public.wiki_entity_heads (
  entity_id uuid PRIMARY KEY REFERENCES public.wiki_entities(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL UNIQUE REFERENCES public.wiki_entity_revisions(id) ON DELETE RESTRICT,
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.wiki_entity_snapshot(p_entity_kind text, p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  CASE p_entity_kind
    WHEN 'image' THEN
      SELECT jsonb_build_object(
        'latitude', latitude,
        'longitude', longitude,
        'location_mode', location_mode,
        'face_directions', COALESCE(to_jsonb(face_directions), '[]'::jsonb),
        'contribution_credit_platform', contribution_credit_platform,
        'contribution_credit_handle', contribution_credit_handle,
        'is_anonymous_submission', is_anonymous_submission,
        'status', status,
        'visibility', visibility
      ) INTO v_snapshot
      FROM public.images WHERE id = p_source_id;
    WHEN 'climb' THEN
      SELECT jsonb_build_object(
        'name', name,
        'description', description,
        'grade', grade,
        'original_grade_string', original_grade_string,
        'route_type', route_type,
        'crag_id', crag_id,
        'place_id', place_id,
        'sector_id', sector_id,
        'latitude', latitude,
        'longitude', longitude,
        'shared_climb_id', shared_climb_id,
        'status', status,
        'slug', slug,
        'deleted_at', deleted_at,
        'deletion_reason', deletion_reason,
        'superseded_by', superseded_by
      ) INTO v_snapshot
      FROM public.climbs WHERE id = p_source_id;
    WHEN 'route_line' THEN
      SELECT jsonb_build_object(
        'image_id', image_id,
        'climb_id', climb_id,
        'points', points,
        'color', color,
        'sequence_order', sequence_order,
        'image_width', image_width,
        'image_height', image_height
      ) INTO v_snapshot
      FROM public.route_lines WHERE id = p_source_id;
    WHEN 'crag' THEN
      SELECT jsonb_build_object(
        'name', c.name,
        'description', c.description,
        'access_notes', c.access_notes,
        'rock_type', c.rock_type,
        'type', c.type,
        'latitude', c.latitude,
        'longitude', c.longitude,
        'region_id', c.region_id,
        'region_name', c.region_name,
        'sub_area', c.sub_area,
        'country', c.country,
        'country_code', c.country_code,
        'country_id', c.country_id,
        'tide_dependency', c.tide_dependency,
        'slug', c.slug,
        'deleted_at', c.deleted_at,
        'deletion_reason', c.deletion_reason,
        'superseded_by', c.superseded_by,
        'primary_region_tag_id', (
          SELECT clt.tag_id FROM public.crag_location_tags AS clt
          WHERE clt.crag_id = c.id AND clt.is_primary_region = true LIMIT 1
        )
      ) INTO v_snapshot
      FROM public.crags AS c WHERE c.id = p_source_id;
    ELSE
      RAISE EXCEPTION 'Unsupported wiki entity kind: %', p_entity_kind USING ERRCODE = '22023';
  END CASE;

  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_wiki_lifecycle_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_commit_id uuid;
  v_entity_kind text;
  v_author_kind text;
BEGIN
  v_entity_kind := CASE TG_TABLE_NAME
    WHEN 'images' THEN 'image'
    WHEN 'climbs' THEN 'climb'
    WHEN 'crags' THEN 'crag'
  END;
  IF v_entity_kind IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.wiki_entities
    WHERE image_id = CASE WHEN v_entity_kind = 'image' THEN NEW.id ELSE NULL END
       OR climb_id = CASE WHEN v_entity_kind = 'climb' THEN NEW.id ELSE NULL END
       OR crag_id = CASE WHEN v_entity_kind = 'crag' THEN NEW.id ELSE NULL END
  ) THEN
    RETURN NEW;
  END IF;

  v_author_kind := CASE
    WHEN auth.uid() IS NULL THEN 'system'
    WHEN public.is_current_user_admin() THEN 'admin'
    ELSE 'system'
  END;
  INSERT INTO public.wiki_revision_commits (
    author_user_id, author_kind, revision_kind, summary, metadata, transaction_id
  ) VALUES (
    auth.uid(), v_author_kind, 'edit', 'Updated published content lifecycle',
    jsonb_build_object('source', TG_TABLE_NAME), pg_catalog.txid_current()
  ) ON CONFLICT DO NOTHING
  RETURNING id INTO v_commit_id;
  IF v_commit_id IS NULL THEN
    SELECT id INTO v_commit_id FROM public.wiki_revision_commits
    WHERE transaction_id = pg_catalog.txid_current();
  END IF;

  PERFORM public.record_wiki_entity_revision(v_entity_kind, NEW.id, v_commit_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_wiki_lifecycle_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_commit_id uuid;
  v_entity_kind text;
BEGIN
  v_entity_kind := CASE TG_TABLE_NAME
    WHEN 'images' THEN 'image'
    WHEN 'climbs' THEN 'climb'
    WHEN 'crags' THEN 'crag'
  END;
  IF (v_entity_kind = 'image' AND EXISTS (SELECT 1 FROM public.wiki_entities WHERE image_id = OLD.id))
    OR (v_entity_kind = 'climb' AND EXISTS (SELECT 1 FROM public.wiki_entities WHERE climb_id = OLD.id))
    OR (v_entity_kind = 'crag' AND EXISTS (SELECT 1 FROM public.wiki_entities WHERE crag_id = OLD.id)) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
  VALUES ('system', 'baseline', 'Captured pre-lifecycle published state', jsonb_build_object('source', TG_TABLE_NAME))
  RETURNING id INTO v_commit_id;
  PERFORM public.record_wiki_entity_revision(v_entity_kind, OLD.id, v_commit_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER images_ensure_wiki_lifecycle_baseline
BEFORE UPDATE OF status, visibility ON public.images
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.visibility IS DISTINCT FROM NEW.visibility)
EXECUTE FUNCTION public.ensure_wiki_lifecycle_baseline();

CREATE TRIGGER climbs_ensure_wiki_lifecycle_baseline
BEFORE UPDATE OF deleted_at, deletion_reason, superseded_by ON public.climbs
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deletion_reason IS DISTINCT FROM NEW.deletion_reason
  OR OLD.superseded_by IS DISTINCT FROM NEW.superseded_by)
EXECUTE FUNCTION public.ensure_wiki_lifecycle_baseline();

CREATE TRIGGER crags_ensure_wiki_lifecycle_baseline
BEFORE UPDATE OF deleted_at, deletion_reason, superseded_by ON public.crags
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deletion_reason IS DISTINCT FROM NEW.deletion_reason
  OR OLD.superseded_by IS DISTINCT FROM NEW.superseded_by)
EXECUTE FUNCTION public.ensure_wiki_lifecycle_baseline();

CREATE TRIGGER images_capture_wiki_lifecycle_revision
AFTER UPDATE OF status, visibility ON public.images
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.visibility IS DISTINCT FROM NEW.visibility)
EXECUTE FUNCTION public.capture_wiki_lifecycle_revision();

CREATE TRIGGER climbs_capture_wiki_lifecycle_revision
AFTER UPDATE OF deleted_at, deletion_reason, superseded_by ON public.climbs
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deletion_reason IS DISTINCT FROM NEW.deletion_reason
  OR OLD.superseded_by IS DISTINCT FROM NEW.superseded_by)
EXECUTE FUNCTION public.capture_wiki_lifecycle_revision();

CREATE TRIGGER crags_capture_wiki_lifecycle_revision
AFTER UPDATE OF deleted_at, deletion_reason, superseded_by ON public.crags
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  OR OLD.deletion_reason IS DISTINCT FROM NEW.deletion_reason
  OR OLD.superseded_by IS DISTINCT FROM NEW.superseded_by)
EXECUTE FUNCTION public.capture_wiki_lifecycle_revision();

REVOKE ALL ON FUNCTION public.capture_wiki_lifecycle_revision(),
  public.ensure_wiki_lifecycle_baseline()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wiki_json_patch(p_before jsonb, p_after jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH keys AS (
    SELECT key FROM jsonb_object_keys(COALESCE(p_before, '{}'::jsonb)) AS key
    UNION
    SELECT key FROM jsonb_object_keys(COALESCE(p_after, '{}'::jsonb)) AS key
  ), changes AS (
    SELECT key,
      CASE
        WHEN NOT COALESCE(p_before, '{}'::jsonb) ? key THEN 'add'
        WHEN NOT COALESCE(p_after, '{}'::jsonb) ? key THEN 'remove'
        ELSE 'replace'
      END AS operation,
      p_after->key AS value
    FROM keys
    WHERE p_before->key IS DISTINCT FROM p_after->key
  ), operations AS (
    SELECT key, jsonb_build_object(
      'op', operation,
      'path', '/' || replace(replace(key, '~', '~0'), '/', '~1')
    ) AS operation
    FROM changes WHERE operation = 'remove'
    UNION ALL
    SELECT key, jsonb_build_object(
      'op', operation,
      'path', '/' || replace(replace(key, '~', '~0'), '/', '~1'),
      'value', value
    ) AS operation
    FROM changes WHERE operation <> 'remove'
  )
  SELECT COALESCE(jsonb_agg(operation ORDER BY key), '[]'::jsonb) FROM operations;
$$;

CREATE OR REPLACE FUNCTION public.wiki_validate_revision_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wiki_entity_revisions
    WHERE id = NEW.parent_revision_id AND entity_id = NEW.entity_id
  ) THEN
    RAISE EXCEPTION 'Parent revision must belong to the same entity' USING ERRCODE = '23514';
  END IF;
  IF NEW.restored_from_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wiki_entity_revisions
    WHERE id = NEW.restored_from_revision_id AND entity_id = NEW.entity_id
  ) THEN
    RAISE EXCEPTION 'Restored revision must belong to the same entity' USING ERRCODE = '23514';
  END IF;
  IF NEW.supersedes_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wiki_entity_revisions
    WHERE id = NEW.supersedes_revision_id AND entity_id = NEW.entity_id
  ) THEN
    RAISE EXCEPTION 'Superseded revision must belong to the same entity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wiki_entity_revisions_validate_links
BEFORE INSERT ON public.wiki_entity_revisions
FOR EACH ROW EXECUTE FUNCTION public.wiki_validate_revision_links();

CREATE OR REPLACE FUNCTION public.wiki_validate_merge_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.wiki_entity_revisions AS revision
    JOIN public.wiki_entity_revisions AS parent
      ON parent.id = NEW.parent_revision_id AND parent.entity_id = revision.entity_id
    WHERE revision.id = NEW.revision_id
  ) THEN
    RAISE EXCEPTION 'Merge parent must belong to the same entity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER wiki_revision_merge_parents_validate
BEFORE INSERT ON public.wiki_revision_merge_parents
FOR EACH ROW EXECUTE FUNCTION public.wiki_validate_merge_parent();

CREATE OR REPLACE FUNCTION public.wiki_reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'wiki_revision_commits' THEN
    IF TG_OP = 'UPDATE'
      AND OLD.author_user_id IS NOT NULL AND NEW.author_user_id IS NULL
      AND (to_jsonb(OLD) - 'author_user_id') = (to_jsonb(NEW) - 'author_user_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Wiki revision history is immutable' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER wiki_revision_commits_immutable
BEFORE UPDATE OR DELETE ON public.wiki_revision_commits
FOR EACH ROW EXECUTE FUNCTION public.wiki_reject_immutable_change();
CREATE TRIGGER wiki_entity_revisions_immutable
BEFORE UPDATE OR DELETE ON public.wiki_entity_revisions
FOR EACH ROW EXECUTE FUNCTION public.wiki_reject_immutable_change();
CREATE TRIGGER wiki_revision_merge_parents_immutable
BEFORE UPDATE OR DELETE ON public.wiki_revision_merge_parents
FOR EACH ROW EXECUTE FUNCTION public.wiki_reject_immutable_change();

CREATE OR REPLACE FUNCTION public.record_wiki_entity_revision(
  p_entity_kind text,
  p_source_id uuid,
  p_commit_id uuid,
  p_restored_from_revision_id uuid DEFAULT NULL,
  p_supersedes_revision_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_id uuid;
  v_head public.wiki_entity_heads%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_revision_id uuid;
  v_revision_number bigint;
BEGIN
  IF p_source_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.wiki_revision_commits WHERE id = p_commit_id
  ) THEN
    RAISE EXCEPTION 'A source entity and revision commit are required' USING ERRCODE = '22023';
  END IF;

  CASE p_entity_kind
    WHEN 'image' THEN
      INSERT INTO public.wiki_entities (entity_kind, image_id) VALUES ('image', p_source_id)
      ON CONFLICT (image_id) DO UPDATE SET entity_kind = EXCLUDED.entity_kind RETURNING id INTO v_entity_id;
    WHEN 'climb' THEN
      INSERT INTO public.wiki_entities (entity_kind, climb_id) VALUES ('climb', p_source_id)
      ON CONFLICT (climb_id) DO UPDATE SET entity_kind = EXCLUDED.entity_kind RETURNING id INTO v_entity_id;
    WHEN 'route_line' THEN
      INSERT INTO public.wiki_entities (entity_kind, route_line_id) VALUES ('route_line', p_source_id)
      ON CONFLICT (route_line_id) DO UPDATE SET entity_kind = EXCLUDED.entity_kind RETURNING id INTO v_entity_id;
    WHEN 'crag' THEN
      INSERT INTO public.wiki_entities (entity_kind, crag_id) VALUES ('crag', p_source_id)
      ON CONFLICT (crag_id) DO UPDATE SET entity_kind = EXCLUDED.entity_kind RETURNING id INTO v_entity_id;
    ELSE
      RAISE EXCEPTION 'Unsupported wiki entity kind: %', p_entity_kind USING ERRCODE = '22023';
  END CASE;

  SELECT * INTO v_head FROM public.wiki_entity_heads WHERE entity_id = v_entity_id FOR UPDATE;
  IF FOUND THEN
    SELECT snapshot INTO v_before FROM public.wiki_entity_revisions WHERE id = v_head.revision_id;
    v_revision_number := v_head.revision_number + 1;
  ELSE
    v_before := NULL;
    v_revision_number := 1;
  END IF;

  v_after := public.wiki_entity_snapshot(p_entity_kind, p_source_id);
  IF v_after IS NULL THEN
    RAISE EXCEPTION 'Wiki entity source does not exist' USING ERRCODE = 'P0002';
  END IF;
  IF v_before IS NOT NULL AND v_before = v_after THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wiki_entity_revisions (
    entity_id, commit_id, parent_revision_id, revision_number, snapshot, patch,
    content_hash, restored_from_revision_id, supersedes_revision_id
  ) VALUES (
    v_entity_id, p_commit_id, v_head.revision_id, v_revision_number, v_after,
    public.wiki_json_patch(v_before, v_after),
    encode(extensions.digest(convert_to(v_after::text, 'UTF8'), 'sha256'), 'hex'),
    p_restored_from_revision_id, p_supersedes_revision_id
  ) RETURNING id INTO v_revision_id;

  INSERT INTO public.wiki_entity_heads (entity_id, revision_id, revision_number)
  VALUES (v_entity_id, v_revision_id, v_revision_number)
  ON CONFLICT (entity_id) DO UPDATE SET
    revision_id = EXCLUDED.revision_id,
    revision_number = EXCLUDED.revision_number,
    updated_at = now();

  RETURN v_revision_id;
END;
$$;

ALTER TABLE public.wiki_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_revision_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_entity_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_revision_merge_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_entity_heads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read visible wiki entities" ON public.wiki_entities
  FOR SELECT TO authenticated USING (
    public.is_current_user_admin()
    OR (image_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.images WHERE images.id = wiki_entities.image_id
    ))
    OR (climb_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.climbs WHERE climbs.id = wiki_entities.climb_id
    ))
    OR (crag_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.crags WHERE crags.id = wiki_entities.crag_id
    ))
    OR (route_line_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.route_lines
      JOIN public.images ON images.id = route_lines.image_id
      JOIN public.climbs ON climbs.id = route_lines.climb_id
      WHERE route_lines.id = wiki_entities.route_line_id
    ))
  );
CREATE POLICY "Authenticated users read visible wiki revision commits" ON public.wiki_revision_commits
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.wiki_entity_revisions
    WHERE wiki_entity_revisions.commit_id = wiki_revision_commits.id
  ));
CREATE POLICY "Authenticated users read visible wiki entity revisions" ON public.wiki_entity_revisions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.wiki_entities WHERE wiki_entities.id = wiki_entity_revisions.entity_id
  ));
CREATE POLICY "Authenticated users read visible wiki merge parents" ON public.wiki_revision_merge_parents
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.wiki_entity_revisions
    WHERE wiki_entity_revisions.id = wiki_revision_merge_parents.revision_id
  ));
CREATE POLICY "Authenticated users read visible wiki entity heads" ON public.wiki_entity_heads
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.wiki_entities WHERE wiki_entities.id = wiki_entity_heads.entity_id
  ));

GRANT SELECT ON public.wiki_entities, public.wiki_revision_commits,
  public.wiki_entity_revisions, public.wiki_revision_merge_parents, public.wiki_entity_heads
  TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wiki_entities, public.wiki_revision_commits,
  public.wiki_entity_revisions, public.wiki_revision_merge_parents, public.wiki_entity_heads
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wiki_entity_snapshot(text, uuid), public.wiki_json_patch(jsonb, jsonb),
  public.record_wiki_entity_revision(text, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_commit_id uuid;
  v_row record;
BEGIN
  INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
  VALUES ('migration', 'baseline', 'Imported current published wiki state',
    jsonb_build_object('migration', '20260729100000_immutable_wiki_revisions'))
  RETURNING id INTO v_commit_id;

  FOR v_row IN
    SELECT DISTINCT 'image'::text AS kind, i.id
    FROM public.images AS i
    WHERE i.created_by IS NOT NULL AND (i.submission_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.route_lines AS rl WHERE rl.image_id = i.id
    ))
    UNION ALL
    SELECT DISTINCT 'climb', c.id FROM public.climbs AS c
    WHERE EXISTS (SELECT 1 FROM public.route_lines AS rl WHERE rl.climb_id = c.id)
    UNION ALL
    SELECT 'route_line', rl.id FROM public.route_lines AS rl
    UNION ALL
    SELECT DISTINCT 'crag', c.id FROM public.crags AS c
    WHERE EXISTS (SELECT 1 FROM public.images AS i WHERE i.crag_id = c.id AND i.created_by IS NOT NULL)
    ORDER BY 1, 2
  LOOP
    PERFORM public.record_wiki_entity_revision(v_row.kind, v_row.id, v_commit_id);
  END LOOP;
END;
$$;

ALTER FUNCTION public.apply_published_submission_edit(uuid, uuid, jsonb)
  RENAME TO apply_published_submission_edit_without_revisions;

CREATE OR REPLACE FUNCTION public.apply_published_submission_edit(
  p_image_id uuid,
  p_client_mutation_id uuid,
  p_operations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_commit_id uuid;
  v_baseline_commit_id uuid;
  v_item jsonb;
  v_route_line_id uuid;
  v_climb_id uuid;
  v_source_image_id uuid;
  v_related_image_id uuid;
  v_affected_image_ids uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND p_client_mutation_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(auth.uid()::text || ':' || p_client_mutation_id::text, 0)
    );
  END IF;

  v_source_image_id := p_image_id;
  IF p_operations->'imageMetadata'->>'locationMode' = 'shared' THEN
    SELECT COALESCE(ci.source_image_id, p_image_id) INTO v_source_image_id
    FROM public.crag_images AS ci
    WHERE ci.linked_image_id = p_image_id
    LIMIT 1;
    v_source_image_id := COALESCE(v_source_image_id, p_image_id);
  END IF;
  SELECT array_agg(affected_id ORDER BY affected_id) INTO v_affected_image_ids
  FROM (
    SELECT p_image_id AS affected_id
    UNION
    SELECT v_source_image_id WHERE p_operations->'imageMetadata'->>'locationMode' = 'shared'
    UNION
    SELECT ci.linked_image_id FROM public.crag_images AS ci
    WHERE p_operations->'imageMetadata'->>'locationMode' = 'shared'
      AND ci.source_image_id = v_source_image_id
    UNION
    SELECT related_route.image_id
    FROM public.route_lines AS requested_route
    JOIN public.route_lines AS related_route ON related_route.climb_id = requested_route.climb_id
    WHERE requested_route.id IN (
      SELECT (route->>'routeLineId')::uuid
      FROM jsonb_array_elements(COALESCE(p_operations->'updateRoutes', '[]'::jsonb)) AS route
    )
  ) AS affected;
  FOREACH v_related_image_id IN ARRAY v_affected_image_ids LOOP
    PERFORM 1 FROM public.images WHERE id = v_related_image_id FOR UPDATE;
  END LOOP;

  IF EXISTS (
      SELECT 1 FROM unnest(v_affected_image_ids) AS affected(image_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.wiki_entities WHERE wiki_entities.image_id = affected.image_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_operations->'updateRoutes', '[]'::jsonb)) AS item
      JOIN public.route_lines AS route_line ON route_line.id = (item->>'routeLineId')::uuid
      WHERE NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE route_line_id = route_line.id)
        OR NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE climb_id = route_line.climb_id)
    ) THEN
    INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
    VALUES ('system', 'baseline', 'Captured pre-edit published state', jsonb_build_object('image_id', p_image_id))
    RETURNING id INTO v_baseline_commit_id;
    FOREACH v_related_image_id IN ARRAY v_affected_image_ids LOOP
      PERFORM public.record_wiki_entity_revision('image', v_related_image_id, v_baseline_commit_id);
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_operations->'updateRoutes', '[]'::jsonb))
    LOOP
      v_route_line_id := (v_item->>'routeLineId')::uuid;
      SELECT climb_id INTO v_climb_id FROM public.route_lines WHERE id = v_route_line_id;
      IF v_climb_id IS NOT NULL THEN
        PERFORM public.record_wiki_entity_revision('climb', v_climb_id, v_baseline_commit_id);
        PERFORM public.record_wiki_entity_revision('route_line', v_route_line_id, v_baseline_commit_id);
      END IF;
    END LOOP;
  END IF;

  v_result := public.apply_published_submission_edit_without_revisions(
    p_image_id, p_client_mutation_id, p_operations
  );
  IF COALESCE((v_result->>'replayed')::boolean, false) THEN
    RETURN v_result;
  END IF;
  IF (v_result->>'revision')::bigint = (p_operations->>'baseRevision')::bigint THEN
    v_result := v_result || jsonb_build_object('commitId', NULL);
    UPDATE public.published_edit_mutations
    SET result = v_result
    WHERE editor_id = auth.uid() AND client_mutation_id = p_client_mutation_id;
    RETURN v_result;
  END IF;
  IF COALESCE((v_result->>'createdCount')::integer, 0) = 0
    AND COALESCE((v_result->>'updatedCount')::integer, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_affected_image_ids) AS affected(image_id)
      JOIN public.wiki_entities AS entity ON entity.image_id = affected.image_id
      JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
      JOIN public.wiki_entity_revisions AS revision ON revision.id = head.revision_id
      WHERE revision.snapshot IS DISTINCT FROM public.wiki_entity_snapshot('image', affected.image_id)
    ) THEN
    v_result := v_result || jsonb_build_object('commitId', NULL);
    UPDATE public.published_edit_mutations
    SET result = v_result
    WHERE editor_id = auth.uid() AND client_mutation_id = p_client_mutation_id;
    RETURN v_result;
  END IF;

  INSERT INTO public.wiki_revision_commits (
    client_mutation_id, author_user_id, author_kind, revision_kind, summary,
    metadata
  ) VALUES (
    p_client_mutation_id, auth.uid(), 'user', 'edit', 'Updated published submission',
    jsonb_build_object('image_id', p_image_id)
  ) RETURNING id INTO v_commit_id;

  FOREACH v_related_image_id IN ARRAY v_affected_image_ids LOOP
    PERFORM public.record_wiki_entity_revision('image', v_related_image_id, v_commit_id);
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_result->'routeMappings', '[]'::jsonb))
  LOOP
    v_route_line_id := (v_item->>'routeLineId')::uuid;
    v_climb_id := (v_item->>'climbId')::uuid;
    PERFORM public.record_wiki_entity_revision('climb', v_climb_id, v_commit_id);
    PERFORM public.record_wiki_entity_revision('route_line', v_route_line_id, v_commit_id);
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_operations->'updateRoutes', '[]'::jsonb))
  LOOP
    v_route_line_id := (v_item->>'routeLineId')::uuid;
    SELECT climb_id INTO v_climb_id FROM public.route_lines WHERE id = v_route_line_id;
    PERFORM public.record_wiki_entity_revision('climb', v_climb_id, v_commit_id);
    PERFORM public.record_wiki_entity_revision('route_line', v_route_line_id, v_commit_id);
  END LOOP;

  v_result := v_result || jsonb_build_object('commitId', v_commit_id);
  UPDATE public.published_edit_mutations
  SET result = v_result
  WHERE editor_id = auth.uid() AND client_mutation_id = p_client_mutation_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_published_submission_edit_without_revisions(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_published_submission_edit(uuid, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_published_submission_edit(uuid, uuid, jsonb)
  TO authenticated;

ALTER FUNCTION public.update_submission_crag_metadata(uuid, text, text, text)
  RENAME TO update_submission_crag_metadata_without_revisions;

CREATE OR REPLACE FUNCTION public.update_submission_crag_metadata(
  p_image_id uuid,
  p_crag_name text,
  p_region_tag text,
  p_sub_area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_commit_id uuid;
  v_baseline_commit_id uuid;
  v_crag_id uuid;
BEGIN
  SELECT crag_id INTO v_crag_id FROM public.images WHERE id = p_image_id;
  PERFORM 1 FROM public.crags WHERE id = v_crag_id FOR UPDATE;
  IF v_crag_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE crag_id = v_crag_id) THEN
    INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
    VALUES ('system', 'baseline', 'Captured pre-edit crag state', jsonb_build_object('image_id', p_image_id))
    RETURNING id INTO v_baseline_commit_id;
    PERFORM public.record_wiki_entity_revision('crag', v_crag_id, v_baseline_commit_id);
  END IF;
  v_result := public.update_submission_crag_metadata_without_revisions(
    p_image_id, p_crag_name, p_region_tag, p_sub_area
  );
  v_crag_id := (v_result->>'crag_id')::uuid;
  IF EXISTS (
    SELECT 1 FROM public.wiki_entities AS entity
    JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
    JOIN public.wiki_entity_revisions AS revision ON revision.id = head.revision_id
    WHERE entity.crag_id = v_crag_id
      AND revision.snapshot = public.wiki_entity_snapshot('crag', v_crag_id)
  ) THEN
    RETURN v_result || jsonb_build_object('commitId', NULL);
  END IF;
  INSERT INTO public.wiki_revision_commits (
    author_user_id, author_kind, revision_kind, summary, metadata
  ) VALUES (
    auth.uid(), 'user', 'edit', 'Updated crag metadata', jsonb_build_object('image_id', p_image_id)
  ) RETURNING id INTO v_commit_id;
  PERFORM public.record_wiki_entity_revision('crag', v_crag_id, v_commit_id);
  RETURN v_result || jsonb_build_object('commitId', v_commit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_submission_crag_metadata_without_revisions(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_submission_crag_metadata(uuid, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_submission_crag_metadata(uuid, text, text, text)
  TO authenticated;

ALTER FUNCTION public.update_own_submission_credit(uuid, text, text)
  RENAME TO update_own_submission_credit_without_revisions;
CREATE OR REPLACE FUNCTION public.update_own_submission_credit(
  p_image_id uuid, p_platform text, p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb; v_commit_id uuid; v_baseline_commit_id uuid;
BEGIN
  PERFORM 1 FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE image_id = p_image_id) THEN
    INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
    VALUES ('system', 'baseline', 'Captured pre-edit published state', jsonb_build_object('image_id', p_image_id))
    RETURNING id INTO v_baseline_commit_id;
    PERFORM public.record_wiki_entity_revision('image', p_image_id, v_baseline_commit_id);
  END IF;
  v_result := public.update_own_submission_credit_without_revisions(p_image_id, p_platform, p_handle);
  IF EXISTS (
    SELECT 1 FROM public.wiki_entities AS entity
    JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
    JOIN public.wiki_entity_revisions AS revision ON revision.id = head.revision_id
    WHERE entity.image_id = p_image_id
      AND revision.snapshot = public.wiki_entity_snapshot('image', p_image_id)
  ) THEN
    RETURN v_result || jsonb_build_object('commitId', NULL);
  END IF;
  INSERT INTO public.wiki_revision_commits (author_user_id, author_kind, revision_kind, summary)
  VALUES (auth.uid(), 'user', 'edit', 'Updated submission credit') RETURNING id INTO v_commit_id;
  PERFORM public.record_wiki_entity_revision('image', p_image_id, v_commit_id);
  RETURN v_result || jsonb_build_object('commitId', v_commit_id);
END;
$$;

ALTER FUNCTION public.update_own_submission_anonymity(uuid, boolean)
  RENAME TO update_own_submission_anonymity_without_revisions;
CREATE OR REPLACE FUNCTION public.update_own_submission_anonymity(
  p_image_id uuid, p_is_anonymous boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb; v_commit_id uuid; v_baseline_commit_id uuid;
BEGIN
  PERFORM 1 FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.wiki_entities WHERE image_id = p_image_id) THEN
    INSERT INTO public.wiki_revision_commits (author_kind, revision_kind, summary, metadata)
    VALUES ('system', 'baseline', 'Captured pre-edit published state', jsonb_build_object('image_id', p_image_id))
    RETURNING id INTO v_baseline_commit_id;
    PERFORM public.record_wiki_entity_revision('image', p_image_id, v_baseline_commit_id);
  END IF;
  v_result := public.update_own_submission_anonymity_without_revisions(p_image_id, p_is_anonymous);
  IF EXISTS (
    SELECT 1 FROM public.wiki_entities AS entity
    JOIN public.wiki_entity_heads AS head ON head.entity_id = entity.id
    JOIN public.wiki_entity_revisions AS revision ON revision.id = head.revision_id
    WHERE entity.image_id = p_image_id
      AND revision.snapshot = public.wiki_entity_snapshot('image', p_image_id)
  ) THEN
    RETURN v_result || jsonb_build_object('commitId', NULL);
  END IF;
  INSERT INTO public.wiki_revision_commits (author_user_id, author_kind, revision_kind, summary)
  VALUES (auth.uid(), 'user', 'edit', 'Updated submission anonymity') RETURNING id INTO v_commit_id;
  PERFORM public.record_wiki_entity_revision('image', p_image_id, v_commit_id);
  RETURN v_result || jsonb_build_object('commitId', v_commit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_submission_credit_without_revisions(uuid, text, text),
  public.update_own_submission_anonymity_without_revisions(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_own_submission_credit(uuid, text, text),
  public.update_own_submission_anonymity(uuid, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_own_submission_credit(uuid, text, text),
  public.update_own_submission_anonymity(uuid, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.rollback_wiki_entity_revision(
  p_target_revision_id uuid,
  p_expected_head_revision_id uuid,
  p_reason text
)
RETURNS TABLE(commit_id uuid, revision_id uuid, entity_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target public.wiki_entity_revisions%ROWTYPE;
  v_entity public.wiki_entities%ROWTYPE;
  v_head public.wiki_entity_heads%ROWTYPE;
  v_commit_id uuid;
  v_revision_id uuid;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_tag_id uuid;
  v_affected_image_ids uuid[] := ARRAY[]::uuid[];
  v_related_image_id uuid;
  v_source_image_id uuid;
  v_current_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Rollback reason must contain 1 to 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.wiki_entity_revisions WHERE id = p_target_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_entity FROM public.wiki_entities WHERE id = v_target.entity_id;
  IF (v_entity.entity_kind = 'image' AND NOT EXISTS (SELECT 1 FROM public.images WHERE id = v_entity.image_id))
    OR (v_entity.entity_kind = 'climb' AND NOT EXISTS (SELECT 1 FROM public.climbs WHERE id = v_entity.climb_id))
    OR (v_entity.entity_kind = 'route_line' AND NOT EXISTS (SELECT 1 FROM public.route_lines WHERE id = v_entity.route_line_id))
    OR (v_entity.entity_kind = 'crag' AND NOT EXISTS (SELECT 1 FROM public.crags WHERE id = v_entity.crag_id)) THEN
    RAISE EXCEPTION 'Wiki entity source no longer exists' USING ERRCODE = 'P0002';
  END IF;
  v_current_snapshot := public.wiki_entity_snapshot(
    v_entity.entity_kind,
    COALESCE(v_entity.image_id, v_entity.climb_id, v_entity.route_line_id, v_entity.crag_id)
  );
  IF (v_entity.entity_kind = 'image' AND (
      v_current_snapshot->'status' IS DISTINCT FROM v_target.snapshot->'status'
      OR v_current_snapshot->'visibility' IS DISTINCT FROM v_target.snapshot->'visibility'
    )) OR (v_entity.entity_kind IN ('climb', 'crag') AND (
      v_current_snapshot->'deleted_at' IS DISTINCT FROM v_target.snapshot->'deleted_at'
      OR v_current_snapshot->'deletion_reason' IS DISTINCT FROM v_target.snapshot->'deletion_reason'
      OR v_current_snapshot->'superseded_by' IS DISTINCT FROM v_target.snapshot->'superseded_by'
    )) THEN
    RAISE EXCEPTION 'Lifecycle state must be restored through the dedicated moderation workflow'
      USING ERRCODE = '22023';
  END IF;

  CASE v_entity.entity_kind
    WHEN 'image' THEN
      v_source_image_id := v_entity.image_id;
      IF v_target.snapshot->>'location_mode' = 'shared' THEN
        SELECT COALESCE(ci.source_image_id, v_entity.image_id) INTO v_source_image_id
        FROM public.crag_images AS ci
        WHERE ci.linked_image_id = v_entity.image_id LIMIT 1;
        v_source_image_id := COALESCE(v_source_image_id, v_entity.image_id);
      END IF;
      SELECT array_agg(id ORDER BY id) INTO v_affected_image_ids FROM (
        SELECT v_entity.image_id AS id
        UNION
        SELECT v_source_image_id WHERE v_target.snapshot->>'location_mode' = 'shared'
        UNION
        SELECT ci.linked_image_id FROM public.crag_images AS ci
        WHERE v_target.snapshot->>'location_mode' = 'shared'
          AND ci.source_image_id = v_source_image_id
      ) AS affected;
    WHEN 'climb' THEN
      SELECT COALESCE(array_agg(DISTINCT image_id ORDER BY image_id), ARRAY[]::uuid[])
      INTO v_affected_image_ids FROM public.route_lines WHERE climb_id = v_entity.climb_id;
    WHEN 'route_line' THEN
      SELECT array_agg(id ORDER BY id) INTO v_affected_image_ids FROM (
        SELECT image_id AS id FROM public.route_lines WHERE route_lines.id = v_entity.route_line_id
        UNION SELECT (v_target.snapshot->>'image_id')::uuid
      ) AS affected WHERE id IS NOT NULL;
    ELSE NULL;
  END CASE;

  FOREACH v_related_image_id IN ARRAY v_affected_image_ids LOOP
    PERFORM 1 FROM public.images WHERE id = v_related_image_id FOR UPDATE;
  END LOOP;
  CASE v_entity.entity_kind
    WHEN 'climb' THEN
      PERFORM 1 FROM public.climbs WHERE id = v_entity.climb_id FOR UPDATE;
    WHEN 'route_line' THEN
      PERFORM 1 FROM public.climbs
      WHERE id IN (
        SELECT climb_id FROM public.route_lines WHERE route_lines.id = v_entity.route_line_id
        UNION SELECT (v_target.snapshot->>'climb_id')::uuid
      ) ORDER BY id FOR UPDATE;
      PERFORM 1 FROM public.route_lines WHERE id = v_entity.route_line_id FOR UPDATE;
    WHEN 'crag' THEN
      PERFORM 1 FROM public.crags WHERE id = v_entity.crag_id FOR UPDATE;
    ELSE NULL;
  END CASE;

  SELECT * INTO v_head FROM public.wiki_entity_heads WHERE wiki_entity_heads.entity_id = v_target.entity_id FOR UPDATE;
  IF v_head.revision_id IS DISTINCT FROM p_expected_head_revision_id THEN
    RAISE EXCEPTION 'Wiki entity changed before rollback'
      USING ERRCODE = '40001', DETAIL = 'wiki_revision_conflict', HINT = v_head.revision_id::text;
  END IF;

  CASE v_entity.entity_kind
    WHEN 'image' THEN
      IF v_target.snapshot->>'location_mode' = 'shared' THEN
        UPDATE public.images SET latitude = NULL, longitude = NULL, location_mode = 'shared',
          last_edited_by = auth.uid(), wiki_revision = wiki_revision + 1
        WHERE id = ANY(v_affected_image_ids);
      ELSE
        UPDATE public.images SET
          latitude = (v_target.snapshot->>'latitude')::double precision,
          longitude = (v_target.snapshot->>'longitude')::double precision,
          location_mode = v_target.snapshot->>'location_mode',
          last_edited_by = auth.uid(), wiki_revision = wiki_revision + 1
        WHERE id = v_entity.image_id;
      END IF;
      UPDATE public.images SET
        face_directions = ARRAY(SELECT jsonb_array_elements_text(v_target.snapshot->'face_directions')),
        face_direction = v_target.snapshot->'face_directions'->>0,
        contribution_credit_platform = v_target.snapshot->>'contribution_credit_platform',
        contribution_credit_handle = v_target.snapshot->>'contribution_credit_handle',
        is_anonymous_submission = COALESCE((v_target.snapshot->>'is_anonymous_submission')::boolean, false),
        last_edited_by = auth.uid()
      WHERE id = v_entity.image_id;
    WHEN 'climb' THEN
      UPDATE public.climbs SET
        name = v_target.snapshot->>'name', description = v_target.snapshot->>'description',
        grade = v_target.snapshot->>'grade', original_grade_string = v_target.snapshot->>'original_grade_string',
        route_type = v_target.snapshot->>'route_type', crag_id = (v_target.snapshot->>'crag_id')::uuid,
        place_id = (v_target.snapshot->>'place_id')::uuid, sector_id = (v_target.snapshot->>'sector_id')::uuid,
        latitude = (v_target.snapshot->>'latitude')::double precision,
        longitude = (v_target.snapshot->>'longitude')::double precision,
        shared_climb_id = (v_target.snapshot->>'shared_climb_id')::uuid,
        status = v_target.snapshot->>'status', slug = v_target.snapshot->>'slug', updated_at = now()
      WHERE id = v_entity.climb_id;
      UPDATE public.images SET wiki_revision = wiki_revision + 1, last_edited_by = auth.uid()
      WHERE id = ANY(v_affected_image_ids);
    WHEN 'route_line' THEN
      UPDATE public.route_lines SET
        image_id = (v_target.snapshot->>'image_id')::uuid,
        climb_id = (v_target.snapshot->>'climb_id')::uuid,
        points = v_target.snapshot->'points', color = v_target.snapshot->>'color',
        sequence_order = (v_target.snapshot->>'sequence_order')::integer,
        image_width = (v_target.snapshot->>'image_width')::integer,
        image_height = (v_target.snapshot->>'image_height')::integer
      WHERE id = v_entity.route_line_id;
      UPDATE public.images SET wiki_revision = wiki_revision + 1, last_edited_by = auth.uid()
      WHERE id = ANY(v_affected_image_ids);
    WHEN 'crag' THEN
      UPDATE public.crags SET
        name = v_target.snapshot->>'name', description = v_target.snapshot->>'description',
        access_notes = v_target.snapshot->>'access_notes', rock_type = v_target.snapshot->>'rock_type',
        type = v_target.snapshot->>'type', latitude = (v_target.snapshot->>'latitude')::double precision,
        longitude = (v_target.snapshot->>'longitude')::double precision,
        region_id = (v_target.snapshot->>'region_id')::uuid, region_name = v_target.snapshot->>'region_name',
        sub_area = v_target.snapshot->>'sub_area', country = v_target.snapshot->>'country',
        country_code = v_target.snapshot->>'country_code', country_id = (v_target.snapshot->>'country_id')::uuid,
        tide_dependency = v_target.snapshot->>'tide_dependency', slug = v_target.snapshot->>'slug',
        updated_at = now(), last_edited_by = auth.uid()
      WHERE id = v_entity.crag_id;
      v_tag_id := (v_target.snapshot->>'primary_region_tag_id')::uuid;
      DELETE FROM public.crag_location_tags WHERE crag_id = v_entity.crag_id AND is_primary_region = true;
      IF v_tag_id IS NOT NULL THEN
        INSERT INTO public.crag_location_tags (crag_id, tag_id, is_primary_region)
        VALUES (v_entity.crag_id, v_tag_id, true)
        ON CONFLICT (crag_id, tag_id) DO UPDATE SET is_primary_region = true;
      END IF;
  END CASE;

  INSERT INTO public.wiki_revision_commits (
    author_user_id, author_kind, revision_kind, summary, metadata
  ) VALUES (
    auth.uid(), 'admin', 'rollback', v_reason,
    jsonb_build_object('target_revision_id', p_target_revision_id)
  ) RETURNING id INTO v_commit_id;
  IF v_entity.entity_kind = 'image' THEN
    FOREACH v_related_image_id IN ARRAY v_affected_image_ids LOOP
      IF v_related_image_id = v_entity.image_id THEN
        v_revision_id := public.record_wiki_entity_revision(
          'image', v_related_image_id, v_commit_id, p_target_revision_id
        );
      ELSE
        PERFORM public.record_wiki_entity_revision('image', v_related_image_id, v_commit_id);
      END IF;
    END LOOP;
  ELSE
    v_revision_id := public.record_wiki_entity_revision(
      v_entity.entity_kind,
      COALESCE(v_entity.climb_id, v_entity.route_line_id, v_entity.crag_id),
      v_commit_id,
      p_target_revision_id
    );
  END IF;
  IF v_revision_id IS NULL THEN
    RAISE EXCEPTION 'Target revision already matches the current entity state' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT v_commit_id, v_revision_id, v_entity.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_wiki_entity_revision(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_wiki_entity_revision(uuid, uuid, text)
  TO authenticated;
