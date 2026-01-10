# Database Setup

## Schema (Image-Centric)

```
images (one pin per photo with GPS)
  └── route_lines (routes drawn on image)
        └── climbs (name, grade, status)
```

## Local Development with Supabase CLI

```bash
# Start local Supabase
supabase start

# Reset local database
supabase db reset --yes

# View local Studio
# Open http://localhost:54323

# Push schema changes to production
supabase db push
```

## Migration Files

```
supabase/migrations/
  └── 20260110180000_image_centric_schema.sql  # New image-centric schema
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `regions` | Geographic areas (seeded with 27 worldwide) |
| `crags` | Climbing areas with fixed GPS |
| `images` | Photos with GPS (one pin per image) |
| `climbs` | Route metadata (name, grade, status) |
| `route_lines` | Links climbs to images with coordinates |

## Supabase CLI

```bash
# Link to project
supabase link --project-ref glxnbxbkedeogtcivpsx

# Push migrations to production
supabase db push

# Pull schema from production
supabase db pull

# View status
supabase status
```
