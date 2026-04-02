import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest, getAdminClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createSubmissionRoutes } from '@/features/submissions/server/submissions/create-submission-routes'
import { deleteSubmissionRoute } from '@/features/submissions/server/submissions/delete-submission-route'
import { updateSubmissionRoutes } from '@/features/submissions/server/submissions/update-submission-routes'
import { type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  const supabaseAdmin = getAdminClient()

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin, userId, imageId }
    return createSubmissionRoutes(deps, body)
  } catch (error) {
    return createErrorResponse(error, 'Create routes error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  const supabaseAdmin = getAdminClient()

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin, userId, imageId }
    return deleteSubmissionRoute(deps, body)
  } catch (error) {
    return createErrorResponse(error, 'Delete route error')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin: null, userId, imageId }
    return updateSubmissionRoutes(deps, body)
  } catch (error) {
    return createErrorResponse(error, 'Update submitted routes error')
  }
}
