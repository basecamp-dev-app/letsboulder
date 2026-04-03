import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { appendDraftImages } from '@/features/submissions/server/drafts/draft-images'
import { parseWithSchema } from '@/lib/api-validation'

const draftAppendImageSchema = z.object({
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
  gps_data: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).nullable().optional(),
  capture_date: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  route_data: z.record(z.string(), z.unknown()).optional(),
})

const appendDraftImagesSchema = z.object({
  images: z.array(draftAppendImageSchema).min(1, 'images must be a non-empty array'),
  expected_updated_at: z.string().min(1, 'expected_updated_at is required'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult

  try {
    const body = await request.json().catch(() => null)
    const validation = parseWithSchema(appendDraftImagesSchema, body)
    if (!validation.success) return validation.response
    return appendDraftImages({ supabase, userId, draftId: id, requestBody: validation.data })
  } catch (error) {
    return createErrorResponse(error, 'Failed to append draft images')
  }
}
