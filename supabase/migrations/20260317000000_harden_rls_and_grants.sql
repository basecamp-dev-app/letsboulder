-- Hardening pass: tighten grants and ownership checks.

DO $$
BEGIN
  IF to_regclass('public.deletion_requests') IS NOT NULL THEN
    ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE public.deletion_requests FROM anon;
    REVOKE ALL ON TABLE public.deletion_requests FROM authenticated;

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deletion_requests TO authenticated;
    GRANT ALL ON TABLE public.deletion_requests TO service_role;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deletion_requests'
        AND policyname = 'Users manage own deletion requests'
    ) THEN
      DROP POLICY "Users manage own deletion requests" ON public.deletion_requests;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deletion_requests'
        AND policyname = 'Service role manage deletion requests'
    ) THEN
      DROP POLICY "Service role manage deletion requests" ON public.deletion_requests;
    END IF;

    CREATE POLICY "Users manage own deletion requests"
      ON public.deletion_requests
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Service role manage deletion requests"
      ON public.deletion_requests
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_verifications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_verifications'
        AND policyname = 'Authenticated create verification'
    ) THEN
      DROP POLICY "Authenticated create verification" ON public.climb_verifications;
    END IF;

    CREATE POLICY "Authenticated create verification"
      ON public.climb_verifications
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.grade_votes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'grade_votes'
        AND policyname = 'Authenticated create grade vote'
    ) THEN
      DROP POLICY "Authenticated create grade vote" ON public.grade_votes;
    END IF;

    CREATE POLICY "Authenticated create grade vote"
      ON public.grade_votes
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_corrections') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_corrections'
        AND policyname = 'Authenticated create correction'
    ) THEN
      DROP POLICY "Authenticated create correction" ON public.climb_corrections;
    END IF;

    CREATE POLICY "Authenticated create correction"
      ON public.climb_corrections
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.correction_votes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'correction_votes'
        AND policyname = 'Authenticated create correction vote'
    ) THEN
      DROP POLICY "Authenticated create correction vote" ON public.correction_votes;
    END IF;

    CREATE POLICY "Authenticated create correction vote"
      ON public.correction_votes
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.route_grades') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'route_grades'
        AND policyname = 'Authenticated create route grade'
    ) THEN
      DROP POLICY "Authenticated create route grade" ON public.route_grades;
    END IF;

    CREATE POLICY "Authenticated create route grade"
      ON public.route_grades
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.climb_flags') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'climb_flags'
        AND policyname = 'Authenticated create climb_flags'
    ) THEN
      DROP POLICY "Authenticated create climb_flags" ON public.climb_flags;
    END IF;

    CREATE POLICY "Authenticated create climb_flags"
      ON public.climb_flags
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = flagger_id);
  END IF;
END $$;
