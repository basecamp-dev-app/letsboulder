-- Ensure one profile row per auth user and enforce uniqueness on profiles.id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
  ) THEN
    WITH ranked_profiles AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY id
          ORDER BY updated_at DESC NULLS LAST, ctid DESC
        ) AS row_num
      FROM public.profiles
    )
    DELETE FROM public.profiles p
    USING ranked_profiles r
    WHERE p.ctid = r.ctid
      AND r.row_num > 1;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_key ON public.profiles USING btree (id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND indexname = 'profiles_id_key'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY USING INDEX profiles_id_key;
  END IF;
END $$;
