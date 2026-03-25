# Database Schema - letsboulder.com

## 1. Grade System (The "4A Floor")

### Floor Grade
- **User-facing minimum:** `4A`
- **User-facing maximum:** `9C+`
- **Public source of truth:** `@/lib/grade-constants.ts`

### Conversion Engine
`@/lib/grade-constants.ts` defines the public valid/selectable grade range.
`@/lib/grades.ts` defines cross-system mappings and internal grade utilities.

The `gradeMappings` table in `@/lib/grades.ts` is the source of truth for cross-system conversion:

| grade_index | V-Scale | Font | YDS | French | British | Difficulty |
|------------|---------|------|-----|--------|---------|------------|
| 0 | VB | 3 | 5.6 | 4 | VB | Beginner |
| 1 | V0 | 4 | 5.9 | 5 | V0 | Beginner |
| 2 | V1 | 5 | 5.10a | 6a | E1 | Intermediate |
| 3 | V2 | 5+ | 5.10c | 6a+ | E2 | Intermediate |
| 4 | V3 | 6A | 5.11a | 6b | E3 | Intermediate |
| 5 | V4 | 6B | 5.11c | 6c | E4 | Advanced |
| 6 | V5 | 6C | 5.12a | 7a | E5 | Advanced |
| 7 | V6 | 6C+ | 5.12b | 7a+ | E6 | Advanced |
| 8 | V7 | 7A | 5.13a | 7b | E7 | Expert |
| 9 | V8 | 7B | 5.13b | 7c | E8 | Expert |
| 10 | V9 | 7B+ | 5.13c | 7c+ | E9 | Expert |
| 11 | V10 | 7C | 5.14a | 8a | E10 | Elite |
| 12 | V11 | 8A | 5.14c | 8a+ | E11 | Elite |
| 13 | V12 | 8A+ | 5.15a | 8b | E11 | Elite |
| 14 | V13 | 8B | 5.15b | 8c | E11 | Elite |
| 15 | V14 | 8B+ | 5.15c | 9a | E11 | Elite |
| 16 | V15 | 8C | 5.15d | 9a+ | E11 | Elite |
| 17 | V16 | 8C+ | 5.16a | 9b | E11 | Elite |

**Agent rule:** Always use `gradeMappings` for V-Scale <-> Font <-> YDS <-> French <-> British conversions.
**Boundary rule:** User-facing validation and selection must stay within `4A-9C+`, even though internal helpers may still model lower grades.

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
