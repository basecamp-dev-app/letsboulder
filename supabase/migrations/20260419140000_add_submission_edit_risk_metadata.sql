ALTER TABLE public.submission_edit_history
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'safe',
  ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS risk_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS field_targets text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.submission_edit_history
  DROP CONSTRAINT IF EXISTS submission_edit_history_risk_level_check;

ALTER TABLE public.submission_edit_history
  ADD CONSTRAINT submission_edit_history_risk_level_check
  CHECK (risk_level IN ('safe', 'suspicious', 'high_risk'));

ALTER TABLE public.submission_edit_history
  DROP CONSTRAINT IF EXISTS submission_edit_history_moderation_state_check;

ALTER TABLE public.submission_edit_history
  ADD CONSTRAINT submission_edit_history_moderation_state_check
  CHECK (moderation_state IN ('accepted', 'flagged', 'blocked'));

CREATE OR REPLACE FUNCTION public.log_submission_edit(
  p_image_id uuid,
  p_edited_by uuid,
  p_edit_kind text,
  p_summary text,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_risk_level text DEFAULT 'safe',
  p_moderation_state text DEFAULT 'accepted',
  p_risk_reasons text[] DEFAULT ARRAY[]::text[],
  p_field_targets text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_risk_level text := COALESCE(p_risk_level, 'safe');
  v_moderation_state text := COALESCE(p_moderation_state, 'accepted');
BEGIN
  IF p_image_id IS NULL OR p_edited_by IS NULL OR p_edit_kind IS NULL OR btrim(COALESCE(p_summary, '')) = '' THEN
    RETURN;
  END IF;

  IF v_risk_level NOT IN ('safe', 'suspicious', 'high_risk') THEN
    v_risk_level := 'safe';
  END IF;

  IF v_moderation_state NOT IN ('accepted', 'flagged', 'blocked') THEN
    v_moderation_state := 'accepted';
  END IF;

  INSERT INTO public.submission_edit_history (
    image_id,
    edited_by,
    edit_kind,
    summary,
    before_data,
    after_data,
    risk_level,
    moderation_state,
    risk_reasons,
    field_targets
  )
  VALUES (
    p_image_id,
    p_edited_by,
    p_edit_kind,
    btrim(p_summary),
    p_before_data,
    p_after_data,
    v_risk_level,
    v_moderation_state,
    COALESCE(p_risk_reasons, ARRAY[]::text[]),
    COALESCE(p_field_targets, ARRAY[]::text[])
  );

  PERFORM public.record_submission_contribution(p_image_id, p_edited_by);
END;
$$;

GRANT ALL ON FUNCTION public.log_submission_edit(uuid, uuid, text, text, jsonb, jsonb, text, text, text[], text[]) TO authenticated;
GRANT ALL ON FUNCTION public.log_submission_edit(uuid, uuid, text, text, jsonb, jsonb, text, text, text[], text[]) TO service_role;
