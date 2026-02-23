CREATE TABLE IF NOT EXISTS public.gym_owner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_name TEXT NOT NULL CHECK (char_length(gym_name) BETWEEN 1 AND 200),
  address TEXT NOT NULL CHECK (char_length(address) BETWEEN 1 AND 300),
  facilities TEXT[] NOT NULL,
  contact_phone TEXT NOT NULL CHECK (char_length(contact_phone) BETWEEN 1 AND 40),
  contact_email TEXT NOT NULL CHECK (char_length(contact_email) BETWEEN 3 AND 160),
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'head_setter')),
  additional_comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gym_owner_applications_facilities_not_empty CHECK (cardinality(facilities) >= 1),
  CONSTRAINT gym_owner_applications_facilities_valid CHECK (facilities <@ ARRAY['sport', 'boulder']::TEXT[])
);

CREATE INDEX IF NOT EXISTS idx_gym_owner_applications_status_created
  ON public.gym_owner_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gym_owner_applications_created
  ON public.gym_owner_applications(created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.gym_owner_applications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

GRANT INSERT ON TABLE public.gym_owner_applications TO anon;
GRANT INSERT ON TABLE public.gym_owner_applications TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.gym_owner_applications TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Public create gym owner applications'
  ) THEN
    CREATE POLICY "Public create gym owner applications"
      ON public.gym_owner_applications
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Admin read gym owner applications'
  ) THEN
    CREATE POLICY "Admin read gym owner applications"
      ON public.gym_owner_applications
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gym_owner_applications'
      AND policyname = 'Admin update gym owner applications'
  ) THEN
    CREATE POLICY "Admin update gym owner applications"
      ON public.gym_owner_applications
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;
