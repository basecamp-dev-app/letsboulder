# Database Schema - letsboulder.com

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
| 0 | VB | 3A | 5.4 | 3 | M | Beginner |
| 1 | VB | 3A+ | 5.5 | 3+ | M | Beginner |
| 2 | VB | 3B | 5.5 | 3+ | D | Beginner |
| 3 | VB | 3B+ | 5.6 | 4- | VD | Beginner |
| 4 | VB | 3C | 5.6 | 4- | VD | Beginner |
| 5 | VB | 3C+ | 5.6 | 4 | VD | Beginner |
| 6 | VB | 4A | 5.7 | 4 | VD | Beginner |
| 7 | V0 | 4A+ | 5.9 | 5 | D | Beginner |
| 8 | V0 | 4B | 5.9 | 5+ | D | Beginner |
| 9 | V0 | 4B+ | 5.10a | 6a | HVD | Intermediate |
| 10 | V1 | 4C | 5.10a | 6a | S | Intermediate |
| 11 | V1 | 4C+ | 5.10b | 6a+ | VS | Intermediate |
| 12 | V1 | 5A | 5.10b | 6a+ | HVS | Intermediate |
| 13 | V2 | 5A+ | 5.10c | 6b | E1 | Intermediate |
| 14 | V2 | 5B | 5.10c | 6b | E1 | Intermediate |
| 15 | V2 | 5B+ | 5.10d | 6b | E2 | Intermediate |
| 16 | V2 | 5C | 5.10d | 6b+ | E2 | Intermediate |
| 17 | V3 | 5C+ | 5.11a | 6b+ | E3 | Intermediate |
| 18 | V3 | 6A | 5.11a | 6b | E3 | Intermediate |
| 19 | V3 | 6A+ | 5.11b | 6b+ | E3 | Advanced |
| 20 | V4 | 6B | 5.11c | 6c | E4 | Advanced |
| 21 | V4 | 6B+ | 5.11d | 6c+ | E4 | Advanced |
| 22 | V5 | 6C | 5.12a | 7a | E5 | Advanced |
| 23 | V5 | 6C+ | 5.12b | 7a+ | E6 | Advanced |
| 24 | V6 | 7A | 5.12b | 7a+ | E6 | Advanced |
| 25 | V6 | 7A+ | 5.12c | 7b | E7 | Expert |
| 26 | V7 | 7B | 5.13a | 7c | E8 | Expert |
| 27 | V8 | 7B+ | 5.13b | 7c+ | E9 | Expert |
| 28 | V9 | 7C | 5.13c | 7c+ | E9 | Expert |
| 29 | V10 | 7C+ | 5.14a | 8a | E10 | Elite |
| 30 | V11 | 8A | 5.14a | 8a | E10 | Elite |
| 31 | V12 | 8A+ | 5.14c | 8a+ | E11 | Elite |
| 32 | V13 | 8B | 5.15a | 8b | E11 | Elite |
| 33 | V14 | 8B+ | 5.15b | 8c | E11 | Elite |
| 34 | V15 | 8C | 5.15c | 9a | E11 | Elite |
| 35 | V16 | 8C+ | 5.15d | 9a+ | E11 | Elite |
| 36 | V17 | 9A | 5.15d | 9a+ | E11 | Elite |
| 37 | V17 | 9A+ | 5.16a | 9b | E11 | Elite |
| 38 | V18 | 9B | 5.16a | 9b+ | E11 | Elite |
| 39 | V18 | 9B+ | 5.16b | 9c | E12 | Elite |
| 40 | V19 | 9C | 5.16c | 9c+ | E12 | Elite |
| 41 | V19 | 9C+ | 5.16d | 9c+ | E13 | Elite |

**Agent rule:** Always use `gradeMappings` for V-Scale <-> Font <-> YDS <-> French <-> British conversions.
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

### Community Tables
| Table | Purpose |
|-------|---------|
| `grade_votes` | Community grade consensus voting |
| `climb_flags` | Flagged climbs for moderation |
| `image_flags` | Flagged images for moderation |
| `climb_corrections` | Route correction requests |
| `correction_votes` | Votes on corrections |
| `community_posts` | Community session/conditions/question/update posts |
| `community_post_comments` | Comments on community posts |
| `community_post_rsvps` | RSVPs for session posts |
| `notifications` | User notifications |

### Submission Tables
| Table | Purpose |
|-------|---------|
| `submission_drafts` | Draft submissions with metadata |
| `submission_draft_images` | Images attached to drafts (storage-aware) |
| `submissions` | Promoted/live submissions |
| `crag_images` | Multi-image crag gallery |

### Gym Tables
| Table | Purpose |
|-------|---------|
| `gym_owner_applications` | Gym owner application workflow |
| `gym_memberships` | User gym memberships |
| `gym_floor_plans` | Gym floor plan images |
| `gym_routes` | Indoor gym routes |
| `gym_route_markers` | Route markers on floor plans |

### Logging & Media
| Table | Purpose |
|-------|---------|
| `logs` | User climb log entries (flash/top/try) |
| `media_jobs` | Legacy media processing queue (retired) |
| `climb_video_betas` | Video beta links for climbs |

---

## 3. Relational Map (Cascade Logic)

### Core Relationships

| Parent | Child | Delete Behavior |
|--------|-------|-----------------|
| `crags` | `climbs` | **Refer to** `supabase/migrations/` for ON DELETE policy |
| `climbs` | `images` | **Refer to** `supabase/migrations/` for ON DELETE policy |
| `climbs` | `grade_votes` | Cascade delete |
| `crags` | `sectors` | **Refer to** `supabase/migrations/` |
| `crags` | `crag_images` | **Refer to** `supabase/migrations/` |
| `users` | `community_posts` | Cascade delete |
| `users` | `logs` | Cascade delete |
| `users` | `notifications` | Cascade delete |
| `users` | `gym_memberships` | Cascade delete |
| `submission_drafts` | `submission_draft_images` | Cascade delete |
| `submissions` | `images` | **Refer to** `supabase/migrations/` |

**Agent rule:** Before any DELETE operation, check the migration files in `supabase/migrations/` to confirm ON DELETE behavior. Never assume cascade behavior.

### Media Pipeline Tables
- `images` carries media-pipeline state in addition to legacy `url` storage fields.
- Key columns: `storage_provider`, `original_bucket`, `original_key`, `asset_version`, `variants`, `visibility`, `processing_status`, `checksum_sha256`, `processed_at`, `latitude`, `longitude`.
- `submission_draft_images` mirrors the provider-aware original reference.
- `media_jobs` and `claim_media_job(worker_name text)` are legacy artifacts from the retired polling Node worker.
- Active ingest runs through Cloudflare Queue + the Worker in `apps/media-worker`; `images` remains the source of truth.

### Auth Tables
- **System tables:** Use RPC functions with `SECURITY DEFINER` for `auth.users` queries
- **Reference:** `get_user_count()` function in database

---

## 4. RPC Functions

### Map & Discovery
| Function | Returns |
|----------|---------|
| `get_crag_pins()` | All crag pin locations for map clustering |
| `get_crag_route_intelligence(p_crag_id)` | Per-route metrics: directions, topo coverage, weighted rating, unique sender counts |
| `get_upload_context(lat, lng)` | Country/region context from coordinates |

### Submissions
| Function | Returns |
|----------|---------|
| `create_unified_submission(...)` | Atomically create submission with images |
| `promote_draft(draft_id)` | Promote draft to live submission |
| `user_can_edit_submission_draft(draft_id, user_id)` | Permission check for draft editing |
| `handle_submission_draft_promoted(...)` | Trigger handler for draft promotion |

### Analytics
| Function | Returns |
|----------|---------|
| `get_star_rating_summary(p_climb_id)` | Per-route average star rating and count |
| `get_user_count()` | Total user count (SECURITY DEFINER) |

### Geography
| Function | Returns |
|----------|---------|
| `get_upload_context(lat, lng)` | Country/region from coordinates (PostGIS) |

---

## 5. Migrations (The Safety Protocol)

### Truth Location
- All schema changes MUST be captured in `supabase/migrations/`
- NEVER edit Supabase dashboard directly; if unavoidable, backfill to migration immediately

### Workflow (Golden Path)

```bash
# Local — apply migrations and seed
supabase start

# Dev — dry-run then push
supabase db push --linked --dry-run
supabase db push --linked

# Prod — dry-run then push (link to prod project first)
supabase link --project-ref <prod-ref>
supabase db push --linked --dry-run
supabase db push --linked
```

### Safety Rules
- **ALWAYS** run `--dry-run` before `db push`
- **NEVER** use `DROP TABLE`, `TRUNCATE`, or `DELETE` in migrations
- Use `CREATE OR REPLACE` for functions instead of `DROP` + `CREATE`
- Review all migrations with `git diff supabase/migrations/`

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
After any schema change, regenerate types:
```bash
supabase gen types typescript --local > types/database.ts
```
Always verify affected app types against the new schema before writing UI code.
