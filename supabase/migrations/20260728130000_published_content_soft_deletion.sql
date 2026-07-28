-- Preserve published crags, climbs, and submission history while keeping
-- disposable draft-era rows eligible for physical cleanup.

ALTER TABLE public.crags
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deletion_reason text,
  ADD COLUMN superseded_by uuid;

ALTER TABLE public.climbs
  ADD COLUMN deletion_reason text,
  ADD COLUMN superseded_by uuid;

UPDATE public.climbs
SET deletion_reason = 'Legacy soft deletion'
WHERE deleted_at IS NOT NULL;

ALTER TABLE public.crags
  ADD CONSTRAINT crags_deletion_state_check CHECK (
    (deleted_at IS NULL AND deletion_reason IS NULL AND superseded_by IS NULL)
    OR (
      deleted_at IS NOT NULL
      AND char_length(btrim(deletion_reason)) BETWEEN 1 AND 500
    )
  ),
  ADD CONSTRAINT crags_superseded_by_not_self CHECK (superseded_by IS DISTINCT FROM id),
  ADD CONSTRAINT crags_superseded_by_fkey FOREIGN KEY (superseded_by)
    REFERENCES public.crags(id) ON DELETE RESTRICT;

ALTER TABLE public.climbs
  ADD CONSTRAINT climbs_deletion_state_check CHECK (
    (deleted_at IS NULL AND deletion_reason IS NULL AND superseded_by IS NULL)
    OR (
      deleted_at IS NOT NULL
      AND char_length(btrim(deletion_reason)) BETWEEN 1 AND 500
    )
  ),
  ADD CONSTRAINT climbs_superseded_by_not_self CHECK (superseded_by IS DISTINCT FROM id),
  ADD CONSTRAINT climbs_superseded_by_fkey FOREIGN KEY (superseded_by)
    REFERENCES public.climbs(id) ON DELETE RESTRICT;

CREATE INDEX idx_crags_superseded_by ON public.crags (superseded_by)
  WHERE superseded_by IS NOT NULL;
CREATE INDEX idx_climbs_superseded_by ON public.climbs (superseded_by)
  WHERE superseded_by IS NOT NULL;

ALTER TABLE public.submission_edit_history
  ALTER COLUMN edited_by DROP NOT NULL,
  DROP CONSTRAINT submission_edit_history_image_id_fkey,
  DROP CONSTRAINT submission_edit_history_edited_by_fkey,
  ADD CONSTRAINT submission_edit_history_image_id_fkey FOREIGN KEY (image_id)
    REFERENCES public.images(id) ON DELETE RESTRICT,
  ADD CONSTRAINT submission_edit_history_edited_by_fkey FOREIGN KEY (edited_by)
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_content_supersession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  replacement_active boolean;
  creates_cycle boolean;
BEGIN
  IF TG_OP = 'INSERT'
    AND (NEW.deleted_at IS NOT NULL OR NEW.deletion_reason IS NOT NULL OR NEW.superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Lifecycle fields may only be set by a soft-delete workflow'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD.deleted_at, OLD.deletion_reason, OLD.superseded_by)
      IS DISTINCT FROM (NEW.deleted_at, NEW.deletion_reason, NEW.superseded_by)
    AND auth.role() <> 'service_role'
    AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Lifecycle fields may only be changed by a soft-delete RPC'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.superseded_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'crags' THEN
    SELECT c.deleted_at IS NULL AND c.superseded_by IS NULL
    INTO replacement_active
    FROM public.crags AS c
    WHERE c.id = NEW.superseded_by
    FOR KEY SHARE;

    WITH RECURSIVE chain(id, path) AS (
      SELECT NEW.superseded_by, ARRAY[NEW.id, NEW.superseded_by]
      UNION ALL
      SELECT c.superseded_by, chain.path || c.superseded_by
      FROM chain
      JOIN public.crags AS c ON c.id = chain.id
      WHERE c.superseded_by IS NOT NULL
        AND NOT c.superseded_by = ANY(chain.path)
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE id = NEW.id) INTO creates_cycle;
  ELSE
    SELECT c.deleted_at IS NULL AND c.superseded_by IS NULL
    INTO replacement_active
    FROM public.climbs AS c
    WHERE c.id = NEW.superseded_by
    FOR KEY SHARE;

    WITH RECURSIVE chain(id, path) AS (
      SELECT NEW.superseded_by, ARRAY[NEW.id, NEW.superseded_by]
      UNION ALL
      SELECT c.superseded_by, chain.path || c.superseded_by
      FROM chain
      JOIN public.climbs AS c ON c.id = chain.id
      WHERE c.superseded_by IS NOT NULL
        AND NOT c.superseded_by = ANY(chain.path)
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE id = NEW.id) INTO creates_cycle;
  END IF;

  IF replacement_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Supersession replacement must be active';
  END IF;
  IF creates_cycle THEN
    RAISE EXCEPTION 'Supersession cycle is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crags_validate_supersession
BEFORE INSERT OR UPDATE OF deleted_at, deletion_reason, superseded_by ON public.crags
FOR EACH ROW EXECUTE FUNCTION public.validate_content_supersession();

CREATE TRIGGER climbs_validate_supersession
BEFORE INSERT OR UPDATE OF deleted_at, deletion_reason, superseded_by ON public.climbs
FOR EACH ROW EXECUTE FUNCTION public.validate_content_supersession();

CREATE OR REPLACE FUNCTION public.guard_active_crag_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.crag_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crags c WHERE c.id = NEW.crag_id AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Content cannot be associated with a deleted crag';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER climbs_require_active_crag
BEFORE INSERT OR UPDATE OF crag_id ON public.climbs
FOR EACH ROW EXECUTE FUNCTION public.guard_active_crag_association();

CREATE TRIGGER images_require_active_crag
BEFORE INSERT OR UPDATE OF crag_id ON public.images
FOR EACH ROW EXECUTE FUNCTION public.guard_active_crag_association();

CREATE TRIGGER crag_images_require_active_crag
BEFORE INSERT OR UPDATE OF crag_id ON public.crag_images
FOR EACH ROW EXECUTE FUNCTION public.guard_active_crag_association();

CREATE OR REPLACE FUNCTION public.climb_is_hard_deletable(p_climb_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.climbs AS c
    WHERE c.id = p_climb_id
      AND c.status = 'pending'
      AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.climb_corrections x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climb_flags x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climb_verifications x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climb_video_betas x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.grade_votes x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.route_grades x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.route_lines x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.saved_climbs x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.user_climbs x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.contribution_events x WHERE x.climb_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.comments x WHERE x.target_type = 'climb' AND x.target_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climbs x WHERE x.shared_climb_id = c.id OR x.superseded_by = c.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.crag_is_hard_deletable(p_crag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crags AS c
    WHERE c.id = p_crag_id
      AND NOT EXISTS (SELECT 1 FROM public.images x WHERE x.crag_id = c.id OR x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climbs x WHERE x.crag_id = c.id OR x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.submission_drafts x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crag_images x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.sectors x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crag_reports x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.climb_flags x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crag_location_tags x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.saved_crags x WHERE x.crag_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.community_place_follows x WHERE x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.community_posts x WHERE x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.gym_floor_plans x WHERE x.gym_place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.gym_memberships x WHERE x.gym_place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.gym_routes x WHERE x.gym_place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.contribution_events x WHERE x.crag_id = c.id OR x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.contribution_bounties x WHERE x.crag_id = c.id OR x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.user_place_contributor_scores x WHERE x.place_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.comments x WHERE x.target_type = 'crag' AND x.target_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.crags x WHERE x.superseded_by = c.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_published_content_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'crags' THEN
    IF NOT public.crag_is_hard_deletable(OLD.id) THEN
      RAISE EXCEPTION 'Only empty crags may be hard-deleted';
    END IF;
  ELSIF TG_TABLE_NAME = 'climbs' THEN
    IF NOT public.climb_is_hard_deletable(OLD.id) THEN
      RAISE EXCEPTION 'Only unassociated, never-published climbs may be hard-deleted';
    END IF;
  ELSIF TG_TABLE_NAME = 'images' THEN
    IF OLD.status IN ('approved', 'deleted') OR public.image_has_content_references(OLD.id) THEN
      RAISE EXCEPTION 'Only unassociated, never-published images may be hard-deleted';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER crags_guard_hard_delete
BEFORE DELETE ON public.crags FOR EACH ROW
EXECUTE FUNCTION public.guard_published_content_hard_delete();

CREATE TRIGGER climbs_guard_hard_delete
BEFORE DELETE ON public.climbs FOR EACH ROW
EXECUTE FUNCTION public.guard_published_content_hard_delete();

CREATE TRIGGER images_guard_hard_delete
BEFORE DELETE ON public.images FOR EACH ROW
EXECUTE FUNCTION public.guard_published_content_hard_delete();

CREATE OR REPLACE FUNCTION public.soft_delete_climb(
  p_climb_id uuid,
  p_reason text,
  p_superseded_by uuid DEFAULT NULL
)
RETURNS public.climbs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.climbs%ROWTYPE;
  replacement public.climbs%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters';
  END IF;
  IF p_climb_id = p_superseded_by THEN
    RAISE EXCEPTION 'A climb cannot supersede itself';
  END IF;

  SELECT * INTO target FROM public.climbs WHERE id = p_climb_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Climb not found'; END IF;
  IF target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Climb is already deleted'; END IF;

  IF p_superseded_by IS NOT NULL THEN
    SELECT * INTO replacement FROM public.climbs WHERE id = p_superseded_by FOR UPDATE;
    IF NOT FOUND OR replacement.deleted_at IS NOT NULL OR replacement.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'Supersession replacement must be active';
    END IF;
  END IF;

  UPDATE public.climbs
  SET deleted_at = now(), deletion_reason = reason, superseded_by = p_superseded_by
  WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
  VALUES (auth.uid(), 'soft_delete', target.id, 'climb',
    jsonb_build_object('reason', reason, 'superseded_by', p_superseded_by));
  RETURN target;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_crag(
  p_crag_id uuid,
  p_reason text,
  p_superseded_by uuid DEFAULT NULL
)
RETURNS public.crags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.crags%ROWTYPE;
  replacement public.crags%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
  child_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters';
  END IF;
  IF p_crag_id = p_superseded_by THEN RAISE EXCEPTION 'A crag cannot supersede itself'; END IF;

  SELECT * INTO target FROM public.crags WHERE id = p_crag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crag not found'; END IF;
  IF target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Crag is already deleted'; END IF;
  IF p_superseded_by IS NOT NULL THEN
    SELECT * INTO replacement FROM public.crags WHERE id = p_superseded_by FOR UPDATE;
    IF NOT FOUND OR replacement.deleted_at IS NOT NULL OR replacement.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'Supersession replacement must be active';
    END IF;
  END IF;

  PERFORM 1 FROM public.climbs WHERE crag_id = target.id AND deleted_at IS NULL ORDER BY id FOR UPDATE;
  UPDATE public.climbs
  SET deleted_at = now(), deletion_reason = left('Parent crag deleted: ' || reason, 500)
  WHERE crag_id = target.id AND deleted_at IS NULL;
  GET DIAGNOSTICS child_count = ROW_COUNT;

  UPDATE public.crags
  SET deleted_at = now(), deletion_reason = reason, superseded_by = p_superseded_by
  WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
  VALUES (auth.uid(), 'soft_delete', target.id, 'crag',
    jsonb_build_object('reason', reason, 'superseded_by', p_superseded_by,
      'soft_deleted_climbs', child_count));
  RETURN target;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_image(p_image_id uuid, p_reason text)
RETURNS public.images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.images%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Deletion reason must contain 1 to 500 characters';
  END IF;

  SELECT * INTO target FROM public.images WHERE id = p_image_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image not found'; END IF;
  IF target.status = 'deleted' THEN RAISE EXCEPTION 'Image is already deleted'; END IF;

  UPDATE public.images
  SET status = 'deleted', visibility = 'private'
  WHERE id = target.id
  RETURNING * INTO target;

  INSERT INTO public.admin_actions (user_id, action, target_id, target_type, details)
  VALUES (auth.uid(), 'soft_delete', target.id, 'image', jsonb_build_object('reason', reason));
  RETURN target;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_published_submission(
  p_image_ids uuid[],
  p_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_count integer;
  owned_count integer;
  deleted_climb_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT id) INTO expected_count
  FROM unnest(COALESCE(p_image_ids, ARRAY[]::uuid[])) AS requested(id);
  IF expected_count = 0 OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Owned submission images are required';
  END IF;

  PERFORM 1
  FROM public.images i
  WHERE i.id = ANY(p_image_ids)
  ORDER BY i.id
  FOR UPDATE;

  SELECT count(*) INTO owned_count
  FROM public.images i
  WHERE i.id = ANY(p_image_ids) AND i.created_by = p_owner_id;
  IF owned_count <> expected_count THEN
    RAISE EXCEPTION 'Submission ownership changed';
  END IF;

  UPDATE public.images
  SET status = 'deleted', visibility = 'private'
  WHERE id = ANY(p_image_ids);

  UPDATE public.climbs c
  SET deleted_at = now(), deletion_reason = 'Owner deleted published submission'
  WHERE c.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.route_lines selected
      WHERE selected.climb_id = c.id AND selected.image_id = ANY(p_image_ids)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.route_lines retained
      WHERE retained.climb_id = c.id AND NOT (retained.image_id = ANY(p_image_ids))
    );
  GET DIAGNOSTICS deleted_climb_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'soft_deleted_images', expected_count,
    'soft_deleted_climbs', deleted_climb_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_climb(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_crag(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_image(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_published_submission(uuid[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_climb(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_crag(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_image(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_published_submission(uuid[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.validate_content_supersession() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_active_crag_association() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_published_content_hard_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.climb_is_hard_deletable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crag_is_hard_deletable(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Admins can delete climbs" ON public.climbs;
DROP POLICY IF EXISTS "Admins can delete crags" ON public.crags;
DROP POLICY IF EXISTS "Admins can delete images" ON public.images;
REVOKE DELETE ON public.climbs FROM authenticated;
REVOKE DELETE ON public.crags FROM authenticated;
REVOKE DELETE ON public.images FROM authenticated;

DROP POLICY IF EXISTS "Public read climbs" ON public.climbs;
CREATE POLICY "Public read active climbs" ON public.climbs
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND (crag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = climbs.crag_id AND c.deleted_at IS NULL
    ))
  );
CREATE POLICY "Admins read all climbs" ON public.climbs
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Public read crags" ON public.crags;
CREATE POLICY "Public read active crags" ON public.crags
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY "Admins read all crags" ON public.crags
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

CREATE POLICY "Readable images must have an active parent" ON public.images
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    status <> 'deleted'
    AND (crag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = images.crag_id AND c.deleted_at IS NULL
    ))
  );

DROP POLICY IF EXISTS "Public read visible comments" ON public.comments;
CREATE POLICY "Public read visible comments" ON public.comments
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL AND CASE target_type
      WHEN 'crag' THEN EXISTS (SELECT 1 FROM public.crags c WHERE c.id = target_id AND c.deleted_at IS NULL)
      WHEN 'climb' THEN EXISTS (
        SELECT 1 FROM public.climbs c JOIN public.crags cr ON cr.id = c.crag_id
        WHERE c.id = target_id AND c.deleted_at IS NULL AND cr.deleted_at IS NULL
      )
      WHEN 'image' THEN EXISTS (
        SELECT 1 FROM public.images i LEFT JOIN public.crags cr ON cr.id = i.crag_id
        WHERE i.id = target_id AND i.status <> 'deleted'
          AND (i.crag_id IS NULL OR cr.deleted_at IS NULL)
      )
      ELSE false
    END
  );

CREATE OR REPLACE FUNCTION public.user_can_wiki_edit_submission(p_image_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.images AS i
      LEFT JOIN public.crags AS c ON c.id = i.crag_id
      WHERE i.id = p_image_id
        AND i.created_by IS NOT NULL
        AND i.status <> 'deleted'
        AND (i.crag_id IS NULL OR c.deleted_at IS NULL)
    );
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_comments_on_target_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.comments SET deleted_at = now()
  WHERE target_type = TG_ARGV[0] AND target_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_comment_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.target_type = 'crag' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = NEW.target_id AND c.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Target crag does not exist or has been deleted';
    END IF;
  ELSIF NEW.target_type = 'image' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.images i
      LEFT JOIN public.crags c ON c.id = i.crag_id
      WHERE i.id = NEW.target_id
        AND i.status <> 'deleted'
        AND (i.crag_id IS NULL OR c.deleted_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'Target image does not exist or has been deleted';
    END IF;
  ELSIF NEW.target_type = 'climb' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.climbs cl
      LEFT JOIN public.crags c ON c.id = cl.crag_id
      WHERE cl.id = NEW.target_id
        AND cl.deleted_at IS NULL
        AND (cl.crag_id IS NULL OR c.deleted_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'Target climb does not exist or has been deleted';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target type';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_crag_slug(p_country_code text, p_crag_slug text)
RETURNS TABLE (id uuid, name text, country_code text, slug text, superseded_from uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.name::text, c.country_code::text, c.slug, c.deleted_at,
      c.superseded_by, c.id AS original_id, ARRAY[c.id] AS path
    FROM public.crags c
    WHERE lower(c.country_code) = lower(btrim(p_country_code))
      AND c.slug = btrim(p_crag_slug)
    UNION ALL
    SELECT c.id, c.name::text, c.country_code::text, c.slug, c.deleted_at,
      c.superseded_by, chain.original_id, chain.path || c.id
    FROM chain JOIN public.crags c ON c.id = chain.superseded_by
    WHERE NOT c.id = ANY(chain.path)
  )
  SELECT chain.id, chain.name, chain.country_code, chain.slug,
    CASE WHEN chain.id = chain.original_id THEN NULL ELSE chain.original_id END
  FROM chain
  WHERE chain.deleted_at IS NULL AND chain.superseded_by IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_climb_slug(
  p_country_code text, p_crag_slug text, p_climb_slug text
)
RETURNS TABLE (
  id uuid, crag_id uuid, name text, slug text, grade text, route_type text,
  superseded_from uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT cl.id, cl.crag_id, cl.name::text, cl.slug, cl.grade::text,
      cl.route_type::text, cl.deleted_at, cl.superseded_by,
      cl.id AS original_id, ARRAY[cl.id] AS path
    FROM public.climbs cl
    JOIN public.crags cr ON cr.id = cl.crag_id
    WHERE lower(cr.country_code) = lower(btrim(p_country_code))
      AND cr.slug = btrim(p_crag_slug) AND cl.slug = btrim(p_climb_slug)
    UNION ALL
    SELECT cl.id, cl.crag_id, cl.name::text, cl.slug, cl.grade::text,
      cl.route_type::text, cl.deleted_at, cl.superseded_by,
      chain.original_id, chain.path || cl.id
    FROM chain JOIN public.climbs cl ON cl.id = chain.superseded_by
    WHERE NOT cl.id = ANY(chain.path)
  )
  SELECT chain.id, chain.crag_id, chain.name, chain.slug, chain.grade,
    chain.route_type, CASE WHEN chain.id = chain.original_id THEN NULL ELSE chain.original_id END
  FROM chain JOIN public.crags cr ON cr.id = chain.crag_id
  WHERE chain.deleted_at IS NULL AND chain.superseded_by IS NULL AND cr.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_crag_slug(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_public_climb_slug(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_crag_slug(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_public_climb_slug(text, text, text) TO anon, authenticated, service_role;

GRANT SELECT (id, deleted_at) ON public.crags TO operational_aggregate_reader;
GRANT SELECT (id, crag_id, deleted_at) ON public.climbs TO operational_aggregate_reader;
GRANT SELECT (id, crag_id, status, moderation_status, visibility, processing_status)
  ON public.images TO operational_aggregate_reader;
CREATE POLICY "Aggregate reader sees active crags" ON public.crags
  FOR SELECT TO operational_aggregate_reader USING (deleted_at IS NULL);
CREATE POLICY "Aggregate reader sees active climbs" ON public.climbs
  FOR SELECT TO operational_aggregate_reader USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = climbs.crag_id AND c.deleted_at IS NULL
    )
  );
CREATE POLICY "Aggregate reader sees active images" ON public.images
  FOR SELECT TO operational_aggregate_reader USING (
    status <> 'deleted' AND (crag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = images.crag_id AND c.deleted_at IS NULL
    ))
  );

DO $migration$
BEGIN
EXECUTE $account$
CREATE OR REPLACE FUNCTION public.delete_account_atomic(
  p_user_id uuid, p_email text, p_delete_route_uploads boolean
)
RETURNS TABLE(
  deleted_profile boolean, deleted_route_upload_images integer,
  deleted_user_climbs integer, deleted_logs integer, nullified_images integer,
  deleted_images integer, nullified_climbs integer, deleted_climbs integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile integer := 0; v_route_images integer := 0; v_user_climbs integer := 0;
  v_logs integer := 0; v_null_images integer := 0; v_images integer := 0;
  v_null_climbs integer := 0; v_climbs integer := 0;
  v_affected integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.deleted_accounts (user_id, email, delete_route_uploads)
  VALUES (p_user_id, p_email, p_delete_route_uploads);
  DELETE FROM public.admin_actions WHERE user_id = p_user_id;
  DELETE FROM public.user_climbs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_user_climbs = ROW_COUNT;
  DELETE FROM public.climb_corrections WHERE user_id = p_user_id;
  DELETE FROM public.correction_votes WHERE user_id = p_user_id;
  DELETE FROM public.climb_verifications WHERE user_id = p_user_id;
  DELETE FROM public.grade_votes WHERE user_id = p_user_id;
  DELETE FROM public.route_grades WHERE user_id = p_user_id;

  IF p_delete_route_uploads THEN
    UPDATE public.images AS i
    SET created_by = NULL, last_edited_by = NULL, status = 'deleted', visibility = 'private'
    WHERE i.created_by = p_user_id
      AND (i.status = 'approved' OR EXISTS (
        SELECT 1 FROM public.submission_edit_history h WHERE h.image_id = i.id
      ));
    GET DIAGNOSTICS v_null_images = ROW_COUNT;
    DELETE FROM public.images AS i
    WHERE i.created_by = p_user_id AND NOT public.image_has_content_references(i.id);
    GET DIAGNOSTICS v_images = ROW_COUNT;
    v_route_images := v_images;
    UPDATE public.images SET created_by = NULL, last_edited_by = NULL
    WHERE created_by = p_user_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_null_images := v_null_images + v_affected;

    UPDATE public.climbs SET deleted_at = COALESCE(deleted_at, now()),
      deletion_reason = COALESCE(deletion_reason, 'Creator account deleted'), user_id = NULL
    WHERE user_id = p_user_id
      AND (status <> 'pending' OR deleted_at IS NOT NULL OR NOT public.climb_is_hard_deletable(id));
    GET DIAGNOSTICS v_null_climbs = ROW_COUNT;
    DELETE FROM public.climbs AS c
    WHERE c.user_id = p_user_id AND public.climb_is_hard_deletable(c.id);
    GET DIAGNOSTICS v_climbs = ROW_COUNT;
    UPDATE public.climbs SET user_id = NULL WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_null_climbs := v_null_climbs + v_affected;
  ELSE
    UPDATE public.images SET created_by = NULL, last_edited_by = NULL WHERE created_by = p_user_id;
    GET DIAGNOSTICS v_null_images = ROW_COUNT;
    UPDATE public.climbs SET user_id = NULL WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_null_climbs = ROW_COUNT;
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_profile = ROW_COUNT;
  IF v_profile <> 1 THEN
    RAISE EXCEPTION 'Expected to delete exactly one profile';
  END IF;
  RETURN QUERY SELECT true, v_route_images, v_user_climbs, v_logs, v_null_images,
    v_images, v_null_climbs, v_climbs;
END;
$function$
$account$;
END;
$migration$;

GRANT operational_aggregate_reader TO postgres;
ALTER VIEW public.climb_flag_counts OWNER TO postgres;
ALTER VIEW public.crag_report_counts OWNER TO postgres;

CREATE OR REPLACE VIEW public.climb_flag_counts
WITH (security_barrier = true, security_invoker = false) AS
SELECT 'image'::text AS target_type, image_id AS target_id, count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count
FROM public.climb_flags
WHERE image_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.images i WHERE i.id = climb_flags.image_id
    AND i.status = 'approved'
    AND i.moderation_status IN ('approved', 'skipped')
    AND i.visibility = 'public'
    AND i.processing_status = 'ready'
    AND (i.crag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.crags c WHERE c.id = i.crag_id AND c.deleted_at IS NULL
    ))
)
GROUP BY image_id
UNION ALL
SELECT 'climb'::text, climb_id, count(*), count(*) FILTER (WHERE status = 'pending')
FROM public.climb_flags
WHERE climb_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.climbs c JOIN public.crags cr ON cr.id = c.crag_id
  WHERE c.id = climb_flags.climb_id AND c.deleted_at IS NULL AND cr.deleted_at IS NULL
)
GROUP BY climb_id
UNION ALL
SELECT 'crag'::text, crag_id, count(*), count(*) FILTER (WHERE status = 'pending')
FROM public.climb_flags
WHERE crag_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.crags c WHERE c.id = climb_flags.crag_id AND c.deleted_at IS NULL
)
GROUP BY crag_id;

CREATE OR REPLACE VIEW public.crag_report_counts
WITH (security_barrier = true, security_invoker = false) AS
SELECT crag_id, count(*) AS total_count,
  count(*) FILTER (WHERE status = 'pending') AS pending_count,
  count(*) FILTER (WHERE status = 'investigating') AS investigating_count,
  count(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  count(*) FILTER (WHERE status = 'dismissed') AS dismissed_count
FROM public.crag_reports
WHERE EXISTS (
  SELECT 1 FROM public.crags c WHERE c.id = crag_reports.crag_id AND c.deleted_at IS NULL
)
GROUP BY crag_id;

GRANT CREATE ON SCHEMA public TO operational_aggregate_reader;
ALTER VIEW public.climb_flag_counts OWNER TO operational_aggregate_reader;
ALTER VIEW public.crag_report_counts OWNER TO operational_aggregate_reader;
REVOKE CREATE ON SCHEMA public FROM operational_aggregate_reader;
REVOKE operational_aggregate_reader FROM postgres;

CREATE OR REPLACE FUNCTION public.get_crag_pins(include_pending boolean DEFAULT false)
RETURNS TABLE(id uuid, name text, latitude numeric, longitude numeric, image_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.name::text, avg(i.latitude)::numeric(10,8),
    avg(i.longitude)::numeric(11,8), count(i.id)::bigint
  FROM public.crags c
  JOIN public.images i ON i.crag_id = c.id
    AND i.status <> 'deleted'
    AND (i.status = 'approved' OR (include_pending AND i.status = 'pending'))
    AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
  WHERE c.deleted_at IS NULL
  GROUP BY c.id, c.name
  HAVING count(i.id) > 0;
$$;

CREATE OR REPLACE FUNCTION public.get_crag_pins()
RETURNS TABLE(id uuid, name text, latitude numeric, longitude numeric, image_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.get_crag_pins(false);
$$;

CREATE OR REPLACE FUNCTION public.get_place_pins(include_pending boolean DEFAULT false)
RETURNS TABLE(
  id uuid, name text, type text, latitude numeric, longitude numeric, slug text,
  country_code varchar, image_count bigint, route_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.name::text, 'crag'::text, avg(i.latitude)::numeric(10,8),
    avg(i.longitude)::numeric(11,8), c.slug, c.country_code, count(i.id)::bigint,
    c.route_count
  FROM public.crags c
  JOIN public.images i ON i.crag_id = c.id
    AND i.status <> 'deleted'
    AND (i.status = 'approved' OR (include_pending AND i.status = 'pending'))
    AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
  WHERE c.deleted_at IS NULL
  GROUP BY c.id, c.name, c.slug, c.country_code, c.route_count
  HAVING count(i.id) > 0
  UNION ALL
  SELECT p.id, p.name::text, p.type, p.latitude, p.longitude, p.slug,
    p.country_code, NULL::bigint, NULL::integer
  FROM public.places p
  WHERE p.type = 'gym' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    AND p.slug IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_boulders_with_gps_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(DISTINCT c.crag_id)
  FROM public.climbs c
  JOIN public.crags cr ON cr.id = c.crag_id
  WHERE c.deleted_at IS NULL AND cr.deleted_at IS NULL
    AND cr.latitude IS NOT NULL AND cr.longitude IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_total_climbs_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.climbs c
  LEFT JOIN public.crags cr ON cr.id = c.crag_id
  WHERE c.deleted_at IS NULL AND (c.crag_id IS NULL OR cr.deleted_at IS NULL);
$$;

ALTER FUNCTION public.get_crag_rankings_leaderboard(uuid, text, integer, integer, timestamptz)
  RENAME TO get_crag_rankings_leaderboard_including_deleted;
REVOKE ALL ON FUNCTION public.get_crag_rankings_leaderboard_including_deleted(
  uuid, text, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_crag_rankings_leaderboard(
  p_crag_id uuid, p_sort text DEFAULT 'tops', p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20, p_window_start timestamptz DEFAULT NULL
)
RETURNS TABLE(
  rank bigint, user_id uuid, username text, avatar_url text, avg_grade text,
  climb_count bigint, total_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH filtered_climbs AS (
    SELECT uc.user_id, uc.style, uc.created_at, c.grade, p.username,
      p.first_name, p.last_name, p.display_name, p.avatar_url
    FROM public.user_climbs uc
    JOIN public.climbs c ON c.id = uc.climb_id
    JOIN public.crags cr ON cr.id = c.crag_id
    JOIN public.profiles p ON p.id = uc.user_id
    WHERE uc.style IN ('top', 'flash')
      AND c.crag_id = p_crag_id
      AND c.deleted_at IS NULL
      AND cr.deleted_at IS NULL
      AND (p_window_start IS NULL OR uc.created_at >= p_window_start)
      AND p.is_public = true
  ), scored_users AS (
    SELECT fc.user_id,
      COALESCE(
        NULLIF(btrim(concat(COALESCE(fc.first_name, ''), ' ', COALESCE(fc.last_name, ''))), ''),
        NULLIF(fc.display_name, ''), NULLIF(fc.username, ''),
        concat('Climber ', left(fc.user_id::text, 4))
      ) AS username,
      max(fc.avatar_url) AS avatar_url,
      count(*)::bigint AS climb_count,
      round(avg(CASE WHEN fc.grade IS NULL THEN NULL ELSE
        CASE upper(btrim(fc.grade))
          WHEN '1A' THEN 100 WHEN '1A+' THEN 116 WHEN '1B' THEN 132 WHEN '1B+' THEN 148
          WHEN '1C' THEN 164 WHEN '1C+' THEN 180 WHEN '2A' THEN 196 WHEN '2A+' THEN 212
          WHEN '2B' THEN 228 WHEN '2B+' THEN 244 WHEN '2C' THEN 260 WHEN '2C+' THEN 276
          WHEN '3A' THEN 292 WHEN '3A+' THEN 308 WHEN '3B' THEN 324 WHEN '3B+' THEN 340
          WHEN '3C' THEN 356 WHEN '3C+' THEN 372 WHEN '4A' THEN 388 WHEN '4A+' THEN 404
          WHEN '4B' THEN 420 WHEN '4B+' THEN 436 WHEN '4C' THEN 452 WHEN '4C+' THEN 468
          WHEN '5A' THEN 484 WHEN '5A+' THEN 500 WHEN '5B' THEN 516 WHEN '5B+' THEN 532
          WHEN '5C' THEN 548 WHEN '5C+' THEN 564 WHEN '6A' THEN 580 WHEN '6A+' THEN 596
          WHEN '6B' THEN 612 WHEN '6B+' THEN 628 WHEN '6C' THEN 644 WHEN '6C+' THEN 660
          WHEN '7A' THEN 676 WHEN '7A+' THEN 692 WHEN '7B' THEN 708 WHEN '7B+' THEN 724
          WHEN '7C' THEN 740 WHEN '7C+' THEN 756 WHEN '8A' THEN 772 WHEN '8A+' THEN 788
          WHEN '8B' THEN 804 WHEN '8B+' THEN 820 WHEN '8C' THEN 836 WHEN '8C+' THEN 852
          WHEN '9A' THEN 868 WHEN '9A+' THEN 884 WHEN '9B' THEN 900 WHEN '9B+' THEN 916
          WHEN '9C' THEN 932 WHEN '9C+' THEN 948 ELSE NULL
        END + CASE WHEN fc.style = 'flash' THEN 10 ELSE 0 END
      END))::integer AS avg_points
    FROM filtered_climbs fc
    GROUP BY fc.user_id, fc.username, fc.first_name, fc.last_name, fc.display_name
  ), ranked AS (
    SELECT row_number() OVER (
        ORDER BY CASE WHEN p_sort = 'tops' THEN su.climb_count
          ELSE COALESCE(su.avg_points, 0) END DESC, su.climb_count DESC, su.user_id
      )::bigint AS rank,
      su.user_id, su.username, su.avatar_url,
      public.rankings_grade_from_points(COALESCE(su.avg_points, 0)) AS avg_grade,
      su.climb_count, count(*) OVER ()::bigint AS total_users
    FROM scored_users su
  )
  SELECT ranked.rank, ranked.user_id, ranked.username, ranked.avatar_url,
    ranked.avg_grade, ranked.climb_count, ranked.total_users
  FROM ranked
  ORDER BY ranked.rank
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_limit, 1);
$$;
REVOKE ALL ON FUNCTION public.get_crag_rankings_leaderboard(
  uuid, text, integer, integer, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crag_rankings_leaderboard(
  uuid, text, integer, integer, timestamptz
) TO anon, authenticated, service_role;
DROP FUNCTION public.get_crag_rankings_leaderboard_including_deleted(
  uuid, text, integer, integer, timestamptz
);

ALTER FUNCTION public.get_crag_contributor_leaderboard(uuid, integer)
  RENAME TO get_crag_contributor_leaderboard_including_deleted;
REVOKE ALL ON FUNCTION public.get_crag_contributor_leaderboard_including_deleted(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_crag_contributor_leaderboard(p_crag_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE(
  user_id uuid, username text, display_name text, avatar_url text,
  contribution_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url,
    count(DISTINCT i.id) AS contribution_count
  FROM public.profiles p
  JOIN public.images i ON i.created_by = p.id
  JOIN public.crags c ON c.id = p_crag_id
  WHERE i.crag_id = p_crag_id
    AND i.status <> 'deleted'
    AND c.deleted_at IS NULL
    AND p.is_public = true
  GROUP BY p.id, p.username, p.display_name, p.avatar_url
  ORDER BY contribution_count DESC, p.id ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 10), 100), 1);
$$;
REVOKE ALL ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crag_contributor_leaderboard(uuid, integer)
  TO anon, authenticated;
DROP FUNCTION public.get_crag_contributor_leaderboard_including_deleted(uuid, integer);
