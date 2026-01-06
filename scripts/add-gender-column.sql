-- 1) Add nullable column (no default)
ALTER TABLE public.profiles ADD COLUMN gender text;

-- 2) Add check constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

-- 3) Backfill existing rows to 'male' (explicit)
UPDATE public.profiles SET gender = 'male' WHERE gender IS NULL;

-- 4) Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.logs(created_at);
