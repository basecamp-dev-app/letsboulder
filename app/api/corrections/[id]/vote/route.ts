import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: correctionId } = await params
    const body = await request.json()
    const { vote_type } = body

    if (!vote_type || !['approve', 'reject'].includes(vote_type)) {
      return NextResponse.json(
        { error: 'Vote type must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    // Check if correction exists
    const { data: correction, error: correctionError } = await supabase
      .from('climb_corrections')
      .select('id, climb_id, user_id, status, approval_count, rejection_count')
      .eq('id', correctionId)
      .single()

    if (correctionError || !correction) {
      return NextResponse.json(
        { error: 'Correction not found' },
        { status: 404 }
      )
    }

    if (correction.status !== 'pending') {
      return NextResponse.json(
        { error: 'This correction has already been resolved' },
        { status: 400 }
      )
    }

    // Check if user is the correction submitter
    if (correction.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot vote on your own correction' },
        { status: 400 }
      )
    }

    // Check if user has already voted
    const { data: existingVote } = await supabase
      .from('correction_votes')
      .select('id, vote_type')
      .eq('correction_id', correctionId)
      .eq('user_id', user.id)
      .single()

    if (existingVote) {
      if (existingVote.vote_type === vote_type) {
        return NextResponse.json(
          { error: `You have already voted to ${existingVote.vote_type} this correction` },
          { status: 400 }
        )
      }

      // User is changing their vote - update instead of insert
      const { error: updateError } = await supabase
        .from('correction_votes')
        .update({ vote_type })
        .eq('correction_id', correctionId)
        .eq('user_id', user.id)

      if (updateError) {
        return createErrorResponse(updateError, 'Error updating vote')
      }

      // Update correction counts
      const { data: votes } = await supabase
        .from('correction_votes')
        .select('vote_type')
        .eq('correction_id', correctionId)

      const approvalCount = votes?.filter(v => v.vote_type === 'approve').length || 0
      const rejectionCount = votes?.filter(v => v.vote_type === 'reject').length || 0

      await supabase
        .from('climb_corrections')
        .update({
          approval_count: approvalCount,
          rejection_count: rejectionCount
        })
        .eq('id', correctionId)

      // Check for resolution
      let newStatus = 'pending'
      if (approvalCount >= 3) {
        newStatus = 'approved'
        await applyCorrection(correctionId, correction.climb_id)
      } else if (rejectionCount >= 3) {
        newStatus = 'rejected'
        await supabase
          .from('climb_corrections')
          .update({
            status: 'rejected',
            resolved_at: new Date().toISOString()
          })
          .eq('id', correctionId)
      } else {
        await supabase
          .from('climb_corrections')
          .update({
            approval_count: approvalCount,
            rejection_count: rejectionCount
          })
          .eq('id', correctionId)
      }

      return NextResponse.json({
        success: true,
        approval_count: approvalCount,
        rejection_count: rejectionCount,
        status: newStatus,
        message: `Vote changed to ${vote_type}`
      })
    }

    // Add new vote
    const { error: insertError } = await supabase
      .from('correction_votes')
      .insert({
        correction_id: correctionId,
        user_id: user.id,
        vote_type
      })

    if (insertError) {
      return createErrorResponse(insertError, 'Error adding vote')
    }

    // Get updated counts
    const { data: votes } = await supabase
      .from('correction_votes')
      .select('vote_type')
      .eq('correction_id', correctionId)

    const approvalCount = votes?.filter(v => v.vote_type === 'approve').length || 0
    const rejectionCount = votes?.filter(v => v.vote_type === 'reject').length || 0

    // Check for resolution
    let newStatus = 'pending'
    if (approvalCount >= 3) {
      newStatus = 'approved'
      await applyCorrection(correctionId, correction.climb_id)
    } else if (rejectionCount >= 3) {
      newStatus = 'rejected'
      await supabase
        .from('climb_corrections')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString()
        })
        .eq('id', correctionId)
    } else {
      await supabase
        .from('climb_corrections')
        .update({
          approval_count: approvalCount,
          rejection_count: rejectionCount
        })
        .eq('id', correctionId)
    }

    let message = `Voted to ${vote_type}`
    if (newStatus === 'approved') {
      message = 'Correction approved! Changes have been applied.'
    } else if (newStatus === 'rejected') {
      message = 'Correction rejected by the community.'
    }

    return NextResponse.json({
      success: true,
      approval_count: approvalCount,
      rejection_count: rejectionCount,
      status: newStatus,
      message
    })
  } catch (error) {
    return createErrorResponse(error, 'Correction vote error')
  }
}

async function applyCorrection(correctionId: string, climbId: string) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  // Get correction details
  const { data: correction } = await supabase
    .from('climb_corrections')
    .select('correction_type, suggested_value')
    .eq('id', correctionId)
    .single()

  if (!correction) return

  // Apply correction based on type
  const updateData: Record<string, unknown> = {}

  switch (correction.correction_type) {
    case 'name':
      updateData.name = correction.suggested_value.name
      break
    case 'grade':
      updateData.grade = correction.suggested_value.grade
      break
    case 'location':
      updateData.latitude = correction.suggested_value.latitude
      updateData.longitude = correction.suggested_value.longitude
      break
    // Line corrections would need special handling
  }

  if (Object.keys(updateData).length > 0) {
    await supabase
      .from('climbs')
      .update(updateData)
      .eq('id', climbId)
  }

  // Mark correction as approved and reset climb verification
  await supabase
    .from('climb_corrections')
    .update({
      status: 'approved',
      resolved_at: new Date().toISOString()
    })
    .eq('id', correctionId)

  // Reset verification status (needs re-verification after correction)
  await supabase
    .from('climbs')
    .update({ status: 'pending' })
    .eq('id', climbId)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: correctionId } = await params

    // Remove vote
    const { error: deleteError } = await supabase
      .from('correction_votes')
      .delete()
      .eq('correction_id', correctionId)
      .eq('user_id', user.id)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error removing vote')
    }

    // Update counts
    const { data: votes } = await supabase
      .from('correction_votes')
      .select('vote_type')
      .eq('correction_id', correctionId)

    const approvalCount = votes?.filter(v => v.vote_type === 'approve').length || 0
    const rejectionCount = votes?.filter(v => v.vote_type === 'reject').length || 0

    await supabase
      .from('climb_corrections')
      .update({
        approval_count: approvalCount,
        rejection_count: rejectionCount
      })
      .eq('id', correctionId)

    return NextResponse.json({
      success: true,
      message: 'Vote removed'
    })
  } catch (error) {
    return createErrorResponse(error, 'Remove vote error')
  }
}
