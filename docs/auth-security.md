# Authentication & Security

## CSRF Protection

JWT-based token system using `jose` library (`lib/csrf.ts`).

**Token Flow:**
1. The authenticated browser calls `GET /api/csrf` with `credentials: 'include'`.
2. The endpoint resolves the user from the request's Supabase cookies, creates a signed JWT with `action: 'csrf'` and `sub: user.id` claims (2h expiry), returns `{ "token": "..." }` in the JSON body, and sets the same value in the HttpOnly `csrf_token` cookie.
3. `primeCsrfToken()` keeps the body token in module memory. Browser code cannot and must not read the HttpOnly cookie.
4. For a state-changing same-origin `/api/**` request, `csrfFetch()` includes cookies and copies the in-memory token into `x-csrf-token`.
5. `validateCsrfToken()` requires equal header/cookie values, verifies the HMAC signature and `action` claim, resolves the cookie-authenticated user, and requires the JWT `sub` to match that user.
6. On a CSRF-specific 403, `csrfFetch()` fetches a fresh token and retries once. Anonymous token requests return 401.

**Usage:**
- Route Handlers that accept mutations use `withApiMiddleware()` or call `validateCsrfToken()` directly. The proxy also enforces CSRF on state-changing API requests except explicit public exceptions such as location detection.
- Client-side mutations via Route Handlers use `csrfFetch()`; ordinary `fetch()` is appropriate for reads and external URLs.
- Do not use `csrfFetch()` to invoke Server Actions. A request is exempted as a trusted Server Action only when it has `next-action` and its parsed `Origin` host exactly matches `Host`; the action must still authenticate the user and validate its input.
- `CSRF_SECRET` is required in every runtime environment. There is no process-derived development fallback; use a non-empty development/test secret locally and a strong independent secret in deployments.

## Authentication

**Supabase Auth:**
- Primary identity validation is `supabase.auth.getUser()`, not unverified user IDs or session payload claims.
- The browser singleton in `lib/supabase.ts` explicitly persists its Supabase session in `window.localStorage`; that browser-only state supports client Supabase calls and auth-state events.
- Server Components, Server Actions, Route Handlers, and the proxy create `@supabase/ssr` clients from request/Next cookies only. They cannot see browser localStorage, so the presence of a browser session is not itself proof that a server request is authenticated.
- Server-side clients do not fall back to bearer headers or internal identity headers. Ensure flows that call protected app endpoints have a cookie-backed session and always resolve the user again on the server.
- CI E2E jobs do not accept arbitrary deployment URLs. Direct smoke URLs are restricted to the trusted HTTPS development origin; Vercel previews are resolved by deployment ID and checked against the configured project before Playwright uses them. Production-safe E2E runs use a fixed production origin and omit test and service credentials.

**Internal Header Stripped:**
- The `x-internal-user-id` header is explicitly stripped by the middleware proxy (`proxy.ts`) to prevent client-side spoofing.
- No fallback or trusted-header auth path exists; all requests must authenticate via Supabase Auth.

**Persisted Query Isolation:**
- React Query persists only queries marked `meta.persist === true`, excludes community queries, and expires restored data after 12 hours.
- IndexedDB keys are scoped as `letsboulder-query-cache:anon` or `letsboulder-query-cache:<user-id>`.
- `QueryProviders` clears the in-memory client and deletes the previous scope whenever auth identity changes. Never put user-private persisted data in an anonymous or another user's scope.

## Rate Limiting

Rate limiting is defined in `lib/rate-limit.ts` using named tiers:

The exact limits live in code and may change without a docs update when operational tuning is needed.

| Key | Window | Max Requests |
|-----|--------|-------------|
| `externalApi` | 1 min | 30 |
| `geoDetect` | 1 min | 5 |
| `clickSink` | 1 min | 10 |
| `authenticatedWrite` | 1 hr | 50 |
| `publicSearch` | 1 min | 100 |
| `sensitive` | 1 hr | 10 |
| `strict` | 1 min | 5 |

- `rateLimit(request, configKey, userId?)` checks limits keyed by userId or IP
- `createRateLimitResponse(result, retryAfter?)` returns 429 with `X-RateLimit-*` headers

## Authorization Patterns

**Profile Access:**
- Direct `profiles` reads expose only `id`, `username`, `display_name`, `avatar_url`, `bio`, `country`, `country_code`, `preferred_grade_system`, `preferred_style`, `is_public`, and `created_at`. RLS further limits rows to public profiles or the caller's own row (`is_public OR id = auth.uid()`).
- Authenticated callers use identity-bound `get_own_profile()` for their complete row and `is_current_user_admin()` for admin checks. Public profile statistics and leaderboards use `get_visible_profile(user_id)` and `get_top_contributors(limit)`, which return only approved display fields and server-owned totals.
- Authenticated profile updates are column-granted only for user settings and presentation fields: names, username/display/avatar/bio, gender/country, grade and unit preferences, privacy/theme, default location, dimensions, contribution credit, and `updated_at`. `protect_profile_fields()` rejects changes to identity, email, admin state, climb/point/grade totals, contribution totals/tier, creation/name-policy/TOS timestamps, and welcome-email state.
- Authenticated users cannot `INSERT` profiles. Profile creation and server-owned fields remain trusted server/auth-trigger responsibilities; client OAuth and name flows only update an existing row.

**Database Function Privileges:**
- Default privileges for new `public` tables, sequences, and functions are private from API roles. Every exposed object must receive an explicit grant in its creating migration.
- `SECURITY DEFINER` is not an exposure mechanism: all definers are revoked from `PUBLIC`, `anon`, and `authenticated` first, then only the reviewed API RPCs and RLS helpers are re-granted. Service-role access is explicit; internal trigger/helper functions receive no API grant.
- Media job claims/transitions/pruning, `cleanup_orphan_route_uploads`, `delete_account_atomic`, `record_contribution_event`, `open_missing_topo_bounty`, and `resolve_missing_topo_bounty` are service-only. Their callers must use audited server-side service clients, never browser or ordinary authenticated clients.

**Owner Checks:**
- Query resource by `user_id` matching authenticated user
- Use Supabase RLS policies as secondary enforcement layer

**Admin Checks:**
- Use identity-bound `is_current_user_admin()`; do not read or trust client-controlled role metadata
- Gate admin-only routes/actions with role validation before DB operations
- Operational RSVP, flag, and report tables expose only owner rows to ordinary authenticated users. Anonymous consumers use sanitized aggregate views that omit identities and moderation text.

**General Rules:**
- Server Actions: validate auth in the action; return the feature's typed failure result for expected errors and reserve throws for unexpected failures
- Route Handlers: validate auth + CSRF before processing
- Never trust client-supplied user IDs; always resolve from auth context

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CSRF_SECRET` | Yes | Non-empty HMAC secret for user-bound CSRF JWT signing; required at runtime in development, test, and deployment environments |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key for client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server only, never expose) |
