import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export const runtime = 'nodejs'

interface DraftCreateImageInput {
  uploadedBucket: string
  uploadedPath: string
  width?: number
  height?: number
}

function normalizeCreateImages(value: unknown): DraftCreateImageInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const images: DraftCreateImageInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftCreateImageInput>
    if (typeof candidate.uploadedBucket !== 'string' || !candidate.uploadedBucket) return null
    if (typeof candidate.uploadedPath !== 'string' || !candidate.uploadedPath) return null

    images.push({
      uploadedBucket: candidate.uploadedBucket,
      uploadedPath: candidate.uploadedPath,
      width: typeof candidate.width === 'number' ? candidate.width : undefined,
      height: typeof candidate.height === 'number' ? candidate.height : undefined,
    })
  }

  return images
}

function buildUploadSignature(images: DraftCreateImageInput[]): string {
  return images
    .map((image) => `${image.uploadedBucket}/${image.uploadedPath}`)
    .sort()
    .join('|')
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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
    const [authResult, body] = await Promise.all([
      resolveUserIdWithFallback(request, supabase),
      request.json().catch(() => null),
    ])

    const { userId, authError } = authResult
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const images = normalizeCreateImages(body?.images)
    if (!images) {
      return NextResponse.json({ error: 'images must be a non-empty array' }, { status: 400 })
    }

    const userPrefix = `${userId}/`
    for (const image of images) {
      if (!image.uploadedPath.startsWith(userPrefix)) {
        return NextResponse.json({ error: 'Invalid uploaded path owner' }, { status: 403 })
      }
    }

    const uploadSignature = buildUploadSignature(images)
    const metadataBase = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    const metadata = {
      ...metadataBase,
      uploadSignature,
    }

    const { data: existingDraft, error: existingDraftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'draft')
      .contains('metadata', { uploadSignature })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existingDraftError && existingDraft) {
      const { data: existingImages, error: existingImagesError } = await supabase
        .from('submission_draft_images')
        .select('id, display_order')
        .eq('draft_id', existingDraft.id)
        .order('display_order', { ascending: true })

      if (!existingImagesError) {
        return NextResponse.json({
          success: true,
          draft: {
            ...existingDraft,
            images: existingImages || [],
          },
        })
      }
    }

    const draftInsert = {
      user_id: userId,
      crag_id: typeof body?.cragId === 'string' ? body.cragId : null,
      status: 'draft' as const,
      metadata,
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .insert(draftInsert)
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at')
      .single()

    if (draftError || !draft) {
      return createErrorResponse(draftError || new Error('Failed to create draft'), 'Failed to create submission draft')
    }

    const imageRows = images.map((image, index) => ({
      draft_id: draft.id,
      display_order: index,
      storage_bucket: image.uploadedBucket,
      storage_path: image.uploadedPath,
      width: image.width ?? null,
      height: image.height ?? null,
      route_data: {},
    }))

    const { data: createdImages, error: imagesError } = await supabase
      .from('submission_draft_images')
      .insert(imageRows)
      .select('id, display_order')
      .order('display_order', { ascending: true })

    if (imagesError) {
      return createErrorResponse(imagesError, 'Failed to create submission draft images')
    }

    return NextResponse.json({ success: true, draft: { ...draft, images: createdImages || [] } })
  } catch (error) {
    return createErrorResponse(error, 'Failed to create submission draft')
  }
}
