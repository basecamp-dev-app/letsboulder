# Moderation And Verification

Moderation is not one pipeline. Media readiness, crag reports, automated submission review, metadata proposals, and route verification have different state and should not be used as substitutes for one another.

## Automated Media Moderation

Automated media moderation is disabled. New upload sessions and successful Worker ingest use `moderation_status = 'skipped'` and `moderation_provider = 'disabled'`.

There is no AWS Rekognition integration in the active application or media Worker. Do not infer one from historical moderation columns, labels, provider fields, or operational scripts.

## Media Readiness

`images.processing_status` and `media_jobs` represent technical ingest readiness. An image becomes publicly deliverable only when the canonical readiness, moderation, visibility, and legacy status checks pass; see `docs/db/schema.md`.

Readiness means that the private original exists and virtual delivery metadata can be served. It is not an automated safety or content judgment. A processing failure belongs to the media pipeline, not a moderation queue.

## Route Verification

Community route verification uses `climb_verifications` through `/api/climbs/<id>/verify`. A user cannot verify their own route or vote twice. Three independent verification rows make the route community-verified according to the current endpoint.

Route verification happens after publication and is separate from upload moderation, crag reports, metadata review, and admin moderation. It is evidence that a route exists/is accurate, not approval of the underlying file bytes.

## Operational Boundaries

| Concern | Authoritative state | Current behavior |
|---|---|---|
| Media ingest | `images.processing_status`, `media_jobs` | Durable processing and retry; automated moderation skipped |
| Crag reports | `crag_reports` | Separate user-report records retained for crag workflows |
| Submission review | Submission `moderation_state` | Automated acceptance, flagging, or blocking of submissions |
| Metadata proposals | Crag metadata proposals and reviews | Maintainer review of proposed crag metadata changes |
| Route verification | `climb_verifications` | Community votes; three votes produce verified status |

Administrator actions and report resolution should remain auditable and must not silently rewrite media readiness state.
