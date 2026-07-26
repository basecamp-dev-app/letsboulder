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
| `crags` | Climbing locations with PostGIS geometry, country/region references |
| `climbs` | Individual routes/problems with grade, name, crag reference |
| `images` | Route photos with media-pipeline state, moderation, GPS coordinates |
| `profiles` | User profiles (username, avatar, is_admin) |
| `places` | Unified location entity (crags + gyms) |
| `sectors` | Sub-areas within crags |
| `countries` | Country data with ISO codes and PostGIS boundaries |
| `regions` | Regional groupings within countries |
| `continents` | Continental groupings |
| `comments` | User comments on crags, images, climbs (soft-deletable) |
| `route_lines` | Route line geometry drawn on images |
| `user_climbs` | User climb logs (flash/top/try) with star ratings and grade opinions |
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
| `climb_flags` | Flagged climbs for moderation |
| `climb_corrections` | Route correction requests with voting |
| `correction_votes` | Votes on climb corrections |
| `crag_reports` | User reports on crags (access, safety, etc.) |
| `admin_actions` | Admin audit log of moderation actions |

### Submission Tables
| Table | Purpose |
|-------|---------|
| `submission_drafts` | Draft submissions with metadata |
| `submission_draft_images` | Images attached to drafts (storage-aware) |
| `submission_draft_routes` | Durable per-image draft routes for image-scoped sync |
| `crag_images` | Multi-image crag gallery |
| `submission_collaborators` | Legacy invite-based published collaboration rows; no longer required for published wiki editing |
| `submission_collaborator_invites` | Legacy token-based invites for published collaboration |
| `submission_draft_collaborators` | Shared editing access on drafts |
| `submission_draft_collaborator_invites` | Token-based invites for draft collaboration |
| `submission_contributors` | Non-owner users who have successfully edited a published submission |
| `submission_edit_history` | Per-image history log for published wiki edits |

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
| `images` | `climb_flags` | CASCADE |
| `images` | `media_jobs` | CASCADE |
| `images` | `route_lines` | CASCADE |
| `images` | `submission_collaborators` | CASCADE |
| `images` | `submission_collaborator_invites` | CASCADE |
| `images` | `submission_contributors` | CASCADE |
| `images` | `submission_edit_history` | CASCADE |
| `climbs` | `climb_corrections` | CASCADE |
| `climbs` | `climb_flags` | CASCADE |
| `climbs` | `climb_verifications` | CASCADE |
| `climbs` | `climb_video_betas` | CASCADE |
| `climbs` | `grade_votes` | CASCADE |
| `climbs` | `route_grades` | CASCADE |
| `climbs` | `route_lines` | CASCADE |
| `climbs` | `saved_climbs` | CASCADE |
| `climbs` | `user_climbs` | CASCADE |
| `climbs` | `climbs` (self-ref via shared_climb_id) | SET NULL |
| `crags` | `saved_crags` | CASCADE |
| `submission_drafts` | `submission_draft_images` | CASCADE |
| `submission_drafts` | `submission_draft_routes` | CASCADE |
| `submission_drafts` | `submission_draft_collaborators` | CASCADE |
| `submission_drafts` | `submission_draft_collaborator_invites` | CASCADE |
| `submission_draft_images` | `submission_draft_routes` | CASCADE |
| `countries` | `crags` | SET NULL |
| `countries` | `places` | SET NULL |
| `countries` | `images` | no action |
| `regions` | `countries` | SET NULL |
| `crags` | `climb_flags` | SET NULL |
| `crags` | `comments` | Trigger soft-delete (crag) |
| `images` | `comments` | Trigger soft-delete (image) |
| `climbs` | `comments` | Trigger soft-delete (climb) |
| `location_tags` | `crag_location_tags` | CASCADE |
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

### Media Pipeline Tables
- `images` carries media-pipeline state in addition to legacy `url` storage fields.
- Key columns: `storage_provider`, `original_bucket`, `original_key`, `asset_version`, `variants`, `visibility`, `processing_status`, `checksum_sha256`, `processed_at`, `latitude`, `longitude`.
- `images.submission_id` is a logical submission-group identifier used by publication, grouping, editing, deletion, and monitoring code. No `submissions` table or FK constraint backs it, so application and RPC code must preserve its grouping invariants explicitly.
- `submission_draft_images` mirrors the provider-aware original reference.
- `submission_draft_routes` stores durable draft route geometry and metadata. Explicit Save persists dirty images through image-scoped bulk sync instead of relying on `submission_draft_images.route_data` as the primary store.
- `media_jobs` is the durable outbox for active media ingest. Upload completion calls `queue_media_ingest_job(...)` to update `images` and insert/reuse a queued job atomically.
- `claim_media_job(worker_name text)` is used by the Cloudflare Worker scheduled handler to claim pending ingest work. Cloudflare Queue ingress remains as a compatibility path, but the durable outbox is the source of truth for app-owned uploads.
- Active ingest runs through `media_jobs` + the Worker in `apps/media-worker`; `images` remains the source of truth.
- Canonical publishability is `processing_status = 'ready'` and `moderation_status IN ('approved', 'skipped')`. Public delivery or association additionally requires `visibility = 'public'` and legacy `status = 'approved'`.
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
- `submission_edit_history` stores field-aware, per-image edit history for published submissions.
- `submission_draft_collaborators` and `submission_draft_collaborator_invites` continue to enable shared editing on drafts.
- RLS helper functions: `is_submission_collaborator(image_id, user_id)` and `is_submission_draft_collaborator(draft_id, user_id)`.
- Wiki helper function: `user_can_wiki_edit_submission(image_id, user_id)`.
- Invite claims: `claim_submission_collaborator_invite(token)` and `claim_submission_draft_collaborator_invite(token)`.

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
| `images` | existing + collaborator read | existing | existing | admin policy or guarded RPC |

**Key security notes:**
- `promote_draft_to_submission` is `SECURITY DEFINER`, requires the locked draft's owner, and is the only path allowed to transition a draft to `submitted`; direct draft UPDATE policies require both old and new status to remain `draft`.
- `repair_submission_draft_crag_country` is `SECURITY DEFINER` and executable only by `service_role`; the publish route resolves coordinates through the atlas with a Nominatim fallback before calling it. It is defined in `20260725160200_repair_draft_crag_country.sql`.
- `handle_submission_draft_promoted` trigger is `SECURITY DEFINER` and fires on draft→submitted status change. The UPDATE policy on `submission_drafts` gates who can trigger this transition.
- `is_submission_collaborator` and `is_submission_draft_collaborator` are `SECURITY DEFINER` — appropriate for RLS helpers reading `auth.uid()`.
- The active canonical `promote_draft_to_submission` definition is in `20260725160000_forward_publication_safety.sql`; active atomic deletion definitions are in `20260725160050_atomic_draft_deletion.sql` and `20260725160100_atomic_draft_image_deletion.sql`, with grants and RLS tightened by `20260725160150_draft_deletion_permissions.sql`. Do not use the older archived promotion definition as the current reference.
- `delete_submission_draft_atomic` deletes an editable owner draft and conditionally unreferenced owner uploads in one transaction. `delete_submission_draft_image_atomic` locks the draft, validates the expected timestamp, locks all attachments and the linked image, then atomically deletes one attachment, compacts ordering and metadata, and conditionally deletes the now-unreferenced upload.
- Direct owner DELETE policies are removed from `images`, `submission_drafts`, and `submission_draft_images`. Destructive owner operations must use the guarded RPCs; the separate image admin policy remains available for explicit administration.

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
| `trg_submission_draft_promoted_handoff` | submission_drafts | Handle draft→submission promotion |
| `*_updated_at` | media_jobs, submission_drafts, submission_draft_images | Timestamp touch |

### Bidirectional Sync Guards (crags ↔ places)
The `crags_sync_to_places_after_write` and `places_sync_to_crags_after_write` triggers maintain bidirectional sync between `crags` and `places` tables. Both use dual-layer guards to prevent infinite loops:

- **Guard 1:** `pg_trigger_depth() > 1` — prevents direct trigger recursion
- **Guard 2:** `synced_at` comparison — skips sync if row was just updated by the other trigger (prevents indirect loops)

Both `crags` and `places` have a `synced_at TIMESTAMPTZ` column. When a sync operation completes, it sets `synced_at = NOW()`. The receiving trigger detects this change and returns early, breaking the loop.

Non-delete synchronization remains bidirectional. Delete synchronization is intentionally one-way: deleting a `crags` row removes its paired `places` projection, while deleting a `places` row never deletes the source crag.

### Empty Crag Cleanup
- A crag is empty only when no row references either the crag directly (`images`, `climbs`, `submission_drafts`, `crag_images`, `sectors`, `crag_reports`, `climb_flags`, `crag_location_tags`, `saved_crags`, `contribution_events`, `contribution_bounties`, or polymorphic crag `comments`) or its paired place (`climbs`, `images`, `community_place_follows`, `community_posts`, `gym_floor_plans`, `gym_memberships`, `gym_routes`, `contribution_events`, `contribution_bounties`, or `user_place_contributor_scores`).
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
| `get_place_pins(include_pending)` | Map pins for crags and gyms with route/image metadata in one query |
| `get_crag_route_intelligence(p_crag_id)` | Per-route metrics: directions, topo coverage, weighted rating, unique sender counts |
| `get_upload_context(lat, lng)` | Country/region context from coordinates |
| `find_region_by_location(lat, lng)` | Find region by GPS coordinates |
| `get_consensus_grade(p_climb_id)` | Compute consensus grade for a climb |
| `get_climbs_with_consensus()` | Batch fetch climbs with consensus grades |
| `get_climb_full_context(p_climb_id)` | Full climb data with faces, routes, stats |
| `get_crag_faces_complete_summary(p_crag_id)` | Multi-face summary for a crag |
| `get_image_faces_summary(p_image_id)` | Face data for an image |
| `get_effective_climb_id(p_climb_id)` | Resolve climb ID through shared_climb_id chain |

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
| `get_community_photos_count()` | Community photo count |
| `get_crags_mapped_count()` | Number of mapped crags |
| `get_boulders_with_gps_count()` | Boulder count with GPS data |
| `get_total_climbs_count()` | Total climbs count |
| `get_logbook_lifetime_stats(p_user_id)` | RLS-aware lifetime logbook counts by style |
| `get_total_sends_count()` | Total sends count |
| `get_total_logs_count()` | Total logs count |

### Submissions
| Function | Purpose |
|----------|---------|
| `create_unified_submission(...)` | Atomically create submission with images |
| `promote_draft_to_submission(draft_id)` | Promote draft to live submission |
| `repair_submission_draft_crag_country(draft_id, user_id, crag_id, latitude, longitude, country_code, country_name, region_name)` | Service-only fill after validating locked draft/crag identity and persisted coordinates |
| `delete_submission_draft_atomic(draft_id)` | Atomically delete an editable whole draft and eligible unassociated uploads |
| `delete_submission_draft_image_atomic(draft_id, draft_image_id, expected_updated_at)` | Atomically delete one draft image and update draft ordering/metadata |
| `delete_unassociated_upload_image(image_id)` | Delete an owned upload only if it has no content associations |
| `sync_submission_draft_routes(draft_id, draft_image_id, routes)` | Replace the durable draft route set for one image |
| `user_can_edit_submission_draft(draft_id, user_id)` | Permission check for draft editing |
| `handle_submission_draft_promoted(...)` | Trigger handler for draft promotion |
| `claim_submission_collaborator_invite(token)` | Accept a submission collaboration invite |
| `claim_submission_draft_collaborator_invite(token)` | Accept a draft collaboration invite |
| `is_submission_collaborator(image_id, user_id)` | RLS helper: check submission collaboration |
| `is_submission_draft_collaborator(draft_id, user_id)` | RLS helper: check draft collaboration |
| `append_submission_draft_images_atomic(...)` | Atomic draft image append |
| `create_submission_routes_atomic(...)` | Atomic route creation |
| `assert_media_ready_for_publication(image_ids)` | Lock and validate public media readiness |
| `insert_pin_images_atomic(...)` | Atomic pin image insertion |

### Grade Management
| Function | Purpose |
|----------|---------|
| `initialize_climb_consensus(p_climb_id)` | Initialize consensus grade for a climb |
| `initialize_climb_grade_vote(p_climb_id, p_user_id)` | Initialize grade vote for a climb |
| `insert_grade_vote(p_climb_id, p_user_id, p_grade)` | Insert or update grade vote |
| `sync_climb_grade_from_votes(p_climb_id)` | Recompute climb grade from votes |
| `add_correction_type_value(p_type, p_value)` | Dynamic correction type enum expansion |
| `normalize_climb_route_type(p_route_type)` | Normalize route type string |

### Crag Management
| Function | Purpose |
|----------|---------|
| `recompute_crag_counts(p_crag_id)` | Recompute image/route counts for a crag |
| `recompute_crag_location(p_crag_id)` | Recompute crag centroid from climbs/images |
| `refresh_crag_type_from_climbs(p_crag_id)` | Refresh crag type from child climbs |
| `increment_crag_report_count(p_crag_id)` | Increment crag report counter |
| `delete_empty_crag(p_crag_id, grace_period)` | Delete one strictly empty crag after the grace period |
| `delete_empty_crags(grace_period)` | Deterministically batch-delete strictly empty crags after the grace period |

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
| `cleanup_orphan_route_uploads()` | Clean up orphaned route uploads |
| `update_own_profile_submission_credit(...)` | Update profile submission credit |
| `update_own_submission_anonymity(...)` | Update submission anonymity |
| `update_own_submission_credit(...)` | Update submission credit |
| `update_own_submitted_routes(...)` | Update submitted routes |
| `update_submission_crag_metadata(...)` | Update crag metadata on submission |
| `update_submission_image_order(...)` | Update image display order |

---

## 5. Migrations (The Safety Protocol)

### Truth Location
- All schema changes MUST be captured in `supabase/migrations/`
- NEVER edit Supabase dashboard directly; if unavoidable, backfill to migration immediately

### Workflow (Golden Path)

```bash
# Install the lockfile-pinned CLI, rebuild local from migrations, and regenerate types
npm install
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts

# Verify the schema and affected surfaces
npm run typecheck
npm run test:database
npm --prefix apps/media-worker run check
bash docs/verify.sh
```

Linked database commands are maintainer deployment operations, not part of the local development workflow. Maintainers must select the intended hosted project, inspect the dry-run, and only then push:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

### Safety Rules
- **ALWAYS** run `--dry-run` before `db push`
- Only maintainers may link to or push migrations to hosted projects; verify the project ref before both commands
- **NEVER** use `DROP TABLE`, `TRUNCATE`, or `DELETE` in migrations
- Use `CREATE OR REPLACE` for functions instead of `DROP` + `CREATE`
- Review all migrations with `git diff supabase/migrations/`
- Safety migrations are forward-only; they define behavior for future operations and do not repair historical data unless a migration explicitly says so.

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
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run test:database
```
Always verify affected app types against the new schema before writing UI code.

### Schema Drift Check
Maintainers may periodically verify a deliberately linked hosted project matches what migrations produce:
```bash
npx supabase db diff --linked
```
Any diff indicates drift — backfill missing migrations immediately.
