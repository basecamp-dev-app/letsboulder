# API Routes

## Summary

| Route | Description | Auth | CSRF |
| --- | --- | --- | --- |
| admin | Admin operations (crag management, moderation) | Yes | Yes |
| climbs | Individual climb data and operations | Optional | Yes |
| comments | Comment CRUD for community posts | Yes | Yes |
| community | Community features (posts, sessions) | Optional | Yes |
| corrections | Route correction requests and voting | Yes | Yes |
| crags | Crag CRUD, search, nearby, pins, reports, images, sectors | Optional | Yes |
| csrf | CSRF token generation | No | No |
| dev-logger | Dev-only browser log bridge | No | No |
| flags | Content flagging (climbs, images) | Yes | Yes |
| gear-clicks | Gear recommendation click tracking | No | No |
| gym-admin | Gym admin operations | Yes | Yes |
| gym-owners | Gym owner application workflow | Yes | Yes |
| images | Image detail, faces, flags | Optional | Yes |
| location-tags | Location tagging | Yes | Yes |
| locations | Geo detection, reverse geocoding, search | No | No |
| log-routes | Route logging (send tracking) | Yes | Yes |
| logbook | User logbook queries | Yes | No |
| logs | Log entry CRUD | Yes | Yes |
| media | Media serving, upload sessions, private media proxy | Optional | Yes |
| moderation | Content moderation queue | Yes | Yes |
| notifications | User notifications | Yes | Yes |
| offline-packs | Offline pack manifests (climbs, crags) | Optional | No |
| offline-tiles | Offline map tile serving | No | No |
| places | Place management, nearby search | Optional | Yes |
| profile | User profile operations | Yes | Yes |
| rankings | Rankings data | No | No |
| regions | Region data | No | No |
| routes | Route data queries | Optional | Yes |
| settings | User settings | Yes | Yes |
| submissions | Draft management, collaboration, image submission | Yes | Yes |
| test | Test-only endpoints (auth, etc.) | No | No |
| uploads | Presigned upload URL generation | Yes | Yes |
| user-climbs | User's climbed routes | Yes | No |
| welcome-email | Welcome email trigger | Yes | Yes |

## Route Details

### admin

Admin operations including crag management and moderation tools. Restricted to authenticated users with admin privileges. Uses CSRF protection.

### climbs

Individual climb data and operations. Read operations are public; write operations require authentication. Uses CSRF protection.

### comments

Comment CRUD for community posts. Requires authentication for all operations. Uses CSRF protection.

### community

Community features including posts and session management. Read operations are public; write operations require authentication. Uses CSRF protection.

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

### gear-clicks

Gear recommendation click tracking. No authentication or CSRF protection. Used for analytics.

### gym-admin

Gym admin operations. Requires authentication with gym admin privileges. Uses CSRF protection.

### gym-owners

Gym owner application workflow. Requires authentication to apply and manage ownership. Uses CSRF protection.

### images

Image detail retrieval, face detection, and flagging. Read operations are public; write operations require authentication. Uses CSRF protection.

### location-tags

Location tagging operations. Requires authentication. Uses CSRF protection.

### locations

Geo detection, reverse geocoding, and location search. No authentication or CSRF protection. Public utility endpoints.

### log-routes

Route logging for send tracking. Requires authentication. Uses CSRF protection.

### logbook

User logbook queries. Requires authentication to view personal logbook. No CSRF protection.

### logs

Log entry CRUD operations. Requires authentication. Uses CSRF protection.

### media

Media serving, upload session management, and private media proxy. Read operations are public for public media; private media requires authentication. Uses CSRF protection.

### moderation

Content moderation queue. Requires authentication with moderator privileges. Uses CSRF protection.

### notifications

User notifications. Requires authentication. Uses CSRF protection.

### offline-packs

Offline pack manifests for climbs and crags. Read operations are public; pack generation may require authentication. No CSRF protection.

### offline-tiles

Offline map tile serving. No authentication or CSRF protection. Public tile data.

### places

Place management and nearby search. Read operations are public; write operations require authentication. Uses CSRF protection.

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

### test

Test-only endpoints for auth and other testing utilities. No authentication or CSRF protection. Not available in production.

### uploads

Presigned upload URL generation. Requires authentication. Uses CSRF protection.

### user-climbs

User's climbed routes. Requires authentication to view personal climbed routes. No CSRF protection.

### welcome-email

Welcome email trigger. Requires authentication. Uses CSRF protection.
