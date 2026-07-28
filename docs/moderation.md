# Moderation And Verification

Moderation is not one pipeline. Media readiness, user reports, route verification, and the legacy moderation queue have different state and should not be used as substitutes for one another.

## Automated Media Moderation

Automated media moderation is disabled. New upload sessions and successful Worker ingest use `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`.

There is no AWS Rekognition integration in the active application or media Worker. Do not infer one from historical moderation columns, labels, provider fields, or operational scripts.

## Media Readiness

`images.processing_status` and `media_jobs` represent technical ingest readiness. An image becomes publicly deliverable only when the canonical readiness, moderation, visibility, and legacy status checks pass; see `docs/db/schema.md`.

Readiness means that the private original exists and virtual delivery metadata can be served. It is not an automated safety or content judgment. A processing failure belongs to the media pipeline, not a moderation queue.

## User Flags And Crag Reports

Authenticated users can submit image/climb flags through Server Actions in `features/moderation/actions.ts`. These create `climb_flags` records for administrator review and may send a Discord notification. A second pending flag by the same user for the same target is rejected; a resolved report does not permanently prevent a later report.

Authenticated users can submit crag reports, which create pending `crag_reports` records. Crag reports are a separate workflow from image/climb flags. The admin-only `submitCragFlagAction` also uses `climb_flags` and should not be confused with the general crag-report action.

Direct report and flag reads are restricted by RLS to the submitting user and administrators authorized by `is_current_user_admin()`. Anonymous callers can read only sanitized counts from `climb_flag_counts` and `crag_report_counts`; these views omit user IDs, comments, reasons, details, resolution identities, and moderator notes.

Neither workflow changes media processing readiness automatically.

## Route Verification

Community route verification uses `climb_verifications` through `/api/climbs/<id>/verify`. A user cannot verify their own route or vote twice. Three independent verification rows make the route community-verified according to the current endpoint.

Route verification happens after publication and is separate from upload moderation, user flags, and admin moderation. It is evidence that a route exists/is accurate, not approval of the underlying file bytes.

## Legacy Moderation Queue

`moderation_queue` and `moderation_votes` support admin-authenticated list/vote Route Handlers under `/api/moderation/queue`. The current submission and media-ingest paths do not insert queue rows; repository code only reads and votes on existing rows. Treat this as a legacy compatibility/admin surface, not the gate for new uploads or route publication.

Do not conflate this legacy queue with Cloudflare `MEDIA_QUEUE`: the latter is only a media-ingest transport fast path.

## Operational Boundaries

| Concern | Authoritative state | Current behavior |
|---|---|---|
| Media ingest | `images.processing_status`, `media_jobs` | Durable processing and retry; automated moderation skipped |
| Image/climb reports | `climb_flags` | User report followed by admin review |
| Crag reports | `crag_reports` | Separate pending/investigation/resolution workflow |
| Route verification | `climb_verifications` | Community votes; three votes produce verified status |
| Legacy submission moderation | `moderation_queue`, `moderation_votes` | Existing admin list/vote API; no current writer |

Administrator actions and report resolution should remain auditable and must not silently rewrite media readiness state.
