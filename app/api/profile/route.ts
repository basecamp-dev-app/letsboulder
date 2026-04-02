import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { parseWithSchema } from '@/lib/api-validation'

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

const allowedGenders = ['male', 'female', 'other', 'prefer_not_to_say'] as const

const profileUpdateSchema = z.object({
  username: z.string().trim().min(1, 'Username cannot be empty').min(3, 'Username must be between 3 and 30 characters').max(30, 'Username must be between 3 and 30 characters').regex(/^[A-Za-z0-9._-]+$/, 'Username can only contain letters, numbers, underscores, periods, and hyphens').optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  gender: z.enum(allowedGenders).nullable().optional(),
})

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
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const parsedBody = parseWithSchema(profileUpdateSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const { username, first_name, last_name, gender } = parsedBody.data

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
