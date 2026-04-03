import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'

const deleteImageParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const rawParams = await params
  const validation = parseWithSchema(deleteImageParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: imageId } = validation.data

  const { supabase } = middlewareResult

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: existingImage, error: fetchError } = await supabase
      .from('images')
      .select('id, status, crag_id')
      .eq('id', imageId)
      .single()

    if (fetchError || !existingImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (existingImage.status === 'deleted') {
      return NextResponse.json({ error: 'Image already deleted' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('images')
      .update({ status: 'deleted' })
      .eq('id', imageId)

    if (updateError) {
      return createErrorResponse(updateError, 'Error soft deleting image')
    }

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully'
    })
  } catch (error) {
    return createErrorResponse(error, 'Image deletion error')
  }
}
