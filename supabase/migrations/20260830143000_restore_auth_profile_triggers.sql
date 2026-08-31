-- Restore the production auth lifecycle triggers that provision and synchronize
-- public profiles. Auth-schema triggers are not reliably captured by schema dumps,
-- so hosted staging had the functions without the production trigger bindings.

BEGIN;

DO $migration$
DECLARE
  trigger_row record;
BEGIN
  SELECT t.tgtype::integer, t.tgfoid
  INTO trigger_row
  FROM pg_trigger AS t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'on_auth_user_created'
    AND NOT t.tgisinternal;

  IF NOT FOUND THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  ELSIF trigger_row.tgtype <> 5
     OR trigger_row.tgfoid <> 'public.handle_new_user()'::regprocedure THEN
    RAISE EXCEPTION 'on_auth_user_created has an unexpected definition'
      USING ERRCODE = '55000';
  END IF;

  SELECT t.tgtype::integer, t.tgfoid
  INTO trigger_row
  FROM pg_trigger AS t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'on_auth_user_login'
    AND NOT t.tgisinternal;

  IF NOT FOUND THEN
    CREATE TRIGGER on_auth_user_login
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_profile_on_login();
  ELSIF trigger_row.tgtype <> 17
     OR trigger_row.tgfoid <> 'public.sync_profile_on_login()'::regprocedure THEN
    RAISE EXCEPTION 'on_auth_user_login has an unexpected definition'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    t.tgtype::integer,
    t.tgfoid,
    position(
      'old.raw_user_meta_data is distinct from new.raw_user_meta_data'
      IN replace(lower(pg_get_triggerdef(t.oid)), '"', '')
    ) > 0 AS has_expected_condition
  INTO trigger_row
  FROM pg_trigger AS t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'on_auth_user_updated'
    AND NOT t.tgisinternal;

  IF NOT FOUND THEN
    CREATE TRIGGER on_auth_user_updated
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
      EXECUTE FUNCTION public.handle_user_metadata_update();
  ELSIF trigger_row.tgtype <> 17
     OR trigger_row.tgfoid <> 'public.handle_user_metadata_update()'::regprocedure
     OR trigger_row.has_expected_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'on_auth_user_updated has an unexpected definition'
      USING ERRCODE = '55000';
  END IF;
END
$migration$;

-- Keep the diagnostic and write set stable while hosted migrations run alongside
-- authentication traffic. The explicit transaction makes trigger restoration and
-- backfill atomic under both local and hosted Supabase migration runners.
LOCK TABLE auth.users, public.profiles IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  conflicting_email_count bigint;
  duplicate_auth_email_count bigint;
  inserted_profile_count bigint;
  missing_profile_count bigint;
  null_email_count bigint;
BEGIN
  SELECT count(*)
  INTO missing_profile_count
  FROM auth.users AS u
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = u.id);

  SELECT count(*)
  INTO null_email_count
  FROM auth.users AS u
  WHERE u.email IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = u.id);

  SELECT count(*)
  INTO duplicate_auth_email_count
  FROM (
    SELECT u.email
    FROM auth.users AS u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = u.id)
    GROUP BY u.email
    HAVING count(*) > 1
  ) AS duplicate_emails;

  SELECT count(*)
  INTO conflicting_email_count
  FROM auth.users AS u
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles AS own_profile WHERE own_profile.id = u.id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS email_profile
      WHERE email_profile.email = u.email
        AND email_profile.id <> u.id
    );

  IF duplicate_auth_email_count > 0 OR conflicting_email_count > 0 THEN
    RAISE EXCEPTION
      'Auth profile reconciliation blocked: % duplicate auth emails, % conflicting profile emails',
      duplicate_auth_email_count,
      conflicting_email_count
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.profiles (id, email, is_admin)
  SELECT u.id, u.email, false
  FROM auth.users AS u
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = u.id)
  ORDER BY u.id;

  GET DIAGNOSTICS inserted_profile_count = ROW_COUNT;

  RAISE NOTICE
    'Auth profile reconciliation: % eligible, % inserted, % null-email users skipped',
    missing_profile_count,
    inserted_profile_count,
    null_email_count;
END
$migration$;

COMMIT;
