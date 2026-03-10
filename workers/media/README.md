# Media Worker

This worker is the separate Node service that will own async image ingest jobs.

Current sprint scope:
- claims `public.media_jobs` via `claim_media_job`
- runs moderation before publication
- generates fixed image variants with Sharp
- publishes approved or skipped variants to the public R2 bucket
- runs in observe-only mode when `MEDIA_WORKER_EXECUTE_JOBS=false`

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment variables:
- `MEDIA_WORKER_ID`
- `MEDIA_WORKER_POLL_INTERVAL_MS`
- `MEDIA_WORKER_EXECUTE_JOBS`

Run locally:

```bash
npm run media-worker
```

Next sprint:
- wire uploaders to upload-session endpoints
- replace private preview URLs with R2 signed URLs
- move public reads to CDN-first resolution
