ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contribution_credit_platform TEXT,
  ADD COLUMN IF NOT EXISTS contribution_credit_handle TEXT;

CREATE OR REPLACE FUNCTION public.update_own_profile_submission_credit(
  p_platform TEXT,
  p_handle TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id UUID := auth.uid();
  normalized_platform TEXT;
  normalized_handle TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  normalized_handle := NULLIF(btrim(COALESCE(p_handle, '')), '');

  IF normalized_handle IS NULL THEN
    normalized_platform := NULL;
  ELSE
    normalized_handle := regexp_replace(normalized_handle, '^@+', '');

    IF char_length(normalized_handle) > 50 THEN
      RAISE EXCEPTION 'Handle must be 50 characters or less';
    END IF;

    IF normalized_handle !~ '^[A-Za-z0-9._-]+$' THEN
      RAISE EXCEPTION 'Handle can only include letters, numbers, periods, underscores, and hyphens';
    END IF;

    normalized_platform := lower(NULLIF(btrim(COALESCE(p_platform, '')), ''));

    IF normalized_platform IS NULL THEN
      RAISE EXCEPTION 'Platform is required when a handle is provided';
    END IF;

    IF normalized_platform NOT IN ('instagram', 'tiktok', 'youtube', 'x', 'other') THEN
      RAISE EXCEPTION 'Invalid platform';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    contribution_credit_platform = normalized_platform,
    contribution_credit_handle = normalized_handle,
    updated_at = NOW()
  WHERE id = current_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, contribution_credit_platform, contribution_credit_handle)
    VALUES (current_user_id, normalized_platform, normalized_handle);
  END IF;

  RETURN jsonb_build_object(
    'platform', normalized_platform,
    'handle', normalized_handle
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile_submission_credit(TEXT, TEXT) TO service_role;
