import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { moderateImageFromBytes, moderateImageFromUrl } from '@/lib/image-moderation'
import { withCsrfProtection } from '@/lib/csrf-server'
import { serverEnv } from '@/lib/env'

interface CheckRequestBody {
  imageId: string
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const internalSecret = request.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== serverEnv.INTERNAL_MODERATION_SECRET) {
    console.error('Unauthorized moderation check request', {
      hasHeader: Boolean(internalSecret),
      headerLength: internalSecret ? internalSecret.length : 0,
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  try {
    const body = (await request.json()) as CheckRequestBody
    if (!body?.imageId) {
      return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, url, storage_bucket, storage_path, created_by, moderation_status, moderated_at')
      .eq('id', body.imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (image.moderated_at) {
      return NextResponse.json({ success: true, skipped: true })
    }

    let result: Awaited<ReturnType<typeof moderateImageFromBytes>>
    if (image.storage_bucket && image.storage_path) {
      const { data: privateFile, error: downloadError } = await supabase.storage
        .from(image.storage_bucket)
        .download(image.storage_path)

      if (downloadError || !privateFile) {
        return NextResponse.json({ error: 'Failed to load image for moderation' }, { status: 400 })
      }

      const fileBytes = new Uint8Array(await privateFile.arrayBuffer())
      result = await moderateImageFromBytes(fileBytes)
    } else {
      result = await moderateImageFromUrl(image.url)
    }

    const autoPublish = result.moderationStatus === 'approved' || result.moderationStatus === 'skipped'

    let approvedUrl = image.url
    if (autoPublish && image.storage_bucket && image.storage_path) {
      const { data: publicUrlData } = supabase.storage
        .from(image.storage_bucket)
        .getPublicUrl(image.storage_path)
      approvedUrl = publicUrlData.publicUrl
    }

    const { error: updateError } = await supabase
      .from('images')
      .update({
        url: approvedUrl,
        moderation_status: result.moderationStatus,
        moderation_labels: result.moderationLabels,
        moderation_provider: result.moderationProvider,
        moderation_error: result.skippedReason,
        moderated_at: new Date().toISOString(),
        status: autoPublish ? 'approved' : 'pending',
      })
      .eq('id', image.id)

    if (updateError) {
      return createErrorResponse(updateError, 'Failed to update image moderation status')
    }

    if (image.created_by) {
      const moderationStatus = result.moderationStatus
      const title = autoPublish ? 'Photo approved' : 'Photo rejected'
      const message = autoPublish
        ? (moderationStatus === 'skipped' ? 'Your photo was approved because automated moderation is currently disabled.' : 'Your photo was approved and is now visible.')
        : (moderationStatus === 'error' ? 'Your photo is awaiting manual review.' : 'Your photo was rejected.')

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
    })
  } catch (error) {
    return createErrorResponse(error, 'Moderation check error')
  }
}
