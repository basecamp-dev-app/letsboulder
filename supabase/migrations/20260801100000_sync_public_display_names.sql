-- display_name is the public name contract. Keep private first/last-name
-- columns out of API reads while ensuring existing and future profiles have a
-- public label when those private fields are populated.
UPDATE public.profiles
SET display_name = NULLIF(
  btrim(concat_ws(' ', NULLIF(btrim(first_name), ''), NULLIF(btrim(last_name), ''))),
  ''
)
WHERE NULLIF(btrim(display_name), '') IS NULL
  AND NULLIF(
    btrim(concat_ws(' ', NULLIF(btrim(first_name), ''), NULLIF(btrim(last_name), ''))),
    ''
  ) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_display_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  canonical_name text;
BEGIN
  canonical_name := NULLIF(
    btrim(concat_ws(' ', NULLIF(btrim(NEW.first_name), ''), NULLIF(btrim(NEW.last_name), ''))),
    ''
  );

  IF canonical_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(NEW.display_name), '') IS NULL THEN
    NEW.display_name := canonical_name;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.last_name IS DISTINCT FROM OLD.last_name
    THEN
      NEW.display_name := canonical_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_display_name ON public.profiles;
CREATE TRIGGER profiles_sync_display_name
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_display_name();

REVOKE ALL ON FUNCTION public.sync_profile_display_name()
  FROM PUBLIC, anon, authenticated, service_role;
