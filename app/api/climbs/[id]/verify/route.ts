import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const { id: climbId } = await params

    // Check if climb exists
    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id, user_id, status')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Check if user is the submitter
    if (climb.user_id === userId) {
      return NextResponse.json(
        { error: 'You cannot verify your own route' },
        { status: 400 }
      )
    }

    // Check if already verified by this user
    const { data: existingVote } = await supabase
      .from('climb_verifications')
      .select('id')
      .eq('climb_id', climbId)
      .eq('user_id', userId)
      .single()

    if (existingVote) {
      return NextResponse.json(
        { error: 'You have already verified this route' },
        { status: 400 }
      )
    }

    // Add verification
    const { error: insertError } = await supabase
      .from('climb_verifications')
      .insert({
        climb_id: climbId,
        user_id: userId
      })

    if (insertError) {
      return createErrorResponse(insertError, 'Error adding verification')
    }

    // Get verification count
    const { count: verificationCount } = await supabase
      .from('climb_verifications')
      .select('id', { count: 'exact' })
      .eq('climb_id', climbId)

    const isVerified = (verificationCount || 0) >= 3

    return NextResponse.json({
      success: true,
      is_verified: isVerified,
      verification_count: verificationCount || 0,
      message: isVerified 
        ? 'Route verified! This route is now community-verified.'
        : `Verified (${verificationCount}/3 needed for full verification)`
    })
  } catch (error) {
    return createErrorResponse(error, 'Verification error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const { id: climbId } = await params

    // Remove verification
    const { error: deleteError } = await supabase
      .from('climb_verifications')
      .delete()
      .eq('climb_id', climbId)
      .eq('user_id', userId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error removing verification')
    }

    // Get verification count
    const { count: verificationCount } = await supabase
      .from('climb_verifications')
      .select('id', { count: 'exact' })
      .eq('climb_id', climbId)

    return NextResponse.json({
      success: true,
      is_verified: false,
      verification_count: verificationCount || 0,
      message: 'Verification removed'
    })
  } catch (error) {
    return createErrorResponse(error, 'Remove verification error')
  }
}
