WITH published_draft_climbs AS (
  SELECT
    submission_drafts.id AS draft_id,
    (climb_id_text.value)::UUID AS climb_id
  FROM public.submission_drafts
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(submission_drafts.metadata->'publishedClimbIds', '[]'::JSONB)) AS climb_id_text(value)
  WHERE submission_drafts.status = 'submitted'
), duplicate_groups AS (
  SELECT
    published_draft_climbs.draft_id,
    climbs.id AS climb_id,
    lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g')) AS normalized_name,
    (MIN(climbs.id::TEXT) OVER (
      PARTITION BY published_draft_climbs.draft_id,
      lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g'))
    ))::UUID AS canonical_climb_id,
    COUNT(*) OVER (
      PARTITION BY published_draft_climbs.draft_id,
      lower(regexp_replace(btrim(COALESCE(climbs.name, '')), '\s+', ' ', 'g'))
    ) AS duplicate_count
  FROM published_draft_climbs
  JOIN public.climbs
    ON climbs.id = published_draft_climbs.climb_id
), repair_targets AS (
  SELECT
    draft_id,
    climb_id,
    canonical_climb_id
  FROM duplicate_groups
  WHERE duplicate_count > 1
)
UPDATE public.climbs
SET shared_climb_id = repair_targets.canonical_climb_id
FROM repair_targets
WHERE climbs.id = repair_targets.climb_id
  AND COALESCE(climbs.shared_climb_id, climbs.id) <> repair_targets.canonical_climb_id;

DELETE FROM public.grade_votes grade_votes_to_remove
USING public.climbs alias_climb,
      public.grade_votes canonical_grade_vote
WHERE grade_votes_to_remove.climb_id = alias_climb.id
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_grade_vote.climb_id = alias_climb.shared_climb_id
  AND canonical_grade_vote.user_id = grade_votes_to_remove.user_id;

UPDATE public.grade_votes
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE grade_votes.climb_id = climbs.id
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;

DELETE FROM public.user_climbs user_climbs_to_remove
USING public.climbs alias_climb,
      public.user_climbs canonical_user_climb
WHERE user_climbs_to_remove.climb_id = alias_climb.id
  AND alias_climb.shared_climb_id IS NOT NULL
  AND alias_climb.shared_climb_id <> alias_climb.id
  AND canonical_user_climb.climb_id = alias_climb.shared_climb_id
  AND canonical_user_climb.user_id = user_climbs_to_remove.user_id;

UPDATE public.user_climbs
SET climb_id = climbs.shared_climb_id
FROM public.climbs
WHERE user_climbs.climb_id = climbs.id
  AND climbs.shared_climb_id IS NOT NULL
  AND climbs.shared_climb_id <> climbs.id;
