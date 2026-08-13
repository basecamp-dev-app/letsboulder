# API Routes

## Summary

| Route Group | Description | Auth | CSRF |
| --- | --- | --- | --- |
| admin | Admin gym setup and image/crag management | Yes (admin) | Yes |
| auth | Authentication operations (sign out) | Yes | Yes |
| climbs | Individual climb data and operations | Optional | Yes |
| comments | Public comment reads and authenticated comment creation | Optional | Yes |
| community | Public place-community query endpoints | No | No |
| corrections | Route correction requests and voting | Yes | Yes |
| crags | Crag CRUD, search, nearby, pins, reports, images, sectors | Optional | Yes |
| csrf | User-bound CSRF token and cookie issuance | Yes | No |
| diagnostics | Temporary authenticated diagnostics for Android image GPS extraction | Yes | Yes |
| dev-logger | Local-development browser log bridge | Effectively yes | Yes |
| feedback | Rate-limited user feedback submission | Effectively yes | Yes |
| flags | Admin flag queue listing and resolution | Yes (admin) | Yes |
| gym-admin | Gym admin operations | Yes | Yes |
| image-first | Image-first route page support endpoints | No | No |
| images | Image detail, related faces, deletion, and flags | Optional | Yes |
| location-tags | Public region/sub-area tag search | No | No |
| locations | Geo detection, reverse geocoding, search | No | No |
| logbook | User logbook queries | Yes | No |
| media | Media serving, upload sessions, private media proxy | Optional | Yes |
| notifications | Authenticated notification reads | Yes | No |
| offline-packs | Versioned public crag-pack manifests | No | No |
| offline-tiles | Retirement-only legacy raster tile proxy | No | No |
| places | Place management, nearby search, search | Optional | Yes |
| profile | User profile operations | Yes | Yes |
| rankings | Rankings data | No | No |
| regions | Region data | No | No |
| routes | Legacy direct route submission and consensus-grade voting | Optional | Yes |
| settings | User settings | Yes | Yes |
| social | Instagram post export | Yes (admin) | Yes |
| submissions | Submission creation plus draft lifecycle, media association, collaboration, route sync, and publish | Optional reads; Yes writes | Yes |
| test | Non-production API-key-gated test auth | Test key | No |
| uploads | Presigned upload URL generation | Yes | Yes |
| welcome-email | Welcome email trigger | Yes | Yes |

CSRF applies to mutating requests unless explicitly exempted. Because `/api/csrf` issues tokens only to an authenticated cookie session, a route configured with `requireUser: false` but default CSRF is still effectively authenticated for browser mutations. Public read endpoints may live in a group with authenticated writes.

Public crag galleries and image-face responses contain only publicly deliverable linked media or individually reviewed legacy gallery rows. They return viewable public or signed URLs and never raw `private://` storage references.

## Endpoint Inventory

This is the canonical path inventory for route handlers under `app/api/**/route.ts`. Methods and security behavior remain documented in the group details below and are not inferred by the documentation verifier.

<!-- API ROUTES START -->
```text
/api/admin/gyms
/api/admin/gyms/[id]/floor-plan
/api/admin/gyms/[id]/starter-routes
/api/admin/images/[imageId]/move-crag
/api/auth/signout
/api/climbs/[id]/correction
/api/climbs/[id]/recent-tops
/api/climbs/[id]/star-rating
/api/climbs/[id]/status
/api/climbs/[id]/verify
/api/climbs/[id]/video-betas
/api/comments
/api/community/places/[slug]/contributors
/api/community/places/[slug]/posts
/api/community/places/[slug]/rankings
/api/community/places/[slug]/recent-sends
/api/community/posts/[postId]/engagement
/api/corrections/[id]/vote
/api/crags
/api/crags/[id]
/api/crags/[id]/contributors
/api/crags/[id]/images
/api/crags/[id]/images/attach
/api/crags/[id]/rankings
/api/crags/[id]/sectors
/api/crags/nearby
/api/crags/pins
/api/crags/search
/api/crags/search-by-id
/api/csrf
/api/dev-logger
/api/diagnostics/image-gps
/api/feedback
/api/flags
/api/flags/[id]/resolve
/api/gym-admin/gyms
/api/gym-admin/gyms/[id]/starter-routes
/api/image-first/images
/api/image-first/community-notes
/api/image-first/pins
/api/images/[id]
/api/images/[id]/faces
/api/images/[id]/flags
/api/images/search
/api/location-tags/search
/api/locations/detect
/api/locations/reverse
/api/locations/search
/api/logbook/contributions
/api/media/[bucket]/[...path]
/api/media/private
/api/media/upload-sessions
/api/media/upload-sessions/[imageId]
/api/media/upload-sessions/[imageId]/complete
/api/notifications
/api/offline-packs/crags/[cragId]/manifest
/api/offline-tiles/[layer]/[z]/[x]/[y]
/api/places
/api/places/nearby
/api/places/search
/api/profile
/api/rankings
/api/regions/by-location
/api/regions/search
/api/routes/[id]/grades
/api/routes/submit
/api/settings/delete
/api/settings/initiate-delete
/api/social/instagram
/api/submissions
/api/submissions/collaborate/[token]
/api/submissions/drafts/[id]
/api/submissions/drafts/[id]/images
/api/submissions/drafts/[id]/images/[imageId]
/api/submissions/drafts/[id]/publish
/api/submissions/drafts/[id]/routes
/api/submissions/drafts/collaborate/[token]
/api/test/[segment]/auth
/api/uploads/signed-url
/api/uploads/signed-urls/batch
/api/welcome-email
```
<!-- API ROUTES END -->

## Route Group Details

### admin

Admin operations for gym creation/floor plans/starter routes and moving images between crags. Restricted to authenticated admins; state changes use CSRF protection. User-report review is handled by the separate `flags` group.

### climbs

Individual climb data and operations. Read operations are public; write operations require authentication. Uses CSRF protection.

### comments

Comments on crags, images, and climbs. GET is public and supports target/category pagination; POST requires authentication and CSRF. This is separate from session-post comments, which use community Server Actions.

### community

Public read-only community data organized under places. App-owned post, RSVP, and comment writes use Server Actions in `features/community/actions.ts`, not this route group.

- `community/places/[slug]/posts` — posts for a specific place
- `community/places/[slug]/rankings` — rankings for a specific place
- `community/places/[slug]/recent-sends` — recent sends for a specific place
- `community/places/[slug]/contributors` — contributor leaderboard for a specific place
- `community/posts/[postId]/engagement` — engagement data for a specific post

### corrections

Route correction requests and voting. Requires authentication to submit and vote on corrections. Uses CSRF protection.

### crags

Crag CRUD operations, search, nearby queries, pin data, reports, image management, and sector operations. Read operations are public; write operations require authentication. Uses CSRF protection.

- `GET crags/pins` requires one `north`, `south`, `east`, `west`, and integer `zoom` query parameter. Bounds may wrap across the antimeridian; zoom 12+ requests use a progressively smaller maximum span. Public responses contain canonical crag and gym pins backed only by publicly deliverable media, use server-generated clusters at zoom 11 and below, and retain shared-cache headers. When pending previews are enabled, a verified administrator is routed through a separate identity-bound RPC and receives a private, non-cacheable response. The endpoint uses the public-search rate-limit tier.

### csrf

`GET /api/csrf` requires a Supabase user resolved from request cookies. It returns the signed user-bound token in `{ token }` and sets the same token as an HttpOnly `csrf_token` cookie. It is necessarily exempt from CSRF validation itself; anonymous requests receive 401.

### diagnostics

`POST /api/diagnostics/image-gps` is a temporary, server-gated diagnostic endpoint for the Android GPS extraction investigation. It requires an authenticated user and CSRF token, accepts only file metadata, dimensions, parser timings/statuses, and sanitized parser errors, and logs no GPS coordinates, image bytes, or EXIF contents.

### dev-logger

Localhost-only browser log bridge available only in development. Its POST is subject to proxy CSRF enforcement, which also makes it effectively require a cookie-authenticated user capable of obtaining a CSRF token.

### flags

Admin flag queue listing and flag resolution. GET `/api/flags` requires an admin but no CSRF; POST `/api/flags/[id]/resolve` requires admin auth and CSRF. User-facing image/climb flag creation lives under those resource groups.

### gym-admin

Gym admin operations. Requires authentication with gym admin privileges. Uses CSRF protection.

### image-first

Image-first route page support endpoints. Public read-only endpoints used to progressively enhance the route-page minimap after first paint. No authentication or CSRF protection.

- `image-first/pins` — load image pins for a single crag within supplied map bounds using `cragId`, `north`, `south`, `east`, and `west` query params
- `image-first/images` — load route-page image metadata using `imageId`
- `image-first/community-notes` — load route-page community notes using `effectiveClimbId`

### images

Image detail retrieval, related submission-face loading, owner/admin deletion, and flagging. Public reads do not require CSRF; writes require authentication and CSRF.

### location-tags

Public cached search over region and sub-area tags using `q` and `kind`; read-only and does not require CSRF.

### locations

Geo detection, reverse geocoding, and location search. No authentication or CSRF protection. Public utility endpoints.

### logbook

User logbook queries. Requires authentication to view personal logbook. No CSRF protection.

### media

Media compatibility delivery and authenticated upload-session lifecycle:

- `media/[bucket]/[...path]` reads an object only after `canReadObject()` authorizes public or user-private access; ready public variants should normally be served directly by the CDN instead.
- `media/private?draftId=...&path=...` streams a draft object only to the draft owner or collaborator and returns 404 for unauthorized object access.
- `media/upload-sessions` creates an authenticated private-R2 upload row and presigned PUT target.
- `media/upload-sessions/[imageId]` lets the owner poll processing status or atomically delete an unassociated upload.
- `media/upload-sessions/[imageId]/complete` verifies the private object, queues durable ingest, records moderation as disabled/skipped, and dispatches the worker fast path.
- Upload-session mutations require CSRF. Status and media GETs do not.

### notifications

Authenticated paginated notification reads with optional unread filtering and unread count. This group currently exposes GET only, so it does not require CSRF.

### offline-packs

Public read-only manifests for user-selected device downloads. `GET /api/offline-packs/crags/[cragId]/manifest` returns a deterministic ETagged snapshot of active public routes, publicly deliverable topo metadata, route-line geometry, policy-filtered coordinates, and immutable fixed-format media URLs. It supports `If-None-Match`; private media, signed URLs, personal state, and downloadable basemap tiles are excluded.

### offline-tiles

Legacy raster tile serving retained during the offline retirement window. No authentication or CSRF protection. Public tile data. This route is not live map infrastructure; live maps use MapLibre + OpenFreeMap.

- `offline-tiles/[layer]/[z]/[x]/[y]` — retirement-only layered tile proxy; do not expose as an offline product feature
- Supported `layer` values:
  - `imagery`
  - `labels` optional; tile manifests default to imagery-only unless labels are explicitly requested

### places

Place management, nearby search, and search. Read operations are public; write operations require authentication. Uses CSRF protection.

- `places` — place CRUD operations
- `places/nearby` — find places near a location
- `places/search` — search places by query

### profile

User profile operations. Requires authentication. Uses CSRF protection.

### rankings

Rankings data. No authentication or CSRF protection. Public data endpoint.

### regions

Compatibility region search backed by `location_tags(kind = 'region')`. IDs are canonical location-tag IDs; legacy response fields are preserved with null center coordinates. It does not require authentication or CSRF protection.

### routes

Two legacy/specialized surfaces rather than general route CRUD:

- `GET routes/submit` documents the direct submission payload; `POST` creates one pending climb, requires authentication and CSRF, and enforces five submissions per user per day.
- `GET routes/[id]/grades` returns public consensus, distribution, and the current user's vote when authenticated; `POST` upserts an authenticated user's valid grade vote with CSRF.

### settings

User settings management. Requires authentication. Uses CSRF protection.

### submissions

Submission and draft workflows. The root GET is public endpoint metadata; root POST accepts new-media, existing-image, or crag-image route submissions and is CSRF-protected. Draft and collaboration data require an authenticated user and enforce owner/collaborator access.

- Route handlers under `app/api/submissions/**` are intentionally thin wrappers.
- Submission execution lives in `features/submissions/server/submissions/**`.
- Draft lifecycle and collaboration flows live in `features/submissions/server/drafts/**`.
- `submissions/drafts/[id]` reads, atomically saves a concurrency-checked explicit editor payload, applies narrower compare-and-swap patches, or atomically deletes a draft.
- `submissions/drafts/[id]/images` appends associated upload-session images; the nested image route atomically removes one.
- `submissions/drafts/[id]/routes` remains the legacy transport for durably synchronizing one image or a batch of image route sets; explicit Save no longer uses it.
- `submissions/drafts/[id]/publish` validates media readiness, location/route completeness, and promotes the draft.
- `submissions/drafts/collaborate/[token]` and the legacy `submissions/collaborate/[token]` are GET invite-claim redirects; unauthenticated users are redirected to auth rather than claiming an invite.

### test

Test-only auth endpoint protected by `TEST_API_KEY` and a secret path segment. The proxy returns 404 when test auth is disabled or when `VERCEL_ENV=production`; it is not Supabase-user authenticated and does not require CSRF.

### uploads

Presigned upload URL generation. Requires authentication. Uses CSRF protection.

### auth

Authentication operations. Currently supports sign out via `/api/auth/signout`. Requires authentication. Uses CSRF protection.

### feedback

Rate-limited feedback POST. The handler permits a nullable user internally, but default CSRF validation and authenticated-only token issuance make browser use effectively authenticated. The message and source URL are length-limited before Discord delivery.

### welcome-email

Welcome email trigger. Requires authentication. Uses CSRF protection.

### social

Instagram post export for admins. Generates Instagram-optimized images with route overlays for social sharing. Requires admin privileges. Uses CSRF protection.

- `social/instagram` — export Instagram post image with optional route overlay
