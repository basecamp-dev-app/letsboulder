# Fix: Add size guards to private media transforms

## File: `app/api/media/[bucket]/[...path]/route.ts`

### Change 1: Add constant (after line 50)

```ts
const MAX_TRANSFORM_SIZE = 50 * 1024 * 1024 // 50 MB
```

### Change 2: Guard in `transformImage` (defense-in-depth, after line 95)

```ts
async function transformImage(
  request: NextRequest,
  bytes: Buffer,
  contentType: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (bytes.byteLength > MAX_TRANSFORM_SIZE) {
    console.warn(`[media] Skipping transform: object too large (${bytes.byteLength} bytes)`)
    return null
  }
  // ... rest of function unchanged
```

### Change 3: Guard in `serveFromSupabaseStorage` (before line 312)

```ts
  const contentLength = fetched.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_TRANSFORM_SIZE) {
    console.warn(`[media] Skipping transform: Supabase object too large (${contentLength} bytes)`)
    return new NextResponse(fetched.body, {
      headers: buildResponseHeaders(access, {
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Cache-Control': getMediaCacheControl(access),
      }),
    })
  }

  const bytes = Buffer.from(await fetched.arrayBuffer())
```

### Change 4: Guard in `serveFromR2` (before line 366)

```ts
  if (response.ContentLength && response.ContentLength > MAX_TRANSFORM_SIZE) {
    console.warn(`[media] Skipping transform: R2 object too large (${response.ContentLength} bytes)`)
    return new NextResponse(response.Body as ReadableStream, {
      headers: buildResponseHeaders(access, {
        'Content-Type': contentType,
        'Content-Length': String(response.ContentLength),
        'Cache-Control': getMediaCacheControl(access),
      }),
    })
  }

  const bytes = await streamToBuffer(response.Body as AsyncIterable<Uint8Array>)
```

## Summary of changes

| Location | What | Why |
|----------|------|-----|
| Line ~51 | `MAX_TRANSFORM_SIZE` constant | Single source of truth |
| `transformImage` entry | Check `bytes.byteLength` | Defense-in-depth if caller misses it |
| `serveFromSupabaseStorage` | Check `Content-Length` header before `arrayBuffer()` | Prevents buffering oversized Supabase objects |
| `serveFromR2` | Check `response.ContentLength` before `streamToBuffer()` | Prevents buffering oversized R2 objects |

## Behavior

- Objects > 50 MB: served **untransformed** (original bytes), with a `console.warn` log
- No 4xx/5xx errors — request succeeds, just without transforms
- All three guards are independent; the innermost one catches any edge case the outer ones miss
