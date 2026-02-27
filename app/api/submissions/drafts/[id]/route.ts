import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'

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

function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null
  return { bucket, path }
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
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

    if (draft.user_id !== user.id) {
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

    const withSignedUrls: Array<Record<string, unknown>> = []
    for (const image of images || []) {
      const parsed = parsePrivateStorageUrl(`private://${image.storage_bucket}/${image.storage_path}`)
      if (!parsed) {
        withSignedUrls.push({ ...image, signed_url: null })
        continue
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600)

      if (signedError || !signedData?.signedUrl) {
        withSignedUrls.push({ ...image, signed_url: null })
      } else {
        withSignedUrls.push({ ...image, signed_url: signedData.signedUrl })
      }
    }

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
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

    if (draft.user_id !== user.id) {
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
