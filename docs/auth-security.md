# Authentication & Security

## CSRF Protection

JWT-based token system using `jose` library (`lib/csrf.ts`).

**Token Flow:**
1. `generateCsrfToken(userId)` creates a signed JWT with `action: 'csrf'` and `sub: userId` claims, expires in 2h
2. `setCsrfCookie(request, response)` resolves user from request cookies, generates bound token, sets the cookie
3. Client reads cookie value and sends it in `x-csrf-token` header
4. `validateCsrfToken(request)` verifies header token matches cookie token, validates JWT signature, then verifies `sub` claim matches the resolved user ID

**Usage:**
- Route Handlers that accept mutations must call `validateCsrfToken()` before processing
- Client-side mutations via Route Handlers use `csrfFetch()` (never for Server Actions)
- Server Actions handle their own auth context and do not require CSRF tokens

## Authentication

**Supabase Auth:**
- Primary auth via `supabase.auth.getUser()` returning JWT session
- Session tokens stored in cookies managed by `@supabase/ssr`

**Internal Header Stripped:**
- The `x-internal-user-id` header is explicitly stripped by the middleware proxy (`proxy.ts`) to prevent client-side spoofing.
- No fallback or trusted-header auth path exists; all requests must authenticate via Supabase Auth.

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

**Owner Checks:**
- Query resource by `user_id` matching authenticated user
- Use Supabase RLS policies as secondary enforcement layer

**Admin Checks:**
- Verify admin role from user metadata or dedicated admin table
- Gate admin-only routes/actions with role validation before DB operations

**General Rules:**
- Server Actions: validate auth inline, throw on failure
- Route Handlers: validate auth + CSRF before processing
- Never trust client-supplied user IDs; always resolve from auth context

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CSRF_SECRET` | Prod only | HMAC secret for CSRF JWT signing. Dev falls back to `dev-csrf-${process.pid}` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key for client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server only, never expose) |
