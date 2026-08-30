-- Restore the auth lifecycle triggers that provision and synchronize public profiles.
--
-- These functions are part of the baseline schema, but auth-schema triggers are not
-- reliably captured by schema dumps. Hosted staging therefore had the functions
-- without the triggers while production still had all three triggers installed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user()';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_login'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_login
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_profile_on_login()';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_updated'
      AND NOT t.tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_updated
      AFTER UPDATE ON auth.users
      FOR EACH ROW
      WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
      EXECUTE FUNCTION public.handle_user_metadata_update()';
  END IF;
END
$$;
