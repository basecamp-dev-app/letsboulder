# Submission Workflow

Draft-based workflow for creating and publishing route submissions.

## Flow

1. Create draft → `submission_drafts` row
2. Upload images → presigned URL → R2 → `submission_draft_images` rows
3. Draw routes → stored as durable `submission_draft_routes` rows and synced per image
4. Promote → `promote_draft` RPC publishes the draft into the live route records
5. Images go through media pipeline for processing
6. Community can verify routes (3+ votes)

## Components

- `features/submissions/components/SubmissionWorkstation.tsx` — main workstation UI
- `features/route-editor/components/RouteEditorRail.tsx` — route editor sidebar
- `features/route-editor/components/RouteEditSidebar.tsx` — route editing controls
- `features/route-editor/components/UnifiedRouteCanvas.tsx` — canvas-based route drawing
- `features/submissions/components/DraftIntakeView.tsx` — draft intake
- `features/submissions/components/SubmissionManager.tsx` — submission management
- `features/submissions/components/SubmissionListView.tsx` — list view

## Libraries

- `features/submissions/lib/draft-metadata.ts` — draft metadata utilities
- `lib/media/draft-storage.ts` — draft image storage
- `features/submissions/lib/submission-types.ts` — submission type definitions
- `features/submissions/lib/fetch-own-submissions.ts` — fetch user's submissions
- `features/submissions/lib/group-submitted-images.ts` — group images by submission
- `features/submissions/hooks/useSubmissions.ts` — submission hooks
- `features/submissions/providers/submit-context.tsx` — submit context provider

## Database Tables

- `submission_drafts` — draft submissions with metadata
- `submission_draft_images` — images attached to drafts (storage_provider, original_bucket, original_key, preview_variants, processing_status)
- `submission_draft_routes` — durable draft routes keyed by draft image, synced with last-write-wins per image
- `images` — final published images with route lines
- `climbs` — published routes

## API Routes

- `/api/submissions` — published route creation and metadata helpers; thin route handlers backed by `features/submissions/server/submissions/*`
- `/api/submissions/[imageId]/routes` — thin POST/PUT/DELETE wrappers for route-line mutations backed by `features/submissions/server/submissions/*`
- `/api/submissions/drafts` — draft creation backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/[id]` — draft metadata/image ordering backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/[id]/images` — draft image append/conflict handling backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/[id]/routes` — draft route read + image-scoped bulk sync backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/[id]/promote` — draft publish flow backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/[id]/collaborators` — draft collaborator/invite management backed by `features/submissions/server/drafts/*`
- `/api/submissions/drafts/collaborate/[token]` — invite-claim redirect flow backed by `features/submissions/server/drafts/*`
- `/api/uploads/signed-url/` — presigned upload URLs
- `/api/media/` — media sessions, private media proxy

## RPC Functions

- `create_unified_submission` — atomically create submission with images
- `promote_draft` — promote draft to live submission
- `user_can_edit_submission_draft` — permission check

## Collaboration

- Drafts support multiple editors
- Route drawing persists immediately via image-scoped bulk sync with last-write-wins per image
- Autosave during editing remains for draft metadata and image ordering
- Draft state persists across sessions

## Server Ownership

- `app/api/submissions/**` should stay focused on request wiring: auth, CSRF, rate limits, and parameter extraction.
- `features/submissions/server/submissions/**` owns submission validation, route-line mutations, and per-mode submission execution.
- `features/submissions/server/drafts/**` owns draft lifecycle operations, image append flows, collaborator management, and draft promotion.
