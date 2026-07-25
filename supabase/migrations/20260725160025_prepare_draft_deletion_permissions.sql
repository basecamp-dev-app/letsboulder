DO $migration$
BEGIN
  EXECUTE 'CREATE OR REPLACE FUNCTION public.delete_submission_draft_atomic(uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS ''SELECT jsonb_build_object(''''success'''', false)''';
  EXECUTE 'CREATE OR REPLACE FUNCTION public.delete_submission_draft_image_atomic(uuid, uuid, timestamptz) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS ''SELECT jsonb_build_object(''''success'''', false)''';
  EXECUTE 'REVOKE ALL ON FUNCTION public.delete_submission_draft_atomic(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.delete_submission_draft_image_atomic(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated';
END;
$migration$;
