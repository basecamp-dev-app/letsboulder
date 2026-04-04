import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'
import { deleteImage, requireAdminFromSupabase } from '@/features/admin/server'

const deleteImageParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const rawParams = await params
  const validation = parseWithSchema(deleteImageParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: imageId } = validation.data

  const { supabase } = middlewareResult

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const adminError = await requireAdminFromSupabase(supabase, user.id)
  if (adminError) return adminError

  return deleteImage(supabase, imageId)
}
