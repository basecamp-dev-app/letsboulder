# API Routes

## Summary

| Route | Description | Auth | CSRF |
| --- | --- | --- | --- |
| admin | Admin operations (crag management, moderation) | Yes | Yes |
| auth | Authentication operations (sign out) | Yes | Yes |
| climbs | Individual climb data and operations | Optional | Yes |
| comments | Comment CRUD for community posts | Yes | Yes |
| community | Community posts and engagement under places | Optional | Yes |
| corrections | Route correction requests and voting | Yes | Yes |
| crags | Crag CRUD, search, nearby, pins, reports, images, sectors | Optional | Yes |
| csrf | CSRF token generation | No | No |
| dev-logger | Dev-only browser log bridge | No | No |
| feedback | User feedback submission | No | No |
| flags | Content flagging (climbs, images) | Yes | Yes |
| gear | Gear recommendations | No | No |
| gym-admin | Gym admin operations | Yes | Yes |
| image-first | Image-first route page support endpoints | No | No |
| images | Image detail, faces, flags | Optional | Yes |
| location-tags | Location tagging | Yes | Yes |
| locations | Geo detection, reverse geocoding, search | No | No |
| logbook | User logbook queries | Yes | No |
| media | Media serving, upload sessions, private media proxy | Optional | Yes |
| moderation | Content moderation queue | Yes | Yes |
| notifications | User notifications | Yes | Yes |
| offline-packs | Offline pack manifests (climbs, crags) | Optional | No |
| offline-tiles | Offline map tile serving | No | No |
| places | Place management, nearby search, search | Optional | Yes |
| profile | User profile operations | Yes | Yes |
| rankings | Rankings data | No | No |
| regions | Region data | No | No |
| routes | Route data queries | Optional | Yes |
| settings | User settings | Yes | Yes |
| social | Instagram post export | Yes (admin) | Yes |
| submissions | Draft management, collaboration, image submission | Yes | Yes |
| test | Test-only endpoints (auth, etc.) | No | No |
| uploads | Presigned upload URL generation | Yes | Yes |
| welcome-email | Welcome email trigger | Yes | Yes |

## Route Details

### admin

Admin operations including crag management and moderation tools. Restricted to authenticated users with admin privileges. Uses CSRF protection.

### climbs

Individual climb data and operations. Read operations are public; write operations require authentication. Uses CSRF protection.

### comments

Comment CRUD for community posts. Requires authentication for all operations. Uses CSRF protection.

### community

Community features organized under places. Read operations are public; write operations require authentication. Uses CSRF protection.

- `community/places/[slug]/posts` — posts for a specific place
- `community/places/[slug]/rankings` — rankings for a specific place
- `community/places/[slug]/recent-sends` — recent sends for a specific place
- `community/posts/[postId]/engagement` — engagement data for a specific post

### corrections

Route correction requests and voting. Requires authentication to submit and vote on corrections. Uses CSRF protection.

### crags

Crag CRUD operations, search, nearby queries, pin data, reports, image management, and sector operations. Read operations are public; write operations require authentication. Uses CSRF protection.

### csrf

CSRF token generation endpoint. No authentication required. Exempt from CSRF protection itself.

### dev-logger

Development-only browser log bridge. No authentication or CSRF protection.

### flags

Content flagging for climbs and images. Requires authentication to flag content. Uses CSRF protection.

### gear

Gear recommendations endpoint. No authentication or CSRF protection. Public data endpoint.

### gym-admin

Gym admin operations. Requires authentication with gym admin privileges. Uses CSRF protection.

### image-first

Image-first route page support endpoints. Public read-only endpoints used to progressively enhance the route-page minimap after first paint. No authentication or CSRF protection.

- `image-first/pins` — load image pins for a single crag within supplied map bounds using `cragId`, `north`, `south`, `east`, and `west` query params

### images

Image detail retrieval, face detection, and flagging. Read operations are public; write operations require authentication. Uses CSRF protection.

### location-tags

Location tagging operations. Requires authentication. Uses CSRF protection.

### locations

Geo detection, reverse geocoding, and location search. No authentication or CSRF protection. Public utility endpoints.

### logbook

User logbook queries. Requires authentication to view personal logbook. No CSRF protection.

### media

Media serving, upload session management, and private media proxy. Read operations are public for public media; private media requires authentication. Uses CSRF protection.

### moderation

Content moderation queue. Requires authentication with moderator privileges. Uses CSRF protection.

### notifications

User notifications. Requires authentication. Uses CSRF protection.

### offline-packs

Offline pack manifests for climbs and crags. Read operations are public; pack generation may require authentication. No CSRF protection.

- `offline-packs/climbs/[id]` — build climb offline manifest, including `offlineLaunchUrl`, `imageFirstUrl`, media URLs, and tile manifest
- `offline-packs/crags/[id]` — build crag offline manifest, including preferred crag launch URL plus child climb summaries

### offline-tiles

Offline map tile serving. No authentication or CSRF protection. Public tile data.

- `offline-tiles/[layer]/[z]/[x]/[y]` — layered offline tile proxy for saved map coverage
- Supported `layer` values:
  - `imagery`
  - `labels`

### places

Place management, nearby search, and search. Read operations are public; write operations require authentication. Uses CSRF protection.

- `places/route` — place CRUD operations
- `places/nearby` — find places near a location
- `places/search` — search places by query

### profile

User profile operations. Requires authentication. Uses CSRF protection.

### rankings

Rankings data. No authentication or CSRF protection. Public data endpoint.

### regions

Region data. No authentication or CSRF protection. Public data endpoint.

### routes

Route data queries. Read operations are public; write operations require authentication. Uses CSRF protection.

### settings

User settings management. Requires authentication. Uses CSRF protection.

### submissions

Draft management, collaboration, image submission, and durable draft route syncing. Requires authentication. Uses CSRF protection.

- Route handlers under `app/api/submissions/**` are intentionally thin wrappers.
- Submission execution lives in `features/submissions/server/submissions/**`.
- Draft lifecycle and collaboration flows live in `features/submissions/server/drafts/**`.

### test

Test-only endpoints for auth and other testing utilities. No authentication or CSRF protection. Not available in production.

### uploads

Presigned upload URL generation. Requires authentication. Uses CSRF protection.

### auth

Authentication operations. Currently supports sign out via `/api/auth/signout`. Requires authentication. Uses CSRF protection.

### feedback

User feedback submission endpoint. No authentication or CSRF protection. Public utility endpoint.

### gear

Gear recommendations endpoint. No authentication or CSRF protection. Public data endpoint.

### welcome-email

Welcome email trigger. Requires authentication. Uses CSRF protection.

### social

Instagram post export for admins. Generates Instagram-optimized images with route overlays for social sharing. Requires admin privileges. Uses CSRF protection.

- `social/instagram` — export Instagram post image with optional route overlay
