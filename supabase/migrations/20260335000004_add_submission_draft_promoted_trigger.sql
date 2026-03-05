DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_submission_draft_promoted_handoff'
  ) THEN
    CREATE TRIGGER trg_submission_draft_promoted_handoff
      AFTER UPDATE OF status ON public.submission_drafts
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_submission_draft_promoted();
  END IF;
END $$;
