import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getSignedUrlBatchKey, type SignedUrlBatchResponse } from '@/lib/signed-url-batch'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface DraftPatchImage {
  id: string
  display_order: number
  route_data: unknown
}

function normalizePatchImages(value: unknown): DraftPatchImage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const images: DraftPatchImage[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftPatchImage>
    if (typeof candidate.id !== 'string' || !candidate.id) return null
    if (typeof candidate.display_order !== 'number' || !Number.isInteger(candidate.display_order) || candidate.display_order < 0) {
      return null
    }

    images.push({
      id: candidate.id,
      display_order: candidate.display_order,
      route_data: candidate.route_data ?? {},
    })
  }

  return images
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at, crags(name, latitude, longitude)')
      .eq('id', id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: images, error: imagesError } = await supabase
      .from('submission_draft_images')
      .select('id, draft_id, display_order, storage_bucket, storage_path, width, height, route_data, created_at, updated_at')
      .eq('draft_id', id)
      .order('display_order', { ascending: true })

    if (imagesError) {
      return createErrorResponse(imagesError, 'Failed to fetch draft images')
    }

    const imageRows = images || []
    const pathsByBucket = new Map<string, Set<string>>()

    for (const image of imageRows) {
      if (!image.storage_bucket || !image.storage_path) continue
      const current = pathsByBucket.get(image.storage_bucket) || new Set<string>()
      current.add(image.storage_path)
      pathsByBucket.set(image.storage_bucket, current)
    }

    const signedByKey = new Map<string, string>()

    for (const [bucket, pathSet] of pathsByBucket.entries()) {
      const paths = Array.from(pathSet)
      if (paths.length === 0) continue

      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600)
      if (error) {
        console.warn('Draft batch signed URL generation failed:', {
          draftId: id,
          bucket,
          pathCount: paths.length,
          error,
        })
        continue
      }

      const bucketResults: NonNullable<SignedUrlBatchResponse['results']> = []
      for (const item of data || []) {
        if (typeof item.path !== 'string') continue
        bucketResults.push({
          bucket,
          path: item.path,
          signedUrl: item.signedUrl || null,
        })
      }
      const payload: SignedUrlBatchResponse = { results: bucketResults }

      for (const result of payload.results || []) {
        if (!result.signedUrl) continue
        signedByKey.set(getSignedUrlBatchKey(result.bucket, result.path), result.signedUrl)
      }
    }

    const withSignedUrls: Array<Record<string, unknown>> = imageRows.map((image) => ({
      ...image,
      signed_url: image.storage_bucket && image.storage_path
        ? (signedByKey.get(getSignedUrlBatchKey(image.storage_bucket, image.storage_path)) || null)
        : null,
    }))

    return NextResponse.json({ draft: { ...draft, images: withSignedUrls } })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch submission draft')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const images = normalizePatchImages(body?.images)
    if (!images) {
      return NextResponse.json({ error: 'images must be a non-empty array of {id, display_order, route_data}' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: patchResult, error: patchError } = await supabase.rpc('patch_submission_draft_images_atomic', {
      p_draft_id: id,
      p_images: images,
    })

    if (patchError) {
      return createErrorResponse(patchError, 'Failed to patch submission draft')
    }

    return NextResponse.json({ success: true, draft: patchResult })
  } catch (error) {
    return createErrorResponse(error, 'Failed to patch submission draft')
  }
}
