# Submission Workflow

Draft-based submission system for route submissions.

## Flow

1. Create draft → `submission_drafts` row
2. Upload images → presigned URL → R2 → `submission_draft_images` rows
3. Draw routes → stored as durable `submission_draft_routes` rows and synced per image
4. Promote → `promote_draft` RPC creates `submissions` + `climbs` + `images` rows
5. Images go through media pipeline for processing
6. Community can verify routes (3+ votes)

## Components

- `components/SubmissionWorkstation.tsx` — main workstation UI
- `components/RouteEditorRail.tsx` — route editor sidebar
- `components/RouteEditSidebar.tsx` — route editing controls
- `components/UnifiedRouteCanvas.tsx` — canvas-based route drawing
- `components/submissions/DraftIntakeView.tsx` — draft intake
- `components/submissions/SubmissionManager.tsx` — submission management
- `components/submissions/SubmissionListView.tsx` — list view

## Libraries

- `lib/draft-metadata.ts` — draft metadata utilities
- `lib/media/draft-storage.ts` — draft image storage
- `lib/submission-types.ts` — submission type definitions
- `lib/submissions/fetch-own-submissions.ts` — fetch user's submissions
- `lib/submissions/group-submitted-images.ts` — group images by submission
- `lib/submissions/use-submissions.ts` — submission hooks
- `lib/submit-context.tsx` — submit context provider

## Database Tables

- `submission_drafts` — draft submissions with metadata
- `submission_draft_images` — images attached to drafts (storage_provider, original_bucket, original_key, preview_variants, processing_status)
- `submission_draft_routes` — durable draft routes keyed by draft image, synced with last-write-wins per image
- `submissions` — promoted/live submissions
- `images` — final published images with route lines
- `climbs` — published routes

## API Routes

- `/api/submissions/` — draft CRUD, promotion
- `/api/submissions/drafts/[id]/routes` — draft route read + image-scoped bulk sync
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
