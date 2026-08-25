-- Release B: permanently retire the user-submitted climb flagging subsystem.
-- Application callers were removed in the preceding release so this migration
-- can remove the stored data and database contracts without a mixed-version gap.

DROP FUNCTION IF EXISTS public.resolve_flag_and_soft_delete(uuid, text);
DROP FUNCTION IF EXISTS public.get_image_pending_flag_count(uuid);
DROP VIEW IF EXISTS public.climb_flag_counts;

DROP POLICY IF EXISTS "Aggregate reader sees active climbs" ON public.climbs;
DROP POLICY IF EXISTS "Aggregate reader sees active images" ON public.images;
REVOKE SELECT (id, crag_id, deleted_at)
  ON public.climbs FROM operational_aggregate_reader;
REVOKE SELECT (id, crag_id, status, moderation_status, visibility, processing_status)
  ON public.images FROM operational_aggregate_reader;

CREATE OR REPLACE FUNCTION public.image_has_content_references(p_image_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.images i
    WHERE i.id = p_image_id
      AND (i.crag_id IS NOT NULL OR i.place_id IS NOT NULL OR i.submission_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.route_lines rl WHERE rl.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.crag_images ci
    WHERE ci.linked_image_id = p_image_id OR ci.source_image_id = p_image_id
  ) OR EXISTS (
    SELECT 1
    FROM public.submission_draft_images di
    JOIN public.images target ON target.id = p_image_id
    WHERE di.linked_image_id = p_image_id
      OR (
        di.linked_image_id IS NULL
        AND (
          (target.original_bucket = di.storage_bucket AND target.original_key = di.storage_path)
          OR (target.storage_bucket = di.storage_bucket AND target.storage_path = di.storage_path)
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.images child WHERE child.parent_image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_collaborators sc WHERE sc.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_collaborator_invites sci WHERE sci.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_contributors sc WHERE sc.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.submission_edit_history seh WHERE seh.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_events ce WHERE ce.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_bounties cb WHERE cb.image_id = p_image_id
  ) OR EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.target_type = 'image' AND c.target_id = p_image_id
  );
$$;

CREATE OR REPLACE FUNCTION public.delete_empty_crag(
  target_crag_id uuid,
  grace_period interval DEFAULT interval '1 hour'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  crag_row public.crags%ROWTYPE;
  deleted_count integer;
BEGIN
  IF target_crag_id IS NULL OR grace_period IS NULL OR grace_period < interval '0 seconds' THEN
    RETURN false;
  END IF;

  SELECT * INTO crag_row
  FROM public.crags c
  WHERE c.id = target_crag_id
  FOR UPDATE;
  IF NOT FOUND OR crag_row.created_at >= now() - grace_period THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.places p
  WHERE p.id = target_crag_id AND p.type = 'crag'
  FOR UPDATE;

  LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.images i WHERE i.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.submission_drafts sd WHERE sd.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_images ci WHERE ci.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.sectors s WHERE s.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_reports cr WHERE cr.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.crag_location_tags clt WHERE clt.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.saved_crags sc WHERE sc.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.crag_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.crag_id = target_crag_id)
    OR EXISTS (
      SELECT 1 FROM public.comments co
      WHERE co.target_type = 'crag' AND co.target_id = target_crag_id
    )
    OR EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.images i WHERE i.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.community_place_follows cpf WHERE cpf.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_floor_plans gfp WHERE gfp.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_memberships gm WHERE gm.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.gym_routes gr WHERE gr.gym_place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.place_id = target_crag_id)
    OR EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.place_id = target_crag_id)
    OR EXISTS (
      SELECT 1 FROM public.user_place_contributor_scores upcs
      WHERE upcs.place_id = target_crag_id
    ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.crags c
  WHERE c.id = target_crag_id
    AND c.created_at < now() - grace_period
    AND NOT EXISTS (SELECT 1 FROM public.images i WHERE i.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.submission_drafts sd WHERE sd.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_images ci WHERE ci.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_reports cr WHERE cr.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.crag_location_tags clt WHERE clt.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.saved_crags sc WHERE sc.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.crag_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.crag_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.comments co
      WHERE co.target_type = 'crag' AND co.target_id = c.id
    )
    AND NOT EXISTS (SELECT 1 FROM public.climbs cl WHERE cl.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.images i WHERE i.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.community_place_follows cpf WHERE cpf.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_floor_plans gfp WHERE gfp.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_memberships gm WHERE gm.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.gym_routes gr WHERE gr.gym_place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_events ce WHERE ce.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_bounties cb WHERE cb.place_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_place_contributor_scores upcs WHERE upcs.place_id = c.id);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count = 1 THEN
    DELETE FROM public.places WHERE id = target_crag_id AND type = 'crag';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

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

DROP TABLE public.climb_flags;
