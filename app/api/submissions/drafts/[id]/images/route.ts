import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { userOwnsUploadedObject } from '@/lib/media/ownership'

interface DraftAppendImageInput {
  storage_bucket: string
  storage_path: string
  gps_data?: {
    latitude: number
    longitude: number
  } | null
  capture_date?: string | null
  width?: number | null
  height?: number | null
  route_data?: Record<string, unknown>
}

interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name: string | null
  }
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
}

interface DatabaseErrorLike {
  message?: string
  details?: string
  hint?: string
  code?: string
}

function normalizeImages(value: unknown): DraftAppendImageInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalized: DraftAppendImageInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<DraftAppendImageInput>
    if (typeof candidate.storage_bucket !== 'string' || !candidate.storage_bucket) return null
    if (typeof candidate.storage_path !== 'string' || !candidate.storage_path) return null

      normalized.push({
        storage_bucket: candidate.storage_bucket,
        storage_path: candidate.storage_path,
        gps_data: candidate.gps_data && typeof candidate.gps_data === 'object' && typeof candidate.gps_data.latitude === 'number' && typeof candidate.gps_data.longitude === 'number'
          ? {
              latitude: candidate.gps_data.latitude,
              longitude: candidate.gps_data.longitude,
            }
          : null,
        capture_date: typeof candidate.capture_date === 'string' && candidate.capture_date ? candidate.capture_date : null,
        width: typeof candidate.width === 'number' ? candidate.width : null,
        height: typeof candidate.height === 'number' ? candidate.height : null,
        route_data: candidate.route_data && typeof candidate.route_data === 'object' && !Array.isArray(candidate.route_data)
        ? candidate.route_data
        : {},
    })
  }

  return normalized
}

function resolveDisplayName(profile: ProfileRow | null): string | null {
  if (!profile) return null
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return null
}

function isPermissionDeniedError(error: DatabaseErrorLike | null | undefined): boolean {
  if (!error) return false

  if (error.code === '42501') return true

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return (
    message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('violates row-level security policy')
  )
}

export async function POST(
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
    const ownershipClient = supabase as unknown as Parameters<typeof userOwnsUploadedObject>[0]
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const images = normalizeImages(body?.images)
    if (!images) {
      return NextResponse.json({ error: 'images must be a non-empty array' }, { status: 400 })
    }

    const expectedUpdatedAtRaw = typeof body?.expected_updated_at === 'string' ? body.expected_updated_at : ''
    const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
    if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
      return NextResponse.json({ error: 'expected_updated_at is required and must be a valid ISO timestamp' }, { status: 400 })
    }

    for (const image of images) {
      if (!(await userOwnsUploadedObject(ownershipClient, userId, image.storage_bucket, image.storage_path))) {
        return NextResponse.json({ error: 'Invalid uploaded path owner' }, { status: 403 })
      }
    }

    const expectedUpdatedAt = expectedUpdatedAtDate.toISOString()
    const { data: appendResultRaw, error: appendError } = await supabase.rpc('append_submission_draft_images_atomic', {
      p_draft_id: id,
      p_images: images,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (appendError) {
      if (appendError.message === 'Draft conflict') {
        const { data: currentDraft } = await supabase
          .from('submission_drafts')
          .select('updated_at, last_edited_by')
          .eq('id', id)
          .maybeSingle()

        let lastUpdatedByDisplayName: string | null = null
        if (typeof currentDraft?.last_edited_by === 'string' && currentDraft.last_edited_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, display_name')
            .eq('id', currentDraft.last_edited_by)
            .maybeSingle()
          lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
        }

        const fallbackUpdatedAt = currentDraft?.updated_at || expectedUpdatedAt
        const conflictPayload: DraftConflictResponse = {
          code: 'draft_conflict',
          message: 'This draft was updated by another collaborator. Reload to continue editing.',
          current_updated_at: fallbackUpdatedAt,
          current_data: {
            updated_at: fallbackUpdatedAt,
            last_updated_by: currentDraft?.last_edited_by || null,
            last_updated_by_display_name: lastUpdatedByDisplayName,
          },
        }
        return NextResponse.json(conflictPayload, { status: 409 })
      }

      if (appendError.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (appendError.message === 'Draft not found') {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
      }

      if (isPermissionDeniedError(appendError)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return createErrorResponse(appendError, 'Failed to append draft images')
    }

    return NextResponse.json({ success: true, draft: appendResultRaw || null })
  } catch (error) {
    return createErrorResponse(error, 'Failed to append draft images')
  }
}
