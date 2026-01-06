-- Enable RLS on logs table
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Create policy: users can delete their own logs
CREATE POLICY "Users can delete their own logs" ON public.logs
FOR DELETE
TO authenticated
USING ((auth.uid()) = user_id);

-- Add gender column (nullable)
ALTER TABLE public.profiles
  ADD COLUMN gender text;

-- Add check constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (
    gender IS NULL
    OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')
  );

-- Backfill existing users to 'male'
UPDATE public.profiles
SET gender = 'male'
WHERE gender IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_gender
  ON public.profiles(gender);

CREATE INDEX IF NOT EXISTS idx_logs_user_id
  ON public.logs(user_id);

CREATE INDEX IF NOT EXISTS idx_logs_created_at
  ON public.logs(created_at);

-- Create RPC function for leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  gender_filter text,
  limit_rows int,
  offset_rows int
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  avg_points numeric,
  climb_count bigint
)
LANGUAGE sql
AS $$
WITH user_stats AS (
  SELECT
    l.user_id,
    AVG(CASE WHEN l.status = 'flash' THEN c.points + 10 ELSE c.points END) AS avg_points,
    COUNT(*) AS climb_count
  FROM public.logs l
  JOIN public.climbs c ON c.id = l.climb_id
  WHERE l.created_at >= NOW() - INTERVAL '60 days'
  GROUP BY l.user_id
)
SELECT
  p.id,
  p.username,
  p.avatar_url,
  us.avg_points,
  us.climb_count::bigint
FROM user_stats us
JOIN public.profiles p ON p.id = us.user_id
WHERE gender_filter IS NULL OR p.gender = gender_filter
ORDER BY us.avg_points DESC NULLS LAST
LIMIT limit_rows OFFSET offset_rows;
$$;
