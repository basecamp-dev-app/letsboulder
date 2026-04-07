CREATE OR REPLACE FUNCTION public.delete_account_atomic(
  p_user_id uuid,
  p_email text,
  p_delete_route_uploads boolean
)
RETURNS TABLE (
  deleted_profile boolean,
  deleted_route_upload_images integer,
  deleted_user_climbs integer,
  deleted_logs integer,
  nullified_images integer,
  deleted_images integer,
  nullified_climbs integer,
  deleted_climbs integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_profile_count integer := 0;
  v_deleted_route_upload_images_count integer := 0;
  v_deleted_user_climbs_count integer := 0;
  v_deleted_logs_count integer := 0;
  v_nullified_images_count integer := 0;
  v_deleted_images_count integer := 0;
  v_nullified_climbs_count integer := 0;
  v_deleted_climbs_count integer := 0;
BEGIN
  INSERT INTO public.deleted_accounts (user_id, email, delete_route_uploads)
  VALUES (p_user_id, p_email, p_delete_route_uploads);

  DELETE FROM public.admin_actions WHERE user_id = p_user_id;
  DELETE FROM public.user_climbs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_user_climbs_count = ROW_COUNT;

  DELETE FROM public.climb_corrections WHERE user_id = p_user_id;
  DELETE FROM public.correction_votes WHERE user_id = p_user_id;
  DELETE FROM public.logs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_logs_count = ROW_COUNT;

  DELETE FROM public.climb_verifications WHERE user_id = p_user_id;
  DELETE FROM public.grade_votes WHERE user_id = p_user_id;
  DELETE FROM public.route_grades WHERE user_id = p_user_id;

  IF p_delete_route_uploads THEN
    DELETE FROM public.images WHERE created_by = p_user_id;
    GET DIAGNOSTICS v_deleted_images_count = ROW_COUNT;

    DELETE FROM public.climbs WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_deleted_climbs_count = ROW_COUNT;

    v_deleted_route_upload_images_count := v_deleted_images_count;
  ELSE
    UPDATE public.images
    SET created_by = NULL
    WHERE created_by = p_user_id;
    GET DIAGNOSTICS v_nullified_images_count = ROW_COUNT;

    UPDATE public.climbs
    SET user_id = NULL
    WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_nullified_climbs_count = ROW_COUNT;
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_deleted_profile_count = ROW_COUNT;

  IF v_deleted_profile_count <> 1 THEN
    RAISE EXCEPTION 'Expected to delete exactly one profile for user % but deleted %', p_user_id, v_deleted_profile_count;
  END IF;

  RETURN QUERY
  SELECT
    true,
    v_deleted_route_upload_images_count,
    v_deleted_user_climbs_count,
    v_deleted_logs_count,
    v_nullified_images_count,
    v_deleted_images_count,
    v_nullified_climbs_count,
    v_deleted_climbs_count;
END;
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.delete_account_atomic(uuid, text, boolean) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_account_atomic(uuid, text, boolean) TO service_role';
END $$;
