import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createSignedObjectUrls, isR2ManagedBucket } from '@/lib/media/object-urls'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import { getSignedUrlBatchKey, type BatchSignedUrlResult, type SignedUrlBatchRequestObject } from '@/lib/signed-url-batch'
import { serverEnv } from '@/lib/env'
import { parseWithSchema } from '@/lib/api-validation'

const signedUrlBatchSchema = z.object({
  objects: z.array(z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
  })).min(1, 'objects must be a non-empty array of { bucket, path }').max(100, 'Maximum 100 objects per request'),
})

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

  const appUrl = serverEnv.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      allowedHosts.add(new URL(appUrl).hostname.toLowerCase())
    } catch {
      // Ignore invalid NEXT_PUBLIC_APP_URL values
    }
  }

  const vercelUrl = serverEnv.VERCEL_URL
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
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const originError = validateRequestOrigin(request)
  if (originError) return originError

  const parsedBody = parseWithSchema(signedUrlBatchSchema, await request.json().catch(() => null))
  if (!parsedBody.success) return parsedBody.response

  const objects = normalizeObjects(parsedBody.data.objects)
  if (!objects) {
    return NextResponse.json(
      { error: 'objects must be a non-empty array of { bucket, path }' },
      { status: 400 }
    )
  }

  const supabase = getServerClientFromRequest(request)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const ownershipClient = supabase as unknown as Parameters<typeof userOwnsUploadedObject>[0]
  for (const item of objects) {
    if (isR2ManagedBucket(item.bucket)) {
      if (!(await userOwnsUploadedObject(ownershipClient, user.id, item.bucket, item.path))) {
        return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 })
      }
      continue
    }

    if (!item.path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 })
    }
  }

  const signedByKey = new Map<string, string>()

  const signedResults = await createSignedObjectUrls(objects, supabase)
  for (const item of objects) {
    const signedUrl = signedResults.get(`${item.bucket}:${item.path}`) ?? null
    if (signedUrl) {
      signedByKey.set(getSignedUrlBatchKey(item.bucket, item.path), signedUrl)
    }
  }

  const results: BatchSignedUrlResult[] = objects.map((item) => ({
    bucket: item.bucket,
    path: item.path,
    signedUrl: signedByKey.get(getSignedUrlBatchKey(item.bucket, item.path)) ?? null,
  }))

  return NextResponse.json({ results })
}
