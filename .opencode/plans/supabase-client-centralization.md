# Supabase Client Centralization — Refactor Plan

## Problem
111 files inline `createServerClient` from `@supabase/ssr` with duplicated cookie boilerplate. The canonical `getServerClient()` in `lib/supabase-server.ts` is underutilized.

## Architecture Changes

### 1. Extend `lib/supabase-server.ts` with 3 new exports

```typescript
// For Route Handlers (request.cookies)
export function getServerClientFromRequest(request: NextRequest) {
  const requestCookies = request.cookies
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return requestCookies.getAll() }, setAll() {} } }
  )
}

// For service role / admin operations (no cookie context needed)
export function getAdminClient() {
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

// For unauthenticated contexts (sitemap, opengraph, static data)
export function getUnauthenticatedClient() {
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}
```

### 2. ESLint Rule (`eslint.config.mjs`)

Add to the existing `no-restricted-imports` patterns:

```javascript
{
  paths: [{
    name: '@supabase/ssr',
    importNames: ['createServerClient'],
    message: 'Use getServerClient() or variants from @/lib/supabase-server'
  }]
}
```

## Refactor Patterns

| Pattern | Count | Replacement |
|---------|-------|-------------|
| `request.cookies` in route handlers | ~85 | `getServerClientFromRequest(request)` |
| `cookies()` from `next/headers` in pages | ~5 | `getServerClient()` |
| Service role key clients | ~10 | `getAdminClient()` |
| Empty cookies (unauthenticated) | ~8 | `getUnauthenticatedClient()` |
| Cookie write-back (signout, submissions) | 2 | Keep inline (special case) |

## Special Cases

### Signout Route (`app/api/auth/signout/route.ts`)
Needs `setAll` that writes to `cookieStore`. Keep inline or create `getServerClientWithWriteBack(cookieStore)`.

### Submissions Route (`app/api/submissions/route.ts`)
Writes cookies to `response.cookies` object. Keep inline.

### Dual-Client Files
Files like `app/api/settings/delete/route.ts` use both anon + admin clients. Replace anon with `getServerClientFromRequest(request)` and admin with `getAdminClient()`.

## Execution Order

1. **Update `lib/supabase-server.ts`** — Add 3 new exports
2. **Add ESLint rule** — Prevent new `createServerClient` imports
3. **Batch refactor by pattern** — Process all files in each category
4. **Handle special cases** — Signout and submissions routes
5. **Verify** — Run `npm run lint` to confirm zero violations

## Files Already Using `getServerClient()` (no changes needed)
- `app/api/gear-clicks/route.ts`
- `app/submit/page.tsx`
- `app/(shell)/settings/page.tsx`
- `app/(shell)/logbook/page.tsx`
- `features/logbook/lib/queries-server.ts`

## Type Compatibility Note

`features/submissions/server/drafts/draft-promote.ts` and similar files use `ReturnType<typeof createServerClient>` as a type annotation. These don't import `createServerClient` directly and are fine. If needed, we can export a `SupabaseClient` type from `lib/supabase-server.ts`.
