# Submission Workflow

The current `/submit` path creates a private, image-first draft and promotes its media and routes directly. Public discovery is still gated by the parent crag's `publication_status`; a newly created crag remains in `review` until a steward publishes it. It is not the older pending-review route form.

## Entry And Boundaries

1. [`app/submit/page.tsx`](../app/submit/page.tsx) is a Server Component. It authenticates, preserves only a non-empty scalar `cragId`, and renders the client-only [`DraftIntakeClient`](../features/submissions/components/DraftIntakeClient.tsx). `/submit` does not consume route, sector, draft, or publication-result parameters.
2. [`DraftIntakeView`](../features/submissions/components/DraftIntakeView.tsx) owns intake state. Its first file selection calls the [`createSubmissionDraftAction`](../features/submissions/actions/manage-submissions.ts) Server Action with no images and the optional `cragId`; later browser work uses Route Handlers through `csrfFetch`.
3. Some callers still generate ignored parameters. In particular, [`LogbookClient`](../app/%28shell%29/logbook/LogbookClient.tsx) redirects to `/submit?draft=...&publishedFaces=...&publishedRoutes=...`; the page ignores all three. This documents the current mismatch, not desired behavior.

## Upload And Edit Flow

1. [`ImagePicker`](../features/submissions/components/ImagePicker.tsx) accepts image/HEIC files up to a durable 20-file target limit. [`useMediaUploadQueueController`](../features/media-upload/hooks/use-media-upload-queue-controller.ts) stores each file in auth-scoped IndexedDB before preprocessing one transfer at a time, and reconciles stable server upload IDs after reload or reconnect.
2. A draft upload is attached after session completion through `POST /api/submissions/drafts/[id]/images`. Attach uses `expected_updated_at`, retries one `draft_conflict`, and atomically persists the caller-owned authoritative image ID only when its original or current storage locator matches. Media processing may continue after the transfer slot is released. Publication distinguishes active processing, terminal ingest failure, and a broken authoritative association; all remain fail-closed until linked media is publicly deliverable.
3. [`useEditDraftRouteStoreSync`](../features/draft-editor/hooks/use-edit-draft-route-store-sync.ts) mirrors the active image between the route-editor store and per-image draft state and marks changed images dirty. Unsaved route geometry and sector selection are checkpointed in auth-scoped IndexedDB and restored when the server revision is unchanged or was last edited by the same user.
4. [`useEditDraftActions`](../features/draft-editor/hooks/use-edit-draft-actions.ts) performs an explicit Save through one `save_submission_draft_atomic` transaction. The RPC validates the complete V2 metadata/image snapshot before mutation, checks `expected_updated_at`, replaces every submitted dirty image's durable route set, updates the complete image order, merges metadata/location, updates the crag/editor identity, and returns one new revision. `submission_draft_routes` is authoritative; compatibility `route_data.completedRoutes` is derived from normalized durable rows for submitted images, including an explicit empty array after route deletion. Other `route_data` keys and route sets omitted from the save remain unchanged.
5. [`useEditDraftLocationSync`](../features/draft-editor/hooks/use-edit-draft-location-sync.ts) is separate: shared location/crag metadata is patched after a 400 ms debounce and is flushed before publication. Valid custom per-image coordinates from the explicit metadata save are persisted to `submission_draft_images.latitude/longitude` in the same transaction; those columns are the authoritative per-image GPS used by publication.

## Conflicts And Collaboration

- Draft owners and accepted collaborators can read and edit drafts. Invite listing, creation, revocation, and collaborator removal use Server Actions in [`collaboration-actions.ts`](../features/submissions/actions/collaboration-actions.ts); invite claims use the redirect endpoint below.
- Explicit Save, metadata patches, image append/delete, and image ordering use optimistic concurrency via `submission_drafts.updated_at`. An explicit-save conflict produces `draft_conflict` and asks the editor to reload, including when another browser session uses the same account; upload attachment retains its narrower one-retry behavior.
- The legacy route-sync endpoint remains image-scoped last-write-wins for compatibility. Explicit Save and publication do not use compatibility JSON to repair routes: dirty route replacements, image state, metadata, and crag selection commit or roll back together, and publication consumes durable route rows only. Upload attachment has its own one-retry conflict loop.
- Only `submission_drafts.user_id` may publish or delete the draft. Collaborators may edit but cannot publish.
- Published submissions use authenticated wiki editing governed by `user_can_wiki_edit_submission`. The helper requires its user argument to equal `auth.uid()`, and both `log_submission_edit` overloads reject authenticated attempts to attribute history to another user. Successful non-owner edits are attributed in `submission_contributors`; `submission_edit_history` remains a legacy audit/scoring surface, while `wiki_revision_commits` and `wiki_entity_revisions` are the authoritative immutable history. Route deletion remains disabled.
- One published save creates a commit grouping changed image, climb, and route-line snapshots. Existing entities have a baseline parent, patches are generated from authoritative database snapshots, and a repeated mutation UUID returns the original commit without adding revisions. Owner credit and anonymity remain direct owner mutations. Shared crag name, region, and sub-area are read-only in the submission save flow; editors submit a separate rationale-backed proposal, and an independent crag maintainer or moderator applies the crag revision.
- Revision history is read through Server Actions in `features/submissions/actions/revision-actions.ts`. Rollback is admin-only and creates a new child revision after checking the expected head; it never edits or rewinds historical rows.

## Publication

[`publishDraft`](../features/draft-editor/hooks/use-edit-draft-actions.ts) requires finished uploads, a crag, and valid location; it flushes location, forces an explicit save, then calls `POST /api/submissions/drafts/[id]/publish`. [`promoteDraftToSubmission`](../features/submissions/server/drafts/draft-promote.ts) repeats owner/readiness/location checks and invokes `promote_draft_to_submission` atomically.

Route/media promotion is direct: there is no separate route-level pending-review step. The RPC reuses the processed image rows, creates `climbs` with `status = 'approved'`, creates route lines for durable draft routes, and permits image-only submissions. The draft becomes `submitted` and stores its published IDs for idempotent retries. These records become publicly discoverable only when the parent crag is `published`; see [Trust And Content Governance](trust-and-content-governance.md#publication-contract).

When the parent crag is not yet published, the publish response reports `pending_crag_review`, omits the public canonical path, suppresses public publication notifications, and returns the editor to the logbook with a “Submitted for review” confirmation. The application must not generate or navigate to a public route URL until a steward explicitly publishes the parent crag.

Contribution scoring is a server-only post-publication/edit effect. The server reloads authoritative image, edit-history, correction, or verification rows to derive the beneficiary and fixed score before invoking service-only contribution and missing-topo bounty writers; request-supplied identities and score context are not trusted.

`sectorId` is currently selected by [`SectorSelector`](../features/submissions/components/SectorSelector.tsx) and saved under draft metadata by [`useEditDraftActions`](../features/draft-editor/hooks/use-edit-draft-actions.ts), but the current promotion RPC does not copy it to `climbs.sector_id` or `crag_images.sector_id`. Do not rely on sector selection surviving publication until that gap is fixed.

## Topo Replacement And Removal

Crag managers can choose **Edit/replace topo** from `/maintain/crags/[id]/images`. `startTopoReplacementAction` creates or resumes a `topo_replacement` draft while the source image remains public. The editor accepts one replacement photo, lets the manager draw perspective-specific lines, and requires each existing climb to be mapped to a saved line or marked not visible. Draft labels are only visual references: publication uses the existing `climb_id`, so route names, grades, canonical identity, user sends, and logs do not move.

`publish_topo_replacement` validates media readiness and the complete one-to-one relinking set, then publishes the replacement image, creates its route lines, archives/deletes the source lines, and tombstones the source image in one transaction. A failed validation leaves the current topo unchanged. Deleting the replacement draft cancels the job and also leaves the source unchanged.

Direct topo removal always deletes and audits that image's route-line coordinates. By default it retains the underlying climb rows and all user history. Administrators may explicitly select **Also remove associated routes**; this soft-deletes those climbs and removes their lines from every topo, while retaining historical `user_climbs` sends and logs.

## Active Interfaces

- Server Actions: draft create/publish/delete in [`manage-submissions.ts`](../features/submissions/actions/manage-submissions.ts), and collaborator management in [`collaboration-actions.ts`](../features/submissions/actions/collaboration-actions.ts).
- `GET|PATCH|DELETE /api/submissions/drafts/[id]`: hydrate, atomically save an explicit editor payload, apply narrower optimistic metadata/image-order patches, or delete.
- `POST /api/submissions/drafts/[id]/images` and `DELETE /api/submissions/drafts/[id]/images/[imageId]`: attach or remove draft images with conflict tokens.
- `POST /api/submissions/drafts/[id]/routes`: single-image or batched durable route replacement.
- `POST /api/submissions/drafts/[id]/publish`: owner-only promotion.
- `GET /api/submissions/drafts/collaborate/[token]`: authenticate and claim a draft invite.
- `POST /api/media/upload-sessions`, `POST /api/media/upload-sessions/[imageId]/complete`, and `GET|DELETE /api/media/upload-sessions/[imageId]`: create, complete, poll, or discard an upload session. The signed URL itself targets R2 directly.
- `GET|POST /api/crags/[id]/sectors`: list or create sectors for the UI.
- `GET|POST /api/submissions` and `GET|POST /api/routes/submit` still exist as separate published/legacy submission surfaces; neither creates the `/submit` draft.

Canonical control contracts are in [Submission Controls](ui/submission-controls.md).
