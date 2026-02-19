-- Replace image comment categories with positive topo note buckets.

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_category_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_category_check
  CHECK (
    category IN (
      'access',
      'approach',
      'parking',
      'closure',
      'general',
      'beta',
      'fa_history',
      'safety',
      'gear_protection',
      'conditions',
      'approach_access',
      'descent',
      'rock_quality',
      'highlights',
      'variations',
      'topo_error',
      'line_request',
      'photo_outdated',
      'other_topo',
      'broken_hold',
      'grade',
      'history'
    )
  );
