# CSRF Token Session Binding Fix

## Problem
The CSRF JWT in `lib/csrf.ts:18` only contains `{ action: 'csrf', iat }` — no session binding. A leaked token can be replayed by any attacker within the 2-hour window.

## Solution
Bind the CSRF JWT to the authenticated user's ID using the `sub` claim.

## Changes

### 1. `lib/csrf.ts` — Core CSRF library
- `generateCsrfToken(userId: string)` — add `sub` claim with user ID
- `setCsrfCookie(request: NextRequest, response: NextResponse)` — extract user from request's Supabase session, generate bound token
- `validateCsrfToken(request: NextRequest)` — extract user from request, verify JWT `sub` matches resolved user ID

### 2. `app/api/csrf/route.ts` — Token generation endpoint
- Create Supabase client from request cookies
- Resolve user, return 401 if unauthenticated
- Pass request to `setCsrfCookie`

### 3. `lib/csrf-server.ts` — Middleware
- Update `withCsrfProtection` to pass `request` to `setCsrfCookie`
- Reorder `withApiMiddleware`: resolve user first, then validate CSRF

### 4. `app/api/auth/signout/route.ts` — Direct CSRF usage
- Adapt to new `validateCsrfToken` signature (no changes needed, signature stays same)

### 5. `docs/auth-security.md` — Documentation
- Document session binding behavior

## Why User ID (not session ID)?
- Supabase access_token refreshes automatically, causing session ID mismatches
- User ID is stable across token refreshes
- A stolen CSRF token bound to user A cannot be used by attacker with user B's session
- If attacker has victim's auth cookies too, CSRF is moot regardless
