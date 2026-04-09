WITH target_groups AS (
  SELECT
    crag_id,
    lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')) AS normalized_name,
    (MIN(id::TEXT))::UUID AS canonical_climb_id
  FROM public.climbs
  WHERE crag_id = '96c9ab2d-1bc3-4af1-b1e7-6757eb8f43f2'
    AND deleted_at IS NULL
    AND COALESCE(btrim(name), '') <> ''
  GROUP BY crag_id, lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g'))
  HAVING COUNT(*) > 1
), climb_updates AS (
  SELECT
    climbs.id AS climb_id,
    target_groups.canonical_climb_id
  FROM public.climbs
  JOIN target_groups
    ON target_groups.crag_id = climbs.crag_id
   AND target_groups.normalized_name = lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g'))
)
UPDATE public.climbs
SET shared_climb_id = climb_updates.canonical_climb_id
FROM climb_updates
WHERE climbs.id = climb_updates.climb_id;

DELETE FROM public.grade_votes grade_votes_to_remove
USING public.climbs alias_climb,
      public.grade_votes canonical_grade_vote
WHERE grade_votes_to_remove.climb_id = alias_climb.id
  AND alias_climb.crag_id = '96c9ab2d-1bc3-4af1-b1e7-6757eb8f43f2'
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_grade_vote.climb_id = alias_climb.shared_climb_id
  AND canonical_grade_vote.user_id = grade_votes_to_remove.user_id;

UPDATE public.grade_votes
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE grade_votes.climb_id = climbs.id
  AND climbs.crag_id = '96c9ab2d-1bc3-4af1-b1e7-6757eb8f43f2'
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;

DELETE FROM public.user_climbs user_climbs_to_remove
USING public.climbs alias_climb,
      public.user_climbs canonical_user_climb
WHERE user_climbs_to_remove.climb_id = alias_climb.id
  AND alias_climb.crag_id = '96c9ab2d-1bc3-4af1-b1e7-6757eb8f43f2'
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_user_climb.climb_id = alias_climb.shared_climb_id
  AND canonical_user_climb.user_id = user_climbs_to_remove.user_id;

UPDATE public.user_climbs
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE user_climbs.climb_id = climbs.id
  AND climbs.crag_id = '96c9ab2d-1bc3-4af1-b1e7-6757eb8f43f2'
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;
