# Database Schema - letsboulder.com

Maintainer reference for schema shape, relationships, and grade-system behavior.

## 1. Grade System (The "3A Floor")

### Floor Grade
- **User-facing minimum:** `3A`
- **User-facing maximum:** `9C+`
- **Public source of truth:** `@/lib/grade-constants.ts`

### Conversion Engine
`@/lib/grade-constants.ts` defines the public valid/selectable grade range.
`@/lib/grades.ts` defines cross-system mappings and internal grade utilities.

The `gradeMappings` array in `@/lib/grades.ts` is the source of truth for cross-system conversion.
Font scale is the master index (42 entries). V-scale, YDS, French, British are derived — some values duplicate where their resolution is coarser.

| grade_index | V-Scale | Font | YDS | French | British | Difficulty |
|------------|---------|------|-----|--------|---------|------------|
| 0 | VB- | 3A | 5.4 | 3 | M | Beginner |
| 1 | VB- | 3A+ | 5.5 | 3+ | M | Beginner |
| 2 | VB- | 3B | 5.5 | 3+ | D | Beginner |
| 3 | VB- | 3B+ | 5.6 | 4- | VD | Beginner |
| 4 | VB- | 3C | 5.6 | 4- | VD | Beginner |
| 5 | VB | 3C+ | 5.6 | 4 | VD | Beginner |
| 6 | V0- | 4A | 5.7 | 4 | VD | Beginner |
| 7 | V0 | 4A+ | 5.9 | 5 | D | Beginner |
| 8 | V0+ | 4B | 5.9 | 5+ | D | Beginner |
| 9 | V1- | 4B+ | 5.10a | 6a | HVD | Intermediate |
| 10 | V1 | 4C | 5.10a | 6a | S | Intermediate |
| 11 | V1+ | 4C+ | 5.10b | 6a+ | VS | Intermediate |
| 12 | V1-2 | 5A | 5.10b | 6a+ | HVS | Intermediate |
| 13 | V2- | 5A+ | 5.10c | 6b | E1 | Intermediate |
| 14 | V2 | 5B | 5.10c | 6b | E1 | Intermediate |
| 15 | V2+ | 5B+ | 5.10d | 6b | E2 | Intermediate |
| 16 | V2-3 | 5C | 5.10d | 6b+ | E2 | Intermediate |
| 17 | V3- | 5C+ | 5.11a | 6b+ | E3 | Intermediate |
| 18 | V3 | 6A | 5.11a | 6b | E3 | Intermediate |
| 19 | V3-4 | 6A+ | 5.11b | 6b+ | E3 | Advanced |
| 20 | V4 | 6B | 5.11c | 6c | E4 | Advanced |
| 21 | V4-5 | 6B+ | 5.11d | 6c+ | E4 | Advanced |
| 22 | V5 | 6C | 5.12a | 7a | E5 | Advanced |
| 23 | V5-6 | 6C+ | 5.12b | 7a+ | E6 | Advanced |
| 24 | V6 | 7A | 5.12b | 7a+ | E6 | Advanced |
| 25 | V7- | 7A+ | 5.12c | 7b | E7 | Expert |
| 26 | V8- | 7B | 5.13a | 7c | E8 | Expert |
| 27 | V8+ | 7B+ | 5.13b | 7c+ | E9 | Expert |
| 28 | V9 | 7C | 5.13c | 7c+ | E9 | Expert |
| 29 | V10 | 7C+ | 5.14a | 8a | E10 | Elite |
| 30 | V11 | 8A | 5.14a | 8a | E10 | Elite |
| 31 | V12 | 8A+ | 5.14c | 8a+ | E11 | Elite |
| 32 | V13 | 8B | 5.15a | 8b | E11 | Elite |
| 33 | V14 | 8B+ | 5.15b | 8c | E11 | Elite |
| 34 | V15 | 8C | 5.15c | 9a | E11 | Elite |
| 35 | V16 | 8C+ | 5.15d | 9a+ | E11 | Elite |
| 36 | V17 | 9A | 5.15d | 9a+ | E11 | Elite |
| 37 | V17+ | 9A+ | 5.16a | 9b | E11 | Elite |
| 38 | V18 | 9B | 5.16a | 9b+ | E11 | Elite |
| 39 | V18+ | 9B+ | 5.16b | 9c | E12 | Elite |
| 40 | V19 | 9C | 5.16c | 9c+ | E12 | Elite |
| 41 | V19+ | 9C+ | 5.16d | 9c+ | E13 | Elite |

**Implementation rule:** Always use `gradeMappings` for V-Scale <-> Font <-> YDS <-> French <-> British conversions.
**Boundary rule:** User-facing validation and selection must stay within `3A-9C+`.
**Source of truth:** `climbs.grade` stores the Font string (e.g. '6A'). `climbs.grade_index` is a derived column for sorting.

---

## 2. Tables

### Core Tables
| Table | Purpose |
|-------|---------|
| `crags` | Climbing locations with canonical latitude/longitude, export visibility, generated PostGIS geography, country/region references |
| `climbs` | Individual routes/problems with grade, name, crag reference, and optional export visibility override |
| `images` | Route photos with media-pipeline state, moderation, GPS coordinates |
| `profiles` | User profiles; public-safe columns are separated from private and server-owned fields by column grants and RLS |
| `places` | Unified location entity (crags + gyms) |
| `sectors` | Sub-areas within crags |
| `countries` | Country data with ISO codes and PostGIS boundaries |
| `regions` | Regional groupings within countries |
| `continents` | Continental groupings |
| `comments` | User comments on crags, images, climbs (soft-deletable) |
| `route_lines` | Route line geometry drawn on images |
| `user_climbs` | User climb logs (flash/top/try) with star ratings, grade opinions, and mutation ordering timestamps |
| `log_route_mutations` | RPC-only idempotency receipts for replay-safe climb log mutations |
| `saved_climbs` | User saved climbs / want-to-try list |
| `saved_crags` | User saved crags for future trips |

### Grade & Voting Tables
| Table | Purpose |
|-------|---------|
| `grades` | Grade-to-points lookup table |
| `grade_mappings` | Cross-system grade conversion (Font, V-scale, YDS, French, British) |
| `grade_votes` | Community grade consensus voting on climbs |
| `route_grades` | Per-user grade opinions on climbs (distinct from grade_votes) |
| `climb_verifications` | User verifications that a climb exists/is accurate |

### Location Taxonomy Tables
| Table | Purpose |
|-------|---------|
| `location_tags` | Tag-based location taxonomy (region/sub_area kinds) |
| `crag_location_tags` | Junction: crags ↔ location_tags (one primary region per crag) |
| `un_regions` | UN region reference data |

### Community Tables
| Table | Purpose |
|-------|---------|
| `community_posts` | Community session/conditions/question/update posts |
| `community_post_comments` | Comments on community posts |
| `community_post_rsvps` | RSVPs for session posts |
| `community_place_follows` | User follows on places (crags/gyms) with notification levels |
| `notifications` | User notifications |

### Moderation Tables
| Table | Purpose |
|-------|---------|
| `climb_corrections` | Route correction requests with voting |
| `correction_votes` | Votes on climb corrections |
| `crag_reports` | User reports on crags (access, safety, etc.) |
| `admin_actions` | Admin audit log of moderation actions |
| `crag_maintainers` | Crag-scoped management permissions assigned to creators automatically or by administrators |
| `crag_metadata_proposals` | Immutable-head proposals with a required rationale for existing active crag metadata changes |

### Operational Data Access
`community_post_rsvps` and `crag_reports` contain user identities or moderation details. Anonymous callers have no direct table access. Authenticated callers can read their own rows, while administrators can read all rows through the identity-bound `is_current_user_admin()` RLS predicate.

Public totals are available only through sanitized aggregate views:

| View | Public columns |
|------|----------------|
| `community_post_rsvp_counts` | Post ID and going/interested counts |
| `crag_report_counts` | Crag ID and total/per-status counts |

These views are owned by the non-login, non-bypass `operational_aggregate_reader` role. That role receives column-level access only to grouping keys and statuses and has dedicated RLS policies; it cannot read identities or free-form moderation fields. Report rows for deleted crags are excluded explicitly.

### Public Data Export
`location_visibility` is an enum with `exact`, `approximate`, and `hidden`. `crags.location_visibility` is required and defaults to fail-closed `hidden`; `climbs.location_visibility` is a nullable override. A route's effective policy is the stricter parent/route value (`hidden` > `approximate` > `exact`). Crag exports round approximate coordinates to two decimals and omit hidden coordinates. Route coordinates are exported only under an effective `exact` policy; approximate and hidden route coordinates are omitted.

The versioned database export surfaces are:

| View | Contents |
|------|----------|
| `public_data_export_crags_v1` | Published active crags with nonblank slug/country code and policy-filtered coordinates |
| `public_data_export_routes_v1` | Active/approved routes under eligible crags, with effective shared climb ID and location policy |
| `public_data_export_route_lines_v1` | Route geometry for exported routes on ready, approved/skipped, public, approved media with an active crag parent when present |
| `public_data_export_sectors_v1` | Sectors under eligible crags |
| `public_data_export_tombstones_v1` | Deleted crag/route IDs, deletion timestamps, and optional replacements; deletion reasons are excluded |

These security-barrier views are owned by `public_data_export_owner`, a `NOLOGIN NOINHERIT NOBYPASSRLS` role whose narrow base-table grants and dedicated RLS policies are limited to view evaluation. The separate `public_data_export_reader` role receives only view `SELECT` and has no source-table grants, so workflow credentials cannot bypass location filtering. Neither role has usable or unexpected memberships; identities, descriptions, access notes, media identifiers/URLs, deletion reasons, and moderation details are not exported. `public_data_export_registry` records crag/route IDs when they first become export-eligible and retains deletion time/replacement metadata on soft or hard deletion, allowing tombstones to remain complete without source rows or mutable status/routing fields; it contains no user data and is not readable by the workflow role.

### Submission Tables
| Table | Purpose |
|-------|---------|
| `submission_drafts` | Draft submissions with metadata |
| `submission_draft_images` | Images attached to drafts (storage-aware) |
| `submission_draft_routes` | Durable per-image draft routes for image-scoped sync |
| `topo_replacements` | Resumable replacement jobs that keep a published source topo live until atomic cutover |
| `topo_replacement_routes` | Per-climb mapping from existing route identity to a replacement draft line or `not_visible` resolution |
| `topo_route_line_tombstones` | Audited snapshots of perspective-specific route lines removed with a topo |
| `crag_images` | Multi-image crag gallery |
| `crag_publication_events` | Immutable audit records for crag publication-state transitions |
| `submission_collaborators` | Legacy invite-based published collaboration rows; no longer required for published wiki editing |
| `submission_collaborator_invites` | Legacy token-based invites for published collaboration |
| `submission_draft_collaborators` | Shared editing access on drafts |
| `submission_draft_collaborator_invites` | Token-based invites for draft collaboration |
| `submission_contributors` | Non-owner users who have successfully edited a published submission |
| `submission_edit_history` | Retained legacy per-image audit log for published wiki edits |
| `wiki_entities` | Permanent identities for revisioned images, climbs, route lines, and crags |
| `wiki_revision_commits` | Immutable author, intent, and mutation metadata grouping one atomic edit |
| `wiki_entity_revisions` | Immutable canonical snapshots, RFC 6902 patches, hashes, and parent links |
| `wiki_revision_merge_parents` | Additional same-entity parents for explicit future merge commits |
| `wiki_entity_heads` | Current linear revision pointer and optimistic-concurrency number per entity |

### Gym Tables
| Table | Purpose |
|-------|---------|
| `gym_owner_applications` | Gym owner application workflow |
| `gym_memberships` | User gym memberships (owner/manager/setter roles) |
| `gym_floor_plans` | Gym floor plan images (one active per gym) |
| `gym_routes` | Indoor gym routes |
| `gym_route_markers` | Route markers on floor plans (normalized coordinates) |

### Account & Deletion Tables
| Table | Purpose |
|-------|---------|
| `deletion_requests` | User account deletion workflow with scheduling |
| `deleted_accounts` | Audit log of deleted user accounts |
| `media_deletion_jobs` | Service-only transactional outbox for private R2 original and canonical derivative deletion |

`profiles.open_data_consent_version` and `profiles.consent_timestamp` record the latest Open Data Contributor Terms accepted by an account. `current_open_data_consent_version()` is the required version; changing it requires a migration and causes one-time re-consent on the contributor's next public contribution. Identity-bound RPCs own acceptance and status reads. Contribution triggers enforce consent transactionally while service-role maintenance, deletion, and moderation remain outside the contributor gate.

### Analytics & Misc Tables
| Table | Purpose |
|-------|---------|
| `product_clicks` | Affiliate/product click tracking |
| `climb_video_betas` | Video beta links for climbs |
| `media_jobs` | Durable media ingest outbox claimed by the Cloudflare Worker |

---

## 3. Relational Map

### Key Relationships (ON DELETE behavior from prod)

| Parent | Child | Delete Behavior |
|--------|-------|-----------------|
| `auth.users` | `profiles` | CASCADE |
| `auth.users` | `community_posts` | CASCADE |
| `auth.users` | `community_post_comments` | CASCADE |
| `auth.users` | `community_post_rsvps` | CASCADE |
| `auth.users` | `notifications` | CASCADE |
| `auth.users` | `gym_memberships` | CASCADE |
| `auth.users` | `deletion_requests` | CASCADE |
| `auth.users` | `climb_corrections` | CASCADE |
| `auth.users` | `climb_verifications` | CASCADE |
| `auth.users` | `climb_video_betas` | CASCADE |
| `auth.users` | `correction_votes` | CASCADE |
| `auth.users` | `grade_votes` | CASCADE |
| `auth.users` | `route_grades` | CASCADE |
| `auth.users` | `route_lines` | CASCADE |
| `auth.users` | `saved_climbs` | CASCADE |
| `auth.users` | `saved_crags` | CASCADE |
| `auth.users` | `user_climbs` | no action |
| `auth.users` | `submission_edit_history.edited_by` | SET NULL |
| `auth.users` | `crag_metadata_proposals.proposer_id` | SET NULL |
| `auth.users` | `crag_metadata_proposals.reviewer_id` | SET NULL |
| `auth.users` | `crags.created_by` | SET NULL |
| `auth.users` | `crag_maintainers.user_id` | CASCADE |
| `auth.users` | `crag_maintainers.assigned_by` | SET NULL |
| `crags` | `climbs` | CASCADE |
| `crags` | `crag_images` | CASCADE |
| `crags` | `crag_location_tags` | CASCADE |
| `crags` | `crag_reports` | CASCADE |
| `crags` | `sectors` | CASCADE |
| `crags` | `submission_drafts` | SET NULL |
| `places` | `climbs` | SET NULL |
| `places` | `community_place_follows` | CASCADE |
| `places` | `community_posts` | CASCADE |
| `places` | `gym_floor_plans` | CASCADE |
| `places` | `gym_memberships` | CASCADE |
| `places` | `gym_routes` | CASCADE |
| `places` | `images` | SET NULL |
| `sectors` | `climbs` | SET NULL |
| `sectors` | `crag_images` | SET NULL |
| `images` | `media_jobs` | CASCADE |
| `images` | `route_lines` | CASCADE |
| `images` | `topo_replacements.source_image_id` | RESTRICT |
| `images` | `topo_replacements.replacement_image_id` | RESTRICT |
| `images` | `topo_route_line_tombstones` | RESTRICT |
| `images` | `submission_collaborators` | CASCADE |
| `images` | `submission_collaborator_invites` | CASCADE |
| `images` | `submission_contributors` | CASCADE |
| `images` | `submission_edit_history` | RESTRICT |
| `climbs` | `climb_corrections` | CASCADE |
| `climbs` | `climb_verifications` | CASCADE |
| `climbs` | `climb_video_betas` | CASCADE |
| `climbs` | `grade_votes` | CASCADE |
| `climbs` | `route_grades` | CASCADE |
| `climbs` | `route_lines` | CASCADE |
| `climbs` | `topo_replacement_routes` | RESTRICT |
| `climbs` | `topo_route_line_tombstones` | RESTRICT |
| `climbs` | `saved_climbs` | CASCADE |
| `climbs` | `user_climbs` | CASCADE |
| `climbs` | `climbs` (self-ref via shared_climb_id) | SET NULL |
| `climbs` | `climbs` (self-ref via superseded_by) | RESTRICT |
| `crags` | `crags` (self-ref via superseded_by) | RESTRICT |
| `crags` | `saved_crags` | CASCADE |
| `submission_drafts` | `submission_draft_images` | CASCADE |
| `submission_drafts` | `submission_draft_routes` | CASCADE |
| `submission_drafts` | `topo_replacements` | SET NULL |
| `submission_drafts` | `submission_draft_collaborators` | CASCADE |
| `submission_drafts` | `submission_draft_collaborator_invites` | CASCADE |
| `submission_draft_images` | `submission_draft_routes` | CASCADE |
| `countries` | `crags` | SET NULL |
| `countries` | `places` | SET NULL |
| `countries` | `images` | no action |
| `regions` | `countries` | SET NULL |
| `crags` | `comments` | Trigger soft-delete (crag) |
| `images` | `comments` | Trigger soft-delete (image) |
| `climbs` | `comments` | Trigger soft-delete (climb) |
| `location_tags` | `crag_location_tags` | CASCADE |
| `crags` | `crag_maintainers` | CASCADE |
| `crags` | `crag_metadata_proposals` | RESTRICT |
| `images` | `crag_metadata_proposals.source_image_id` | SET NULL |
| `continents` | `un_regions` | no action |
| `un_regions` | `regions` | no action |

**Deletion rule:** Before any DELETE operation, check this table or the migration files in `supabase/migrations/` to confirm ON DELETE behavior. Never assume cascade behavior.

### Polymorphic Comments

The `comments` table uses a polymorphic `target_id`/`target_type` pattern to attach comments to `crag`, `image`, or `climb` records. This design has no FK constraints — a deliberate tradeoff:

**Why no FKs:** PostgreSQL does not support polymorphic foreign keys. A single `target_id` column cannot reference multiple tables.

**How integrity is enforced:**
- **On INSERT/UPDATE:** `validate_comment_target()` trigger checks that the referenced target exists (`comments_validate_target_trigger`)
- **On target DELETE:** `soft_delete_comments_on_target_delete()` triggers on `crags`, `images`, `climbs` soft-delete associated comments (`deleted_at = now()`)
- **On comment DELETE:** `enforce_comment_soft_delete_only()` trigger prevents hard deletes (`comments_soft_delete_only_trigger`)

**Tradeoff:** No cascade at the DB level. Orphan comments are prevented by triggers, not FK constraints. If a trigger is dropped or disabled, orphans can accumulate.

### Published Content Deletion
- `crags` and `climbs` use `deleted_at`, a required trimmed `deletion_reason` of at most 500 characters, and optional same-table `superseded_by`. Existing soft-deleted climbs are backfilled with `Legacy soft deletion`.
- `soft_delete_climb` and `soft_delete_crag` are authenticated admin-only `SECURITY DEFINER` RPCs bound to `auth.uid()` through `is_current_user_admin()`. They lock target/replacement rows, require an active replacement, reject self-reference/cycles, and insert `admin_actions` in the same transaction. Crag deletion also locks and soft-deletes every active child climb.
- `soft_delete_crag_image(crag_id, image_id, reason)` binds the management request to the displayed crag under the same row lock before delegating to `soft_delete_image`; a canonical image ID from another crag cannot be mutated. Legacy `crag_images.id` values are not accepted by this path.
- Image tombstoning archives and deletes that image's `route_lines`, because their coordinates are perspective-specific. It does not delete `climbs`, user sends, or logs. The four-argument `soft_delete_crag_image(crag_id, image_id, reason, delete_routes)` adds an explicit admin-only option to soft-delete each associated climb and remove all of its remaining topo lines; `user_climbs` history is retained.
- Topo replacement stages exactly one new processed image in a `draft_kind = 'topo_replacement'` draft. Every climb attached to the source image must map to one saved draft line or be marked `not_visible`, and every drawn line must map to exactly one existing climb. Publication inserts replacement geometry with the original `climb_id` values, archives/deletes source geometry, and swaps image visibility in one transaction. Names, grades, route URLs, sends, and logs therefore retain their existing identities.
- Submitted climb corrections have no direct API-role UPDATE policy. Their identity and payload fields are also trigger-immutable; voting may update only resolution state and counters through the canonical RPC.
- Lifecycle changes are trigger-gated to the admin soft-delete RPCs and service-only account/submission deletion workflows. Authenticated direct DELETE grants/policies are removed. Hard-delete guards apply even to `service_role`: only fully empty crags and unassociated, never-published climbs/images can be physically deleted.
- The physical `crags` to `climbs` FK remains `ON DELETE CASCADE` for legacy compatibility, but the crag hard-delete guard prevents that cascade whenever any climb exists.
- Public RLS exposes only active crags and active climbs under active crags. Image reads additionally reject `status = 'deleted'` and deleted crag parents; comment visibility is parent-aware. Administrators have separate all-row read policies for crags/climbs.
- `resolve_public_crag_slug(country_code, crag_slug)` and `resolve_public_climb_slug(country_code, crag_slug, climb_slug)` follow valid supersession to an active row. Their result shapes intentionally omit deletion reasons.
- Published/history-bearing images survive account cleanup as `status = 'deleted'`, private tombstones. Published climbs are soft-deleted. `submission_edit_history.image_id` is `ON DELETE RESTRICT`, while `edited_by` is nullable and `ON DELETE SET NULL`, preserving history after image/editor deletion.

### Media Pipeline Tables
- `images` carries media-pipeline state in addition to legacy `url` storage fields.
- Key columns: `storage_provider`, `original_bucket`, `original_key`, `optimized_bucket`, `optimized_key`, `optimized_mime`, `optimized_bytes`, `optimized_width`, `optimized_height`, `asset_version`, `variants`, `visibility`, `processing_status`, `checksum_sha256`, `processed_at`, `original_deletion_queued_at`, `original_deleted_at`, `latitude`, `longitude`. The optimized tuple is all-null or a complete positive-dimension `image/webp` object. Resumable browser sessions also bind `client_upload_id`, `upload_purpose`, `upload_draft_id`, and `upload_crag_id`; `(created_by, client_upload_id)` is unique when present.
- `images.submission_id` is a logical submission-group identifier used by publication, grouping, editing, deletion, and monitoring code. No `submissions` table or FK constraint backs it, so application and RPC code must preserve its grouping invariants explicitly.
- `images.wiki_revision` is the optimistic-concurrency token for published image edits. `apply_published_submission_edit` locks the image, requires the caller's `baseRevision` to match, and advances it once per committed mutation.
- `submission_draft_images` mirrors the provider-aware original reference. A draft cannot link the same authoritative image twice. New upload-session attachments must persist an owned `linked_image_id` whose original or current locator exactly matches the attachment; legacy path-only rows remain nullable and fail closed at publication.
- `submission_draft_routes` is the authoritative draft route representation. `save_submission_draft_atomic` validates the complete V2 metadata/image snapshot before mutation and replaces submitted dirty route sets together with the complete image order, merged metadata/location, custom image GPS, crag, editor identity, and one concurrency-checked draft revision. For each submitted image it derives compatibility `route_data.completedRoutes` from normalized durable rows, writes `[]` for an explicit empty route set, and preserves unrelated `route_data` keys; publication never restores routes from compatibility JSON.
- `submission_draft_images.latitude/longitude` is the authoritative per-image GPS representation used by draft publication. Atomic explicit saves copy valid custom-mode metadata GPS into these columns in the same transaction; shared-mode saves preserve the existing shared-location coordinates and publication semantics.
- `media_jobs` is the durable outbox for active media ingest. Upload completion calls authenticated `finalize_media_upload(...)` to commit the immutable locator, enqueue staging replacement cleanup, and invoke `queue_media_ingest_job(...)` in one transaction; replay returns the existing active job. If the immutable R2 copy succeeds but finalization fails, `enqueue_failed_media_upload_copy_cleanup(...)` records delayed compensation. A finalization retry atomically cancels queued compensation before committing the locator.
- `commit_media_webp(...)` is the service-only atomic transition from an immutable original to its canonical WebP. It locks the image, compares the expected original bucket/key, requires the derivative under `images/assets/<image UUID>/<64-hex content ID>/*.webp`, stores the derivative tuple, manifest and URL, switches linked draft/crag locators, and backfills an unlinked draft row only for a unique exact locator whose image owner owns or collaborates on that draft. It marks processing ready and enqueues the original with reason `source_replaced`. Exact replay returns the same deletion-job UUID; stale, deleted, ambiguous, or conflicting rows fail without partial state.
- `media_deletion_jobs` snapshots canonical, image-UUID-namespaced R2 bucket/key coordinates before image tombstones and hard deletes. It intentionally has no FK to `images`, so pending deletion work survives source-row removal; active jobs are unique by bucket/key. `source_replaced` rows additionally carry `delivery_verified_at` and cannot be claimed until service-only `verify_media_replacement_delivery(...)` confirms the image and all switched locators. Reviewed maintenance may call service-only `enqueue_reconciled_media_orphans(...)` for at most 25 unreferenced `lb-prod-media-private/images/originals/<UUID>/...` objects whose namespace image no longer exists; the RPC repeats the database-wide reference proof atomically and records reason `reconciled_orphan`. Image deletion captures original and optimized objects independently without relying on cascade behavior. Completing a source-replacement job stamps `images.original_deleted_at`; the trigger also cancels active ingest jobs so a deleted image cannot be republished by delayed processing.
- `claim_media_job(worker_name text, lease_seconds)` and `claim_media_job_for_image(worker_name, image_id, lease_seconds)` issue expiring claim tokens. Queue ingress is only a wake-up hint; both Queue and scheduled processing claim the durable outbox. Completion, retry, failure, canonical commit, and delivery verification reject stale tokens.
- `claim_media_deletion_job(worker_name, lease_seconds)` reclaims due or expired deletion work with `FOR UPDATE SKIP LOCKED`. Completion/retry/failure RPCs require the current claim token, and completed/cancelled jobs are pruned after 30 days.
- Active ingest runs through `media_jobs` + the Worker in `apps/media-worker`; `images` remains the source of truth.
- Canonical publishability is `processing_status = 'ready'` and `moderation_status IN ('approved', 'skipped')`. Public delivery or association additionally requires `visibility = 'public'` and legacy `status = 'approved'`.
- Public crag discovery is gated by `crags.publication_status = 'published'`. New crags default to `review`; administrators or assigned maintainers transition them through `set_crag_publication_status`, which applies readiness checks and records `crag_publication_events`.
- `crag_images` is a gallery association, not independent media approval. Public reads require an active crag and a publicly deliverable `linked_image_id`. Unlinked legacy rows fail closed unless individually reviewed through the service-only `mark_legacy_crag_image_published(crag_image_id)` RPC, which records `legacy_published_at`; presence in `crag_images` or a raw storage locator never establishes publication.
- `assert_media_ready_for_publication(image_ids)` locks and validates authoritative `images` rows inside publication transactions. Draft promotion, unified submission creation, route creation, and linked `crag_images` writes fail with detail code `media_not_ready` until every image is publicly deliverable.
- Transactional guards require publication RPCs to associate existing upload-session image IDs and preserve worker-produced processing, moderation, visibility, and delivery fields.
- `promote_draft_to_submission` locks the draft first, then draft attachments and routes by ID, authoritative linked images by ID, and finally the crag. It rejects duplicate linked image identities and validates each linked image's owner and storage path, public readiness, and the crag's canonical slug and country code before publishing.
- `repair_submission_draft_crag_country` is the service-role repair path for a selected crag with no country code. It locks the draft and crag, verifies the expected owner, validates the server-resolved ISO code, and only fills missing canonical country metadata.
- Promotion changes `draft` to `submitted` with a status compare-and-swap. A repeated call for a submitted draft returns its stored publication result instead of creating another publication; drafts with images but no routes remain valid.
- `delete_unassociated_upload_image(image_id)` locks the authoritative image and deletes it only when the caller owns it (or is `service_role`) and no content reference remains. Draft links, published associations, routes, gallery links, child images, moderation/collaboration/contribution records, and image comments all make it associated, regardless of processing status. The upload-session DELETE route maps `image_associated` to HTTP 409.

### Collaboration Tables
- Published submissions use wiki-style editing for authenticated users; `submission_collaborators` and `submission_collaborator_invites` remain legacy published-collaboration tables.
- Published images may exist before any `route_lines` are added, enabling image-only submissions that receive topo later.
- `submission_contributors` records successful non-owner published editors.
- `submission_edit_history` stores field-aware, per-image edit history for published submissions and is retained when an editor account is deleted.
- `published_edit_mutations` is an internal, RLS-enabled receipt table keyed by `(editor_id, client_mutation_id)`. It stores the canonical request hash, committed revision, and generated route mappings so an ambiguous client retry returns the original result without repeating writes. API roles have no direct table privileges.
- Published wiki state also has an immutable entity revision ledger. `wiki_entities` gives images, climbs, route lines, and crags permanent identities; `wiki_revision_commits` groups every changed entity from one save; and `wiki_entity_revisions` stores the complete canonical snapshot, deterministic top-level RFC 6902 patch, SHA-256 content hash, schema version, parent, and rollback/supersession links. Normal edits advance one linear `wiki_entity_heads` pointer. `wiki_revision_merge_parents` is reserved for explicit same-entity merge ancestry.
- Snapshots contain user-authored canonical fields only. They exclude media processing fields, counts, grade consensus, vote totals, verification aggregates, generated geography, `places` projections, editor/timestamp fields, and `images.wiki_revision`. Route geometry is revisioned separately from climb metadata. Crag snapshots include the primary region tag edge so rollback can restore taxonomy consistently.
- Existing published content is backfilled as `baseline` revisions. Content first edited or lifecycle-changed after publication receives a lazy pre-change baseline; newly created routes begin at revision 1. Soft deletion and supersession changes are grouped by database transaction identity and append revisions without trusting session metadata. `submission_edit_history` remains dual-written for contributor scoring and pre-migration audit display but is not revision authority.
- Commit/revision/merge-parent rows reject updates and deletes at the database layer. The sole allowed commit update is the `auth.users ON DELETE SET NULL` author anonymization required by account deletion. Authenticated reads require the source image/climb/crag and route parents to remain visible under their existing RLS policies; admins can read retained tombstones. API roles cannot write ledger tables directly. Narrow `SECURITY DEFINER` functions own writes.
- Rollback never rewinds a head. `rollback_wiki_entity_revision` is admin-only, locks and compares the expected head UUID, restores the selected canonical snapshot, and appends a new `rollback` revision with `restored_from_revision_id`. A stale preview fails with `wiki_revision_conflict`.
- Existing active crag name, region, and sub-area changes use `propose_crag_metadata`; proposal creation records the immutable crag head UUID but does not change the crag, its place projection, or location-tag edges. Every proposal includes a trimmed 10-1000 character rationale, which is part of the idempotent request hash. A client mutation UUID is idempotent per proposer and cannot be reused for another payload, and each proposer may have only one pending proposal per crag. An optional source image must already belong to the crag. The target crag is retained by `ON DELETE RESTRICT`. This workflow does not create crags or model an area hierarchy.
- `crags.created_by` binds authenticated crag creation to `auth.uid()`. The creator may attach the initial region edge only while that new crag has no images, climbs, drafts, or crag images; authenticated callers cannot directly attach taxonomy edges to a shared crag.
- A newly inserted proposal transactionally creates one `crag_metadata_review_requested` notification for every assigned crag maintainer and `profiles.is_admin` moderator except the proposer; overlapping roles are deduplicated and idempotent replays do not notify again. Links target `/maintain/crags` with crag and proposal query parameters.
- `review_crag_metadata_proposal` permits only a different user who is an admin or an assigned maintainer for that crag. Rejection changes proposal state only. Approval locks the proposal, active crag, and wiki head; any head mismatch permanently resolves the proposal as `conflict` without canonical mutation. A successful approval resolves the country-scoped region tag, updates the single primary region edge and crag (thereby running the crag-to-place trigger), appends one immutable crag revision, and marks the proposal approved in the same transaction. Approved, rejected, and conflict outcomes transactionally notify the proposer when that account still exists.
- New crags automatically assign their creator as a crag maintainer in the insert transaction; existing active creator-owned crags are backfilled. `set_crag_maintainer` remains admin-only and identity-bound for later assignment changes. Maintainer and proposal tables are directly read-only to API roles; assignment, proposal, and review writes are otherwise RPC-only. The legacy `update_submission_crag_metadata` RPC is no longer executable by authenticated callers.
- `submission_draft_collaborators` and `submission_draft_collaborator_invites` continue to enable shared editing on drafts. Authenticated owners and collaborators may call `list_submission_draft_collaborators(draft_id)` to receive every membership row for that draft. It returns only user ID, role, creation time, and public display fields; another user's private display fields are null, while callers may receive their own.
- RLS helper functions: `is_submission_collaborator(image_id, user_id)` and `is_submission_draft_collaborator(draft_id, user_id)`.
- Wiki helper function: `user_can_wiki_edit_submission(image_id, user_id)`; the supplied user must equal `auth.uid()`, and deleted images or images under deleted crags are rejected.
- Invite claims: `claim_submission_collaborator_invite(token)` and `claim_submission_draft_collaborator_invite(token)`.

### Profile Access
- `anon` and `authenticated` can select only the public-safe profile columns (`id`, public names/avatar/bio/location preferences, `is_public`, and `created_at`). The `Read visible profiles` policy returns public rows plus the authenticated caller's own row.
- `display_name` is the public name contract. `profiles_sync_display_name` derives it from protected first/last-name fields when a profile has no public label or those name fields change.
- `get_own_profile()` returns the full profile only for `auth.uid()`. `is_current_user_admin()` is the identity-bound predicate used by admin RLS and server checks. `get_top_contributors(limit)` and `get_visible_profile(user_id)` expose only approved public display and statistics fields while respecting profile visibility.
- Authenticated profile updates use an explicit user-editable column allowlist. `profiles_protect_fields` additionally blocks identity, email, admin, aggregate score/statistics, contribution tier/count, creation, policy, TOS, and email-workflow fields.
- There is no authenticated `INSERT` grant on `profiles`; profile creation is server/auth-trigger owned.

### Contribution Scoring
- Contribution event and missing-topo bounty writers are service-only. App scoring code uses an audited service client and derives the beneficiary, source identity, acceptance/publication state, place/crag, and fixed score from authoritative `images`, `submission_edit_history`, `climb_corrections`, and `climb_verifications` rows.
- Client-supplied user IDs, score deltas, and source context are not accepted as scoring authority. `record_contribution_event`, `open_missing_topo_bounty`, and `resolve_missing_topo_bounty` are internal write primitives, not authenticated-user RPCs.

### RLS Policy Matrix (Submission & Collaboration)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `submission_drafts` | owner or collaborator | owner only (policy) + RPC | owner or collaborator (draft status) | RPC only |
| `submission_draft_images` | owner or collaborator | owner or collaborator (draft status) | owner or collaborator (draft status) | RPC only |
| `submission_draft_routes` | owner or collaborator | owner or collaborator (draft status, FOR ALL) | owner or collaborator (draft status, FOR ALL) | owner or collaborator (draft status, FOR ALL) |
| `submission_collaborators` | self or owner | owner only | (none — RPC only) | owner or self |
| `submission_collaborator_invites` | owner | owner only | (none — RPC only) | owner only |
| `submission_draft_collaborators` | self or owner | owner only (draft status) | (none — RPC only) | owner or self |
| `submission_draft_collaborator_invites` | owner | owner only (draft status) | (none — RPC only) | owner only |
| `submission_contributors` | authenticated | service / helper only | service / helper only | service / helper only |
| `submission_edit_history` | authenticated | service / helper only | service / helper only | service / helper only |
| `published_edit_mutations` | RPC only | RPC only | RPC only | RPC only |
| `log_route_mutations` | RPC only | RPC only | RPC only | RPC only |
| `wiki_entities` | authenticated when source is visible; all for admin | RPC only | RPC only | RPC only |
| `wiki_revision_commits` | authenticated through a visible entity revision; all for admin | RPC only | author anonymization only | none |
| `wiki_entity_revisions` | authenticated when entity source is visible; all for admin | RPC only | none | none |
| `wiki_revision_merge_parents` | authenticated when revision source is visible; all for admin | RPC only | none | none |
| `wiki_entity_heads` | authenticated when entity source is visible; all for admin | RPC only | RPC only | none |
| `crag_maintainers` | own scope or admin | RPC only | RPC only | RPC only |
| `crag_metadata_proposals` | proposer, in-scope crag maintainer, or admin | RPC only | RPC only | none |
| `images` | existing + collaborator read | existing | existing | admin policy or guarded RPC |
| `crags` | active public rows; all rows for admin | authenticated self-bound create | existing | empty-row maintenance only |
| `climbs` | active rows under active crags; all rows for admin | owner create | owner pending fields only | unassociated pending-row maintenance only |

**Key security notes:**
- `promote_draft_to_submission` is `SECURITY DEFINER`, requires the locked draft's owner, and is the only path allowed to transition a draft to `submitted`; direct draft UPDATE policies require both old and new status to remain `draft`.
- `repair_submission_draft_crag_country` is `SECURITY DEFINER` and executable only by `service_role`; the publish route resolves coordinates through the atlas with a Nominatim fallback before calling it. It is defined in `20260725160200_repair_draft_crag_country.sql`.
- `handle_submission_draft_promoted` trigger is `SECURITY DEFINER` and fires on draft→submitted status change. The UPDATE policy on `submission_drafts` gates who can trigger this transition.
- `is_submission_collaborator` and `is_submission_draft_collaborator` are `SECURITY DEFINER` — appropriate for RLS helpers reading `auth.uid()`.
- The active canonical `promote_draft_to_submission` definition is in `20260726000000_fix_shared_location_gps_preservation.sql`; `20260725160000_forward_publication_safety.sql` established its lock contract. Active atomic deletion definitions are in `20260725160050_atomic_draft_deletion.sql` and `20260725160100_atomic_draft_image_deletion.sql`, with grants and RLS tightened by `20260725160150_draft_deletion_permissions.sql`. Do not use an older archived promotion definition as the current reference.
- `delete_submission_draft_atomic` deletes an editable owner draft and conditionally unreferenced owner uploads in one transaction. `delete_submission_draft_image_atomic` locks the draft, validates the expected timestamp, locks all attachments and the linked image, then atomically deletes one attachment, compacts ordering and metadata, and conditionally deletes the now-unreferenced upload.
- Direct owner DELETE policies are removed from `images`, `submission_drafts`, and `submission_draft_images`. Destructive owner operations must use the guarded RPCs; the separate image admin policy remains available for explicit administration.
- Published wiki helper, history, and grade-vote identities are bound to `auth.uid()`: authenticated callers cannot test, log an edit, or save a vote as another user. Service-role workflows remain the explicit exception outside the submission grade-vote RPC.

### Triggers
| Trigger | Table | Purpose |
|---------|-------|---------|
| `climbs_recompute_crag_location_*` | climbs | Recompute crag centroid on climb changes |
| `climbs_sync_crag_type_after_write` | climbs | Auto-derive crag type from climb route_types |
| `comments_soft_delete_only_trigger` | comments | Prevent hard deletes |
| `comments_validate_target_trigger` | comments | Validate target_type/target_id references |
| `crags_sync_to_places_after_write` | crags | Sync crag → places table |
| `images_trigger_on_crag_location` | images | Recompute crag location on image changes |
| `places_sync_to_crags_after_write` | places | Sync place → crags table |
| `route_lines_set_climb_gps` | route_lines | Inherit climb GPS from image |
| `trg_grade_votes_sync_climb_grade` | grade_votes | Sync consensus to climb |
| `trg_update_climb_consensus_on_vote` | grade_votes | Update consensus on vote changes |
| `trigger_crag_counts_climbs` | climbs | Recompute crag route count |
| `trigger_crag_counts_images` | images | Recompute crag image count |
| `crags_validate_supersession` | crags | Enforce guarded, active, acyclic replacement links |
| `climbs_validate_supersession` | climbs | Enforce guarded, active, acyclic replacement links |
| `*_require_active_crag` | climbs, images, crag_images | Reject inserts/reassignments under deleted crags |
| `crags_guard_hard_delete` | crags | Permit physical deletion only for empty crags |
| `climbs_guard_hard_delete` | climbs | Permit physical deletion only for disposable climbs |
| `images_guard_hard_delete` | images | Permit physical deletion only for unassociated unpublished images |
| `trg_submission_draft_promoted_handoff` | submission_drafts | Handle draft→submission promotion |
| `*_updated_at` | media_jobs, submission_drafts, submission_draft_images | Timestamp touch |

### Bidirectional Sync Guards (crags ↔ places)
The `crags_sync_to_places_after_write` and `places_sync_to_crags_after_write` triggers maintain bidirectional sync between `crags` and `places` tables. Both use dual-layer guards to prevent infinite loops:

- **Guard 1:** `pg_trigger_depth() > 1` — prevents direct trigger recursion
- **Guard 2:** `synced_at` comparison — skips sync if row was just updated by the other trigger (prevents indirect loops)

Both `crags` and `places` have a `synced_at TIMESTAMPTZ` column. When a sync operation completes, it sets `synced_at = NOW()`. The receiving trigger detects this change and returns early, breaking the loop.

Non-delete synchronization remains bidirectional. Delete synchronization is intentionally one-way: deleting a `crags` row removes its paired `places` projection, while deleting a `places` row never deletes the source crag.

### Empty Crag Cleanup
- A crag is empty only when no row references either the crag directly (`images`, `climbs`, `submission_drafts`, `crag_images`, `sectors`, `crag_reports`, `crag_location_tags`, `saved_crags`, `contribution_events`, `contribution_bounties`, or polymorphic crag `comments`) or its paired place (`climbs`, `images`, `community_place_follows`, `community_posts`, `gym_floor_plans`, `gym_memberships`, `gym_routes`, `contribution_events`, `contribution_bounties`, or `user_place_contributor_scores`). Crag metadata proposal history independently retains its target with `ON DELETE RESTRICT`, so a crag with any proposal is never eligible for hard deletion.
- Cleanup requires `created_at` to be older than the grace period, which defaults to one hour. The image recompute trigger explicitly uses the same one-hour grace after reassignment or deletion.
- `delete_empty_crag` locks the crag and paired place parent rows, locks polymorphic comments against concurrent inserts, checks the complete predicate, and repeats that predicate in the final DELETE. `delete_empty_crags` processes eligible IDs in deterministic UUID order and delegates each final decision to the single-row function.
- Both cleanup RPCs are executable only by `service_role`; `anon` and `authenticated` cannot invoke them directly. The invoking image trigger is `SECURITY DEFINER`.

### Auth Tables
- **System tables:** Use RPC functions with `SECURITY DEFINER` for `auth.users` queries
- **Reference:** `get_user_count()` function in database

---

## 4. RPC Functions

### Map & Discovery
| Function | Purpose |
|----------|---------|
| `get_place_pins(include_pending)` | Compatibility map pins for crags and gyms; the legacy boolean cannot broaden results beyond publicly deliverable media |
| `get_viewport_map_features(north, south, east, west, zoom)` | Anon-executable canonical crag/gym viewport pins backed only by publicly deliverable media, with globally anchored server clusters through zoom 11 |
| `get_admin_viewport_map_features(north, south, east, west, zoom)` | Authenticated, identity-bound administrator preview that may additionally include ready/public/moderation-approved legacy-pending media |
| `get_nearby_crags(latitude, longitude, radius_meters, limit)` | RLS-aware crags within a metre radius, ordered nearest-first with the spatial index |
| `get_crag_route_intelligence(p_crag_id)` | Per-route metrics: directions, topo coverage, weighted rating, unique sender counts |
| `get_upload_context(lat, lng)` | Country/region context and nearest active, unsuperseded crag from coordinates |
| `find_region_by_location(lat, lng)` | Find region by GPS coordinates |
| `get_consensus_grade(p_climb_id)` | Compute consensus grade for a climb |
| `get_climbs_with_consensus()` | Batch fetch climbs with consensus grades |
| `get_climb_full_context(p_climb_id)` | Full climb data with faces, routes, stats |
| `get_crag_faces_complete_summary(p_image_id)` | Multi-face summary for a publicly deliverable image |
| `get_image_faces_summary(p_image_id)` | Face data for an image |
| `get_effective_climb_id(p_climb_id)` | Resolve climb ID through shared_climb_id chain |
| `resolve_public_crag_slug(country_code, crag_slug)` | Resolve a canonical public crag slug through active supersession |
| `resolve_public_climb_slug(country_code, crag_slug, climb_slug)` | Resolve a canonical public climb slug through active supersession |
| `resolve_legacy_route_redirect(country_code, crag_slug, climb_slug)` | One-query canonical image-first target for legacy route slugs, including topo lines on shared climb aliases |
| `resolve_legacy_climb_redirect(climb_id)` | One-query canonical image-first target for legacy climb IDs |
| `resolve_legacy_image_redirect(image_id)` | One-query canonical image-first target for legacy image IDs |

### Analytics
| Function | Purpose |
|----------|---------|
| `get_star_rating_summary(p_climb_id)` | Per-route average star rating and count |
| `get_grade_vote_distribution(p_climb_id)` | Grade vote distribution for a climb |
| `get_verification_count(p_climb_id)` | Verification count for a climb |
| `get_verified_routes_count(p_crag_id)` | Verified route count for a crag |
| `get_user_count()` | Total user count (SECURITY DEFINER) |
| `get_active_climbers_count()` | Active climber count |
| `get_community_contributors_count()` | Community contributor count |
| `get_community_photos_count()` | Publicly deliverable root-image count for active mapped crags; private, unready, variant, deleted-parent, and legacy gallery-only rows are excluded |
| `get_crags_mapped_count()` | Number of mapped crags |
| `get_boulders_with_gps_count()` | Boulder count with GPS data |
| `get_total_climbs_count()` | Total climbs count |
| `get_logbook_lifetime_stats(p_user_id)` | RLS-aware lifetime logbook counts by style |
| `get_total_sends_count()` | Total sends count |
| `get_total_logs_count()` | Total logs count |
| `log_routes_idempotent(...)` | Identity-bound, replay-safe climb logging with stale-write protection |
| `get_top_contributors(p_limit)` | Public-safe top contributor rows from public profiles |
| `get_visible_profile(p_user_id)` | Public-safe profile display, statistics, and active crag-maintainer badge state when the profile is visible |

### Submissions
| Function | Purpose |
|----------|---------|
| `create_unified_submission(...)` | Atomically create submission with images |
| `promote_draft_to_submission(draft_id)` | Promote draft to live submission |
| `repair_submission_draft_crag_country(draft_id, user_id, crag_id, latitude, longitude, country_code, country_name, region_name)` | Service-only fill after validating locked draft/crag identity and persisted coordinates |
| `delete_submission_draft_atomic(draft_id)` | Atomically delete an editable whole draft and eligible unassociated uploads |
| `delete_submission_draft_image_atomic(draft_id, draft_image_id, expected_updated_at)` | Atomically delete one draft image and update draft ordering/metadata |
| `delete_unassociated_upload_image(image_id)` | Delete an owned upload only if it has no content associations |
| `enqueue_failed_media_upload_copy_cleanup(image_id, staging_key, immutable_key)` | Delay cleanup of an immutable R2 copy after finalization fails; a retry cancels queued cleanup |
| `save_submission_draft_atomic(draft_id, expected_updated_at, images, route_sets, metadata, crag_id)` | Validate V2 payload, concurrency-check, and atomically save authoritative dirty route replacements, derived compatibility routes, complete image state/custom GPS, merged metadata/location, crag, and editor identity |
| `sync_submission_draft_routes(draft_id, draft_image_id, routes)` | Replace the durable draft route set for one image |
| `user_can_edit_submission_draft(draft_id, user_id)` | Permission check for draft editing |
| `list_submission_draft_collaborators(draft_id)` | Authorized draft membership rows with visibility-filtered profile display fields |
| `handle_submission_draft_promoted(...)` | Trigger handler for draft promotion |
| `claim_submission_collaborator_invite(token)` | Accept a submission collaboration invite |
| `claim_submission_draft_collaborator_invite(token)` | Accept a draft collaboration invite |
| `is_submission_collaborator(image_id, user_id)` | RLS helper: check submission collaboration |
| `is_submission_draft_collaborator(draft_id, user_id)` | RLS helper: check draft collaboration |
| `append_submission_draft_images_atomic(...)` | Atomic draft image append with caller ownership and exact authoritative-locator validation |
| `create_submission_routes_atomic(...)` | Internal legacy route creation primitive with no API-role execution grant |
| `create_submission_routes_service(user_id, image_id, crag_id, route_type, routes)` | Service-only identity-binding wrapper used by the validated existing-image Route Handler; the supplied user must exist |
| `assert_media_ready_for_publication(image_ids)` | Lock and validate public media readiness |
| `insert_pin_images_atomic(...)` | Atomic pin image insertion |
| `apply_published_submission_edit(image_id, client_mutation_id, operations)` | Authenticated-only atomic and idempotent published image metadata, route create/update, and grade-vote mutation; returns generated route mappings and the immutable revision commit ID |
| `rollback_wiki_entity_revision(target_revision_id, expected_head_revision_id, reason)` | Admin-only expected-head rollback that restores a canonical snapshot by appending a new immutable child revision |

### Grade Management
| Function | Purpose |
|----------|---------|
| `initialize_climb_consensus(p_climb_id)` | Initialize consensus grade for a climb |
| `initialize_climb_grade_vote(p_climb_id, p_user_id, p_grade)` | Service-role-only grade-vote initialization with an explicit user; no anon/authenticated grant |
| `insert_grade_vote(p_climb_id, vote_grade)` | Authenticated/service-role vote upsert bound internally to `auth.uid()`; no anon grant |
| `save_submission_grade_votes(p_image_id, p_grades)` | Retired submission vote helper with no API-role execution grant; published editor votes use `apply_published_submission_edit` |
| `sync_climb_grade_from_votes(p_climb_id)` | Recompute climb grade from votes |
| `add_correction_type_value(p_type, p_value)` | Dynamic correction type enum expansion |
| `normalize_climb_route_type(p_route_type)` | Normalize route type string |

### Crag Management
`crags.latitude` and `crags.longitude` are the canonical coordinates. They must
both be null or both be present and within valid latitude/longitude ranges.
`crags.location` is a stored generated `geography(Point, 4326)` derived from
that pair and has GiST indexes for distance queries and geometry viewport envelopes.
`get_nearby_crags` filters that geography with `ST_DWithin` and orders with the
GiST KNN operator. Its radius defaults to 10 km and is capped at 100 km; callers
may request at most 30 rows.

| Function | Purpose |
|----------|---------|
| `recompute_crag_counts(p_crag_id)` | Recompute image/route counts for a crag |
| `recompute_crag_location(p_crag_id)` | Recompute crag centroid from climbs/images |
| `refresh_crag_type_from_climbs(p_crag_id)` | Refresh crag type from child climbs |
| `increment_crag_report_count(p_crag_id)` | Increment crag report counter |
| `delete_empty_crag(p_crag_id, grace_period)` | Delete one strictly empty crag after the grace period |
| `delete_empty_crags(grace_period)` | Deterministically batch-delete strictly empty crags after the grace period |
| `soft_delete_crag(crag_id, reason, superseded_by)` | Admin-only audited crag/child-climb soft deletion |
| `soft_delete_climb(climb_id, reason, superseded_by)` | Admin-only audited climb soft deletion |
| `soft_delete_crag_image(crag_id, image_id, reason[, delete_routes])` | Admin-only crag-bound topo tombstoning; optional route soft deletion preserves user logs |
| `soft_delete_image(image_id, reason)` | Admin-only audited image tombstoning |
| `soft_delete_published_submission(image_ids, owner_id)` | Service-only owner submission tombstoning |
| `start_topo_replacement(crag_id, source_image_id, reason, client_mutation_id)` | Start or resume a manager-owned replacement draft while the source remains public |
| `set_topo_replacement_route_resolution(replacement_id, climb_id, resolution, draft_route_id)` | Map an existing climb to a saved replacement line or mark it not visible |
| `publish_topo_replacement(replacement_id)` | Atomically publish replacement media/geometry while preserving climb identities |

### Notifications
| Function | Purpose |
|----------|---------|
| `create_notification(p_target_user_id, p_type, p_title, p_message, p_link)` | Create notification for user (admin-only) |

### Utility
| Function | Purpose |
|----------|---------|
| `slugify(p_text)` | Generate URL-safe slug |
| `get_level(p_grade)` | Get difficulty level from grade |
| `soft_delete_comment(p_comment_id)` | Soft delete a comment |
| `cleanup_orphan_route_uploads(max_age, max_delete)` | Service-only cleanup of orphaned route uploads |
| `claim_media_job(worker_name, lease_seconds)` | Service-only fenced durable media-job claim with expired-lease recovery |
| `claim_media_job_for_image(worker_name, image_id, lease_seconds)` | Service-only targeted claim for Queue wake-ups |
| `complete_media_job(job_id, claim_token)` | Complete a currently owned ingest claim |
| `retry_media_job(job_id, claim_token, error)` | Requeue or terminally fail a media ingest claim with backoff |
| `fail_media_job(job_id, claim_token, error)` | Permanently fail invalid ingest work without overwriting canonical-ready state |
| `recover_media_ingest_jobs(snapshots, run_id, artifact_digest)` | Service-only exact-snapshot reviewed ingest recovery |
| `recover_media_deletion_jobs(snapshots, run_id, artifact_digest)` | Service-only exact-snapshot reviewed deletion recovery, excluding reconciled orphans |
| `commit_media_webp(...)` | Service-only atomic canonical WebP commit and gated original-deletion enqueue; returns the deletion job UUID |
| `verify_media_replacement_delivery(job_id, expected_optimized_key, media_job_id, claim_token)` | Service-only proof that canonical locators switched under the active ingest claim before source replacement becomes claimable |
| `claim_media_deletion_job(worker_name, lease_seconds)` | Service-only tokenized claim of due or lease-expired R2 deletion work |
| `complete_media_deletion_job(job_id, claim_token)` | Complete a currently owned media deletion claim |
| `retry_media_deletion_job(job_id, claim_token, error)` | Requeue or terminally fail a media deletion claim with backoff |
| `fail_media_deletion_job(job_id, claim_token, error)` | Permanently fail invalid deletion work |
| `prune_media_deletion_jobs(retention_days, max_delete)` | Bounded service-only pruning of completed/cancelled deletion jobs |
| `delete_account_atomic(p_user_id, p_email, p_delete_route_uploads)` | Service-only atomic account cleanup |
| `update_own_profile_submission_credit(...)` | Update profile submission credit |
| `update_own_submission_anonymity(...)` | Update submission anonymity |
| `update_own_submission_credit(...)` | Update submission credit |
| `update_own_submitted_routes(...)` | Update submitted routes |
| `propose_crag_metadata(...)` | Propose an existing active crag metadata change with rationale and immutable base head |
| `review_crag_metadata_proposal(...)` | Approve or reject an in-scope crag metadata proposal atomically |
| `set_crag_maintainer(...)` | Admin-only crag maintainer assignment or removal |
| `update_submission_crag_metadata(...)` | Legacy immediate-update RPC; authenticated execution revoked |
| `update_submission_image_order(...)` | Update image display order |

---

## 5. Migrations (The Safety Protocol)

### Truth Location
- All schema changes MUST be captured in `supabase/migrations/`
- NEVER edit Supabase dashboard directly; if unavoidable, backfill to migration immediately

### Workflow (Golden Path)

```bash
# Install the lockfile-pinned CLI, rebuild local from migrations, and regenerate types
npm ci --prefer-offline
npm --prefix apps/media-worker ci --prefer-offline
npx --no-install supabase start
npx --no-install supabase db reset
npx --no-install supabase gen types typescript --local > types/database.ts

# Verify the schema and affected surfaces
npm run typecheck
npm run test:database
npm --prefix apps/media-worker run check
bash docs/verify.sh
```

Linked database commands are maintainer deployment operations, not part of the local development workflow. The `Supabase Migrations` GitHub workflow runs a production dry-run for migration pushes to `main`; it does not apply them automatically. To apply, a maintainer manually dispatches that workflow with the current `main` commit SHA. The workflow verifies the SHA, repeats the dry-run, and then applies migrations. Production runs are serialized.

For local maintainer operations, select the intended hosted project, inspect the dry-run, and only then push:

```bash
npx --no-install supabase link --project-ref <project-ref>
npx --no-install supabase db push --linked --dry-run
npx --no-install supabase db push --linked
```

### Safety Rules
- **ALWAYS** run `--dry-run` before `db push`
- Only maintainers may link to or push migrations to hosted projects; verify the project ref before both commands
- **NEVER** use `DROP TABLE`, `TRUNCATE`, or `DELETE` in migrations
- Use `CREATE OR REPLACE` for functions instead of `DROP` + `CREATE`
- Review all migrations with `git diff supabase/migrations/`
- Safety migrations are forward-only; they define behavior for future operations and do not repair historical data unless a migration explicitly says so.
- Default privileges in `public` grant no table, sequence, or function access to `PUBLIC`, `anon`, or `authenticated`. Migrations must explicitly grant each intended API surface.
- `SECURITY DEFINER` functions start with API execution revoked. Re-grant only reviewed identity-bound RPCs, read-only public RPCs, or RLS helpers; leave trigger/internal helpers private and grant privileged operations only to `service_role`.

---

## 6. Supabase Client Patterns

### Server-Side (API Routes / Server Components)
```typescript
import { createServerClient } from '@supabase/ssr'

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
)
```

### Client-Side
```typescript
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### Auth Users (System Tables)
- Use RPC functions with `SECURITY DEFINER`
- Never query `auth.users` directly

### Type Generation
After any schema change, reset the local database and regenerate types from the migrations applied there:
```bash
npx --no-install supabase db reset
npx --no-install supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run test:database
```
Always verify affected app types against the new schema before writing UI code.

### Schema Drift Check
Maintainers may periodically verify a deliberately linked hosted project matches what migrations produce:
```bash
npx --no-install supabase db diff --linked
```
Any diff indicates drift — backfill missing migrations immediately.
