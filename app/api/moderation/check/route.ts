import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { moderateImageFromUrl } from '@/lib/image-moderation'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface CheckRequestBody {
  imageId: string
}

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.INTERNAL_MODERATION_SECRET) {
    console.error('Unauthorized moderation check request', {
      hasHeader: Boolean(internalSecret),
      headerLength: internalSecret ? internalSecret.length : 0,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return createErrorResponse(new Error('Missing SUPABASE_SERVICE_ROLE_KEY'), 'Moderation config error')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  try {
    const body = (await request.json()) as CheckRequestBody
    if (!body?.imageId) {
      return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, url, created_by, moderation_status, moderated_at')
      .eq('id', body.imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (image.moderated_at) {
      return NextResponse.json({ success: true, skipped: true })
    }

    const result = await moderateImageFromUrl(image.url)

    const { error: updateError } = await supabase
      .from('images')
      .update({
        moderation_status: result.moderationStatus,
        has_humans: result.hasHumans,
        moderation_labels: result.moderationLabels,
        moderated_at: new Date().toISOString(),
        status: result.moderationStatus === 'approved' ? 'approved' : 'pending',
      })
      .eq('id', image.id)

    if (updateError) {
      return createErrorResponse(updateError, 'Failed to update image moderation status')
    }

    if (image.created_by) {
      const moderationStatus = result.moderationStatus
      const title =
        moderationStatus === 'approved'
          ? 'Photo approved'
          : moderationStatus === 'flagged'
            ? 'Photo needs changes'
            : 'Photo rejected'

      const message =
        moderationStatus === 'approved'
          ? 'Your photo was approved and is now visible.'
          : moderationStatus === 'flagged'
            ? 'Your photo appears to contain a person. Please upload a version without people.'
            : 'Your photo was rejected due to content policy.'

      await supabase.from('notifications').insert({
        user_id: image.created_by,
        type: 'moderation',
        title,
        message,
        link: '/submit',
      })
    }

    return NextResponse.json({
      success: true,
      moderation_status: result.moderationStatus,
      has_humans: result.hasHumans,
      human_face_count: result.humanFaceCount,
    })
  } catch (error) {
    return createErrorResponse(error, 'Moderation check error')
  }
}
