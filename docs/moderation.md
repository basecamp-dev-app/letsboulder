# Moderation And Verification

Moderation is not one pipeline. Media readiness, user reports, and route verification have different state and should not be used as substitutes for one another.

## Automated Media Moderation

Automated media moderation is disabled. New upload sessions and successful Worker ingest use `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`.

There is no AWS Rekognition integration in the active application or media Worker. Do not infer one from historical moderation columns, labels, provider fields, or operational scripts.

## Media Readiness

`images.processing_status` and `media_jobs` represent technical ingest readiness. An image becomes publicly deliverable only when the canonical readiness, moderation, visibility, and legacy status checks pass; see `docs/db/schema.md`.

Readiness means that the private original exists and virtual delivery metadata can be served. It is not an automated safety or content judgment. A processing failure belongs to the media pipeline, not a moderation queue.

## User And Admin Flags

Authenticated users can submit climb flags through Server Actions in `features/moderation/actions.ts`. These create `climb_flags` records for administrator review and may send a Discord notification. A second pending flag by the same user for the same target is rejected; a resolved flag does not permanently prevent a later flag.

The admin-only `submitCragFlagAction` also uses `climb_flags` for crag flags.

Direct flag reads are restricted by RLS to the submitting user and administrators authorized by `is_current_user_admin()`. Anonymous callers can read only sanitized counts from `climb_flag_counts`; these views omit user IDs, comments, details, resolution identities, and moderator notes.

Neither workflow changes media processing readiness automatically.

## Route Verification

Community route verification uses `climb_verifications` through `/api/climbs/<id>/verify`. A user cannot verify their own route or vote twice. Three independent verification rows make the route community-verified according to the current endpoint.

Route verification happens after publication and is separate from upload moderation, user flags, and admin moderation. It is evidence that a route exists/is accurate, not approval of the underlying file bytes.

## Operational Boundaries

| Concern | Authoritative state | Current behavior |
|---|---|---|
| Media ingest | `images.processing_status`, `media_jobs` | Durable processing and retry; automated moderation skipped |
| Climb and admin crag flags | `climb_flags` | User or admin flag followed by admin review |
| Route verification | `climb_verifications` | Community votes; three votes produce verified status |

Administrator actions and report resolution should remain auditable and must not silently rewrite media readiness state.
