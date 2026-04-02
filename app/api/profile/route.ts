import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createRateLimitResponse, rateLimit } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

const PROFILE_SELECT_COLUMNS = [
  'id',
  'avatar_url',
  'bio',
  'boulder_system',
  'contribution_credit_handle',
  'contribution_credit_platform',
  'country',
  'country_code',
  'created_at',
  'default_location',
  'default_location_lat',
  'default_location_lng',
  'default_location_name',
  'default_location_zoom',
  'display_name',
  'email',
  'first_name',
  'gender',
  'grade_system',
  'height_cm',
  'highest_grade',
  'is_admin',
  'is_public',
  'last_name',
  'name',
  'name_updated_at',
  'preferred_grade_system',
  'preferred_style',
  'reach_cm',
  'route_system',
  'theme_preference',
  'tos_accepted_at',
  'total_climbs',
  'total_points',
  'trad_system',
  'units',
  'updated_at',
  'username',
  'welcome_email_sent_at',
].join(', ')

interface ProfileUpdateBody {
  username?: string
  first_name?: string
  last_name?: string
  gender?: string | null
}

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .eq('id', userId)
      .single()

    if (error) {
      return createErrorResponse(error, 'Profile fetch error')
    }

    return NextResponse.json(profile)
  } catch (error) {
    return createErrorResponse(error, 'Profile fetch error')
  }
}

export async function PUT(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (authError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { username, first_name, last_name, gender } = (await request.json()) as ProfileUpdateBody

    if (username !== undefined) {
      const trimmedUsername = username.trim()

      if (trimmedUsername.length === 0) {
        return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 })
      }

      if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        return NextResponse.json({ error: 'Username must be between 3 and 30 characters' }, { status: 400 })
      }

      if (!/^[A-Za-z0-9._-]+$/.test(trimmedUsername)) {
        return NextResponse.json(
          { error: 'Username can only contain letters, numbers, underscores, periods, and hyphens' },
          { status: 400 }
        )
      }
    }

    if (gender !== undefined && gender !== null) {
      const allowedGenders = ['male', 'female', 'other', 'prefer_not_to_say']

      if (!allowedGenders.includes(gender)) {
        return NextResponse.json({ error: 'Invalid gender value' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}

    if (username !== undefined) updateData.username = username.trim()
    if (first_name !== undefined) updateData.first_name = first_name.trim()
    if (last_name !== undefined) updateData.last_name = last_name.trim()
    if (gender !== undefined) updateData.gender = gender

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (!existingProfile?.email) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser?.email) {
        updateData.email = authUser.email
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select(PROFILE_SELECT_COLUMNS)
      .single()

    if (updateError) {
      if (updateError.code === '23505') {
        const suggestions = [
          username ? username + Math.floor(Math.random() * 1000) : null,
          first_name
            ? `${first_name}.${last_name || ''}`.toLowerCase().replace(/\.+$/, '') + Math.floor(Math.random() * 100)
            : null,
        ].filter((value): value is string => Boolean(value))

        return NextResponse.json(
          {
            error: 'Username is already taken',
            suggestions,
          },
          { status: 409 }
        )
      }

      return createErrorResponse(updateError, 'Profile update error')
    }

    return NextResponse.json(updated)
  } catch (error) {
    return createErrorResponse(error, 'Profile update error')
  }
}
