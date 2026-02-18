-- Fix comment soft-delete RLS and address Security Advisor RLS findings.

-- ---------------------------------------------------------------------
-- comments: allow author soft-delete transition (deleted_at NULL -> NOT NULL)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comments'
      AND policyname = 'Author soft delete comments'
  ) THEN
    DROP POLICY "Author soft delete comments" ON public.comments;
  END IF;

  CREATE POLICY "Author soft delete comments"
    ON public.comments
    FOR UPDATE
    USING (auth.uid() = author_id AND deleted_at IS NULL)
    WITH CHECK (auth.uid() = author_id AND deleted_at IS NOT NULL);
END $$;

-- ---------------------------------------------------------------------
-- product_clicks: enable RLS and keep public read + public click increment
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.product_clicks') IS NOT NULL THEN
    ALTER TABLE public.product_clicks ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'product_clicks'
        AND policyname = 'Public read product clicks'
    ) THEN
      DROP POLICY "Public read product clicks" ON public.product_clicks;
    END IF;

    CREATE POLICY "Public read product clicks"
      ON public.product_clicks
      FOR SELECT
      USING (true);

    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.product_clicks FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.product_clicks FROM authenticated;

    GRANT SELECT ON TABLE public.product_clicks TO anon;
    GRANT SELECT ON TABLE public.product_clicks TO authenticated;

    CREATE OR REPLACE FUNCTION public.increment_gear_click(product_id_input text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    BEGIN
      INSERT INTO public.product_clicks (product_id, click_count, updated_at)
      VALUES (product_id_input, 1, NOW())
      ON CONFLICT (product_id)
      DO UPDATE SET
        click_count = public.product_clicks.click_count + 1,
        updated_at = NOW();
    END;
    $func$;

    REVOKE ALL ON FUNCTION public.increment_gear_click(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO anon;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_gear_click(text) TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- deleted_accounts: enable RLS and lock down to service_role only
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.deleted_accounts') IS NOT NULL THEN
    ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'deleted_accounts'
        AND policyname = 'Service role manage deleted accounts'
    ) THEN
      DROP POLICY "Service role manage deleted accounts" ON public.deleted_accounts;
    END IF;

    CREATE POLICY "Service role manage deleted accounts"
      ON public.deleted_accounts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.deleted_accounts FROM anon;
    REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.deleted_accounts FROM authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- spatial_ref_sys: enable RLS with public read policy (PostGIS reference)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping RLS enable on public.spatial_ref_sys (insufficient privilege)';
        RETURN;
    END;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'spatial_ref_sys'
        AND policyname = 'Public read spatial_ref_sys'
    ) THEN
      DROP POLICY "Public read spatial_ref_sys" ON public.spatial_ref_sys;
    END IF;

    CREATE POLICY "Public read spatial_ref_sys"
      ON public.spatial_ref_sys
      FOR SELECT
      USING (true);
  END IF;
END $$;
