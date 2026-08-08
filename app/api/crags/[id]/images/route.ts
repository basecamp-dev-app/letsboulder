import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { parseWithSchema } from '@/lib/api-validation'
import { loadCragImages } from '@/features/crags/server'

export const runtime = 'nodejs'

const cragImagesParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params
  const validation = parseWithSchema(cragImagesParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: cragId } = validation.data

  const supabase = getServerClientFromRequest(request)

  return loadCragImages(supabase, cragId)
}

export async function POST() {
  return NextResponse.json({ error: 'Legacy multipart crag image upload has been retired' }, { status: 410 })
}
