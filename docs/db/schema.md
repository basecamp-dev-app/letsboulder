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

| grade_index | V-Scale | Font | YDS | French | British |
|------------|---------|------|-----|--------|---------|
| 0 | VB | 3 | 5.6 | 4 | VB |
| 1 | V0 | 4 | 5.9 | 5 | V0 |
| ... | ... | ... | ... | ... | ... |
| 17 | V16 | 8C+ | 5.16a | 9b | E11 |

**Agent rule:** Always use `gradeMappings` for V ↔ Font ↔ YDS ↔ French ↔ British conversions.
**Boundary rule:** User-facing validation and selection must stay within `4A-9C+`, even though internal helpers may still model lower grades.

---

## 2. Relational Map (Cascade Logic)

### Core Relationships

| Parent | Child | Delete Behavior |
|--------|-------|-----------------|
| `crags` | `climbs` | **Refer to** `supabase/migrations/` for ON DELETE policy |
| `climbs` | `images` | **Refer to** `supabase/migrations/` for ON DELETE policy |
| `climbs` | `grade_votes` | Cascade delete |
| `users` | `posts` | Cascade delete |

**Agent rule:** Before any DELETE operation, check the migration files in `supabase/migrations/` to confirm ON DELETE behavior. Never assume cascade behavior.

### Media Pipeline Tables
- `images` now carries media-pipeline state in addition to legacy `url` storage fields.
- Canonical first-sprint columns include `storage_provider`, `original_bucket`, `original_key`, `asset_version`, `variants`, `visibility`, `processing_status`, `checksum_sha256`, and `processed_at`.
- `submission_draft_images` mirrors the provider-aware original reference with `storage_provider`, `original_bucket`, `original_key`, `preview_variants`, `processing_status`, and `processed_at`.
- `media_jobs` is the async ingest queue table for the separate Node worker service. Service-role access only.
- `claim_media_job(worker_name text)` atomically locks the next due queued media job for the worker.

### Auth Tables
- **System tables:** Use RPC functions with `SECURITY DEFINER` for `auth.users` queries
- **Reference:** `get_user_count()` function in database

### Analytics RPCs
- `get_star_rating_summary(p_climb_id uuid)` returns per-route average star rating and rating count.
- `get_crag_route_intelligence(p_crag_id uuid)` returns per-route crag discovery metrics: directions, topo coverage, weighted rating, and unique sender counts.

---

## 3. Migrations (The Safety Protocol)

### Truth Location
- All schema changes MUST be captured in `supabase/migrations/`
- NEVER edit Supabase dashboard directly; if unavoidable, backfill to migration immediately

### Workflow (Golden Path)

```bash
# Local
supabase start
npm run db:local:up

# Dev
npm run db:push:dev:dry
npm run db:push:dev

# Prod
npm run db:push:prod:dry
npm run db:push:prod
```

### Safety Rules
- **ALWAYS** run `--dry-run` before `db push`
- **NEVER** use `DROP TABLE`, `TRUNCATE`, or `DELETE` in migrations
- Use `CREATE OR REPLACE` for functions instead of `DROP` + `CREATE`
- Review all migrations with `git diff supabase/migrations/`

---

## 4. Supabase Client Patterns

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

---

<next_steps>
  - Review schema.md every 60 days
  - Run `supabase gen types` after any schema change
</next_steps>
