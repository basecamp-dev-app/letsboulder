-- Migration: Harden submission RLS policies
-- Date: 2026-04-02
-- Purpose: Add missing DELETE policy for submission_draft_images and
--          explicit INSERT policy for submission_drafts for defense-in-depth.
-- Context: Issue #10 - RLS/security review of submission and collaboration flows

-- 1. Add DELETE policy for submission_draft_images
-- Only owners can delete draft images, and only while the draft is still in 'draft' status.
-- Collaborators cannot delete images (they can only edit via RPC functions).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_draft_images'
      AND policyname = 'Owner delete submission_draft_images'
  ) THEN
    CREATE POLICY "Owner delete submission_draft_images"
      ON public.submission_draft_images
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.submission_drafts d
          WHERE d.id = submission_draft_images.draft_id
            AND d.status = 'draft'
            AND d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 2. Add explicit INSERT policy for submission_drafts
-- Drafts are created via RPC functions (SECURITY INVOKER) that perform their own
-- auth checks. This policy documents the intent and provides defense-in-depth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'submission_drafts'
      AND policyname = 'Users create own submission_drafts'
  ) THEN
    CREATE POLICY "Users create own submission_drafts"
      ON public.submission_drafts
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Verify submission_draft_routes policies are complete
-- The table uses FOR ALL (INSERT/UPDATE/DELETE) gated by draft status + ownership/collaboration.
-- This is correct and needs no changes, but we add a comment for auditability.
COMMENT ON TABLE public.submission_draft_routes IS
  'Durable per-image draft routes. RLS: FOR ALL gated by draft status + owner/collaborator check.';
