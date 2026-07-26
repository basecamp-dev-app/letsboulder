# Submission Workflow

The current `/submit` path creates a private, image-first draft and publishes it directly to the guide. It is not the older pending-review route form.

## Entry And Boundaries

1. [`app/submit/page.tsx`](../app/submit/page.tsx) is a Server Component. It authenticates, preserves only a non-empty scalar `cragId`, and renders the client-only [`DraftIntakeClient`](../features/submissions/components/DraftIntakeClient.tsx). `/submit` does not consume route, sector, draft, or publication-result parameters.
2. [`DraftIntakeView`](../features/submissions/components/DraftIntakeView.tsx) owns intake state. Its first file selection calls the [`createSubmissionDraftAction`](../features/submissions/actions/manage-submissions.ts) Server Action with no images and the optional `cragId`; later browser work uses Route Handlers through `csrfFetch`.
3. Some callers still generate ignored parameters. In particular, [`LogbookClient`](../app/%28shell%29/logbook/LogbookClient.tsx) redirects to `/submit?draft=...&publishedFaces=...&publishedRoutes=...`; the page ignores all three. This documents the current mismatch, not desired behavior.

## Upload And Edit Flow

1. [`ImagePicker`](../features/submissions/components/ImagePicker.tsx) accepts up to 20 image/HEIC files per selection. [`useMediaUploadQueueController`](../features/media-upload/hooks/use-media-upload-queue-controller.ts) preprocesses one transfer at a time, extracts GPS, creates an upload session, uploads directly to its signed R2 URL, completes the session, and polls processing status.
2. A draft upload is attached after session completion through `POST /api/submissions/drafts/[id]/images`. Attach uses `expected_updated_at` and retries one `draft_conflict`; media processing may continue after the transfer slot is released. Publication remains blocked until linked media is publicly deliverable.
3. [`useEditDraftRouteStoreSync`](../features/draft-editor/hooks/use-edit-draft-route-store-sync.ts) mirrors the active image between the route-editor store and per-image draft state and marks changed images dirty. It does not persist routes by itself.
4. [`useEditDraftActions`](../features/draft-editor/hooks/use-edit-draft-actions.ts) performs an explicit Save: dirty images are bulk-synced to `submission_draft_routes`, then image order and metadata are patched with `expected_updated_at`. Route editing is therefore explicit-save, not debounced autosave.
5. [`useEditDraftLocationSync`](../features/draft-editor/hooks/use-edit-draft-location-sync.ts) is separate: shared location/crag metadata is patched after a 400 ms debounce and is flushed before publication. Custom per-image coordinates remain in the explicit metadata save payload.

## Conflicts And Collaboration

- Draft owners and accepted collaborators can read and edit drafts. Invite listing, creation, revocation, and collaborator removal use Server Actions in [`collaboration-actions.ts`](../features/submissions/actions/collaboration-actions.ts); invite claims use the redirect endpoint below.
- Metadata patches, image append/delete, and image ordering use optimistic concurrency via `submission_drafts.updated_at`. A collaborator conflict produces `draft_conflict`; a same-user metadata conflict is retried once, while a different-user conflict asks the editor to reload.
- Route bulk sync is image-scoped last-write-wins and has no `expected_updated_at`. The explicit save then crosses the draft-level metadata conflict boundary. Upload attachment has its own one-retry conflict loop.
- Only `submission_drafts.user_id` may publish or delete the draft. Collaborators may edit but cannot publish.
- Published submissions use authenticated wiki editing governed by `user_can_wiki_edit_submission`. The helper requires its user argument to equal `auth.uid()`, and both `log_submission_edit` overloads reject authenticated attempts to attribute history to another user. Successful non-owner edits are attributed in `submission_contributors` and logged in `submission_edit_history`; route deletion remains disabled.

## Publication

[`publishDraft`](../features/draft-editor/hooks/use-edit-draft-actions.ts) requires finished uploads, a crag, and valid location; it flushes location, forces an explicit save, then calls `POST /api/submissions/drafts/[id]/publish`. [`promoteDraftToSubmission`](../features/submissions/server/drafts/draft-promote.ts) repeats owner/readiness/location checks and invokes `promote_draft_to_submission` atomically.

Publication is direct: there is no pending-review step. The RPC reuses the processed image rows, creates `climbs` with `status = 'approved'`, creates route lines for durable draft routes, and permits image-only submissions. The draft becomes `submitted` and stores its published IDs for idempotent retries.

Contribution scoring is a server-only post-publication/edit effect. The server reloads authoritative image, edit-history, correction, or verification rows to derive the beneficiary and fixed score before invoking service-only contribution and missing-topo bounty writers; request-supplied identities and score context are not trusted.

`sectorId` is currently selected by [`SectorSelector`](../features/submissions/components/SectorSelector.tsx) and saved under draft metadata by [`useEditDraftActions`](../features/draft-editor/hooks/use-edit-draft-actions.ts), but the current promotion RPC does not copy it to `climbs.sector_id` or `crag_images.sector_id`. Do not rely on sector selection surviving publication until that gap is fixed.

## Active Interfaces

- Server Actions: draft create/publish/delete in [`manage-submissions.ts`](../features/submissions/actions/manage-submissions.ts), and collaborator management in [`collaboration-actions.ts`](../features/submissions/actions/collaboration-actions.ts).
- `GET|PATCH|DELETE /api/submissions/drafts/[id]`: hydrate, optimistic metadata/image-order save, or delete.
- `POST /api/submissions/drafts/[id]/images` and `DELETE /api/submissions/drafts/[id]/images/[imageId]`: attach or remove draft images with conflict tokens.
- `POST /api/submissions/drafts/[id]/routes`: single-image or batched durable route replacement.
- `POST /api/submissions/drafts/[id]/publish`: owner-only promotion.
- `GET /api/submissions/drafts/collaborate/[token]`: authenticate and claim a draft invite.
- `POST /api/media/upload-sessions`, `POST /api/media/upload-sessions/[imageId]/complete`, and `GET|DELETE /api/media/upload-sessions/[imageId]`: create, complete, poll, or discard an upload session. The signed URL itself targets R2 directly.
- `GET|POST /api/crags/[id]/sectors`: list or create sectors for the UI.
- `GET|POST /api/submissions` and `GET|POST /api/routes/submit` still exist as separate published/legacy submission surfaces; neither creates the `/submit` draft.

Canonical control contracts are in [Submission Controls](ui/submission-controls.md).
