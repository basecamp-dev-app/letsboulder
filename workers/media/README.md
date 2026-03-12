# Media Worker (Legacy)

The polling Node worker in this directory is now legacy.

Active media ingest and delivery are moving to the Cloudflare Worker in `apps/media-worker`.

This legacy worker:
- uses `public.media_jobs` polling
- generates Sharp-based physical variants
- remains in the repo only as a migration reference until Cloudflare cutover is complete
