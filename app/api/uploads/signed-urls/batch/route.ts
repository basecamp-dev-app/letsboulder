import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSignedUrlBatchKey, type BatchSignedUrlResult, type SignedUrlBatchRequestObject } from '@/lib/signed-url-batch'

function normalizeObjects(input: unknown): SignedUrlBatchRequestObject[] | null {
  if (!Array.isArray(input) || input.length === 0) return null

  const normalized: SignedUrlBatchRequestObject[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<SignedUrlBatchRequestObject>
    if (typeof candidate.bucket !== 'string' || !candidate.bucket) return null
    if (typeof candidate.path !== 'string' || !candidate.path) return null
    normalized.push({ bucket: candidate.bucket, path: candidate.path })
  }

  return normalized
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const objects = normalizeObjects(body?.objects)

  if (!objects) {
    return NextResponse.json(
      { error: 'objects must be a non-empty array of { bucket, path }' },
      { status: 400 }
    )
  }

  if (objects.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 objects per request' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const expectedPrefix = `${user.id}/`
  for (const item of objects) {
    if (!item.path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 })
    }
  }

  const pathsByBucket = new Map<string, string[]>()
  for (const item of objects) {
    const current = pathsByBucket.get(item.bucket) || []
    current.push(item.path)
    pathsByBucket.set(item.bucket, current)
  }

  const signedByKey = new Map<string, string>()

  for (const [bucket, paths] of pathsByBucket.entries()) {
    const uniquePaths = Array.from(new Set(paths))
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniquePaths, 3600)

    if (error) {
      return NextResponse.json({ error: 'Failed to create signed URLs' }, { status: 500 })
    }

    for (const item of data || []) {
      if (!item?.path || !item?.signedUrl) continue
      signedByKey.set(getSignedUrlBatchKey(bucket, item.path), item.signedUrl)
    }
  }

  const results: BatchSignedUrlResult[] = objects.map((item) => ({
    bucket: item.bucket,
    path: item.path,
    signedUrl: signedByKey.get(getSignedUrlBatchKey(item.bucket, item.path)) ?? null,
  }))

  return NextResponse.json({ results })
}
