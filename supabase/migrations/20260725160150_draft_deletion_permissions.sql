DO $migration$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.delete_submission_draft_atomic(uuid) FROM PUBLIC, anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.delete_submission_draft_image_atomic(uuid, uuid, timestamptz) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_submission_draft_atomic(uuid) TO authenticated, service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_submission_draft_image_atomic(uuid, uuid, timestamptz) TO authenticated, service_role';

  EXECUTE 'DROP POLICY IF EXISTS "Owner can delete own images" ON public.images';
  EXECUTE 'DROP POLICY IF EXISTS "Owner or collaborator update draft submission_drafts" ON public.submission_drafts';
  EXECUTE 'CREATE POLICY "Owner or collaborator update draft submission_drafts" ON public.submission_drafts FOR UPDATE USING (status = ''draft'' AND (auth.uid() = user_id OR public.is_submission_draft_collaborator(id, auth.uid()))) WITH CHECK (status = ''draft'' AND (auth.uid() = user_id OR public.is_submission_draft_collaborator(id, auth.uid())))';
  EXECUTE 'DROP POLICY IF EXISTS "Users delete own submission_drafts" ON public.submission_drafts';
  EXECUTE 'DROP POLICY IF EXISTS "Users delete own draft submission_drafts" ON public.submission_drafts';

  EXECUTE 'DROP POLICY IF EXISTS "Owner delete submission_draft_images" ON public.submission_draft_images';
  EXECUTE 'DROP POLICY IF EXISTS "Users delete own submission_draft_images" ON public.submission_draft_images';
  EXECUTE 'DROP POLICY IF EXISTS "Owner delete draft submission_draft_images" ON public.submission_draft_images';
END;
$migration$;
