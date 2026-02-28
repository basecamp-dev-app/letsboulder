import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
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

function getAllowedHosts(request: NextRequest): Set<string> {
  const allowedHosts = new Set<string>(['localhost', '127.0.0.1'])
  const requestHost = request.headers.get('host')?.split(':')[0]?.trim().toLowerCase()
  if (requestHost) {
    allowedHosts.add(requestHost)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      allowedHosts.add(new URL(appUrl).hostname.toLowerCase())
    } catch {
      // Ignore invalid NEXT_PUBLIC_APP_URL values
    }
  }

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    allowedHosts.add(vercelUrl.split(':')[0].trim().toLowerCase())
  }

  return allowedHosts
}

function isAllowedHost(hostname: string, allowedHosts: Set<string>): boolean {
  const normalized = hostname.toLowerCase()
  if (allowedHosts.has(normalized)) return true
  if (normalized === 'letsboulder.vercel.app') return true
  if (normalized.endsWith('-letsboulder.vercel.app')) return true
  return false
}

function parseUrlHeader(value: string | null): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function validateRequestOrigin(request: NextRequest): NextResponse | null {
  const originUrl = parseUrlHeader(request.headers.get('origin'))
  const refererUrl = parseUrlHeader(request.headers.get('referer'))
  if (!originUrl && !refererUrl) {
    return NextResponse.json({ error: 'Missing origin context' }, { status: 403 })
  }

  const allowedHosts = getAllowedHosts(request)

  if (originUrl && !isAllowedHost(originUrl.hostname, allowedHosts)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  if (refererUrl && !isAllowedHost(refererUrl.hostname, allowedHosts)) {
    return NextResponse.json({ error: 'Invalid request referer' }, { status: 403 })
  }

  return null
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const originError = validateRequestOrigin(request)
  if (originError) return originError

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
