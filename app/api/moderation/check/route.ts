import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { createErrorResponse } from '@/lib/errors'
import { moderateImageFromUrl } from '@/lib/image-moderation'

interface CheckRequestBody {
  imageId: string
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get('debug') === '1') {
    return NextResponse.json({
      env: {
        hasInternalSecret: !!process.env.INTERNAL_MODERATION_SECRET,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAwsRegion: !!process.env.AWS_REGION,
        hasAwsAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
        hasAwsSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        vercelEnv: process.env.VERCEL_ENV || null,
        vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
    })
  }

  const internalSecret = request.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.INTERNAL_MODERATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
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

    const rejectionReason =
      result.moderationLabels.length > 0
        ? 'content'
        : result.hasPeople
          ? 'people'
          : result.hasHumans
            ? 'people'
            : null

    const moderationLabels = [
      ...result.moderationLabels.map((l) => ({ kind: 'moderation', name: l.name, confidence: l.confidence })),
      ...(result.hasPeople
        ? [{ kind: 'person_label', name: 'Person', confidence: result.personLabelConfidence || 0 }]
        : []),
      ...(typeof result.humanFaceCount === 'number'
        ? [{ kind: 'faces', count: result.humanFaceCount }]
        : []),
    ]

    const { data: updatedRow, error: updateError } = await supabaseAdmin
      .from('images')
      .update({
        moderation_status: result.moderationStatus,
        has_humans: result.hasHumans,
        moderation_labels: moderationLabels,
        moderated_at: new Date().toISOString(),
      })
      .eq('id', image.id)
      .select('id')
      .single()

    if (updateError) {
      return createErrorResponse(updateError, 'Failed to update image moderation status')
    }

    if (!updatedRow?.id) {
      return NextResponse.json({ error: 'Failed to update image moderation status' }, { status: 500 })
    }

    if (image.created_by) {
      const title =
        result.moderationStatus === 'approved'
          ? 'Photo approved'
          : 'Photo rejected'

      const message =
        result.moderationStatus === 'approved'
          ? 'Your photo was approved and is now visible.'
          : rejectionReason === 'people'
            ? 'Your photo was rejected because it appears to contain a person. Please upload a version with no people.'
            : 'Your photo was rejected due to content policy.'

      await supabaseAdmin.from('notifications').insert({
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
      has_people: result.hasPeople,
      human_face_count: result.humanFaceCount,
    })
  } catch (error) {
    return createErrorResponse(error, 'Moderation check error')
  }
}
