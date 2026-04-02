import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'

export const runtime = 'nodejs'

const createSectorSchema = z.object({
  name: z.string().trim().min(1, 'Sector name is required'),
})

// GET /api/crags/[id]/sectors
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cragId } = await params

  const supabase = getServerClientFromRequest(request)

  try {
    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
    }

    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) {
      return createErrorResponse(cragError, 'Failed to validate crag')
    }

    if (!existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const { data: sectors, error: sectorsError } = await supabase
      .from('sectors')
      .select('id, name, crag_id')
      .eq('crag_id', cragId)
      .order('name', { ascending: true })

    if (sectorsError) {
      return createErrorResponse(sectorsError, 'Failed to fetch sectors')
    }

    return NextResponse.json(sectors || [])
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch sectors')
  }
}

// POST /api/crags/[id]/sectors
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
    }

    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) {
      return createErrorResponse(cragError, 'Failed to validate crag')
    }

    if (!existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const parsedBody = parseWithSchema(createSectorSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { name } = parsedBody.data

    const { data: createdSector, error: insertError } = await supabase
      .from('sectors')
      .insert({
        name,
        crag_id: cragId,
      })
      .select('id, name, crag_id')
      .single()

    if (insertError) {
      return createErrorResponse(insertError, 'Failed to create sector')
    }

    return NextResponse.json(createdSector, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Failed to create sector')
  }
}
