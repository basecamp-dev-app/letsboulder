import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

const VALID_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const
const VALID_GRADE_SYSTEMS = ['font', 'v'] as const

export async function GET(request: NextRequest) {
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
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('username, first_name, last_name, gender, avatar_url, bio, grade_system, units, is_public, default_location, default_location_name, default_location_lat, default_location_lng, default_location_zoom, theme_preference')
      .eq('id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)

    if (error) {
      return createErrorResponse(error, 'Error fetching profile')
    }

    const profile = profiles?.[0] || null

    const { count: imageCount } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

      return NextResponse.json({
      settings: {
        username: profile?.username || '',
        firstName: profile?.first_name || '',
        lastName: profile?.last_name || '',
        gender: profile?.gender || '',
        avatarUrl: profile?.avatar_url || '',
        bio: profile?.bio || '',
        gradeSystem: profile?.grade_system || 'font',
        units: profile?.units || 'metric',
        isPublic: profile?.is_public !== false,
        defaultLocation: profile?.default_location || '',
        defaultLocationName: profile?.default_location_name || '',
        defaultLocationLat: profile?.default_location_lat || null,
        defaultLocationLng: profile?.default_location_lng || null,
        defaultLocationZoom: profile?.default_location_zoom || null,
        themePreference: profile?.theme_preference || 'system'
      },
      imageCount: imageCount || 0
    })

  } catch (error) {
    return createErrorResponse(error, 'Settings GET error')
  }
}

export async function PUT(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const body = await request.json()
    const { bio, gradeSystem, units, isPublic, defaultLocation, defaultLocationName, defaultLocationLat, defaultLocationLng, defaultLocationZoom, themePreference, firstName, lastName, gender } = body

    const updateData: Record<string, unknown> = {}

    if (bio !== undefined) updateData.bio = bio.slice(0, 500)
    if (gradeSystem !== undefined) {
      if (typeof gradeSystem === 'string' && VALID_GRADE_SYSTEMS.includes(gradeSystem as (typeof VALID_GRADE_SYSTEMS)[number])) {
        updateData.grade_system = gradeSystem
      }
    }
    if (units !== undefined) updateData.units = units
    if (isPublic !== undefined) updateData.is_public = isPublic
    if (defaultLocation !== undefined) updateData.default_location = defaultLocation
    if (defaultLocationName !== undefined) updateData.default_location_name = defaultLocationName
    if (defaultLocationLat !== undefined) updateData.default_location_lat = defaultLocationLat === null ? null : Number(defaultLocationLat)
    if (defaultLocationLng !== undefined) updateData.default_location_lng = defaultLocationLng === null ? null : Number(defaultLocationLng)
    if (defaultLocationZoom !== undefined) updateData.default_location_zoom = defaultLocationZoom === null ? null : Number(defaultLocationZoom)
    if (themePreference !== undefined) updateData.theme_preference = themePreference
    if (gender !== undefined) {
      if (gender === '' || gender === null) {
        updateData.gender = null
      } else if (typeof gender === 'string' && VALID_GENDERS.includes(gender as (typeof VALID_GENDERS)[number])) {
        updateData.gender = gender
      }
    }
    updateData.updated_at = new Date().toISOString()

    let nameChangeBlocked = false

    if (firstName !== undefined || lastName !== undefined) {
      const { data: currentProfiles } = await supabase
        .from('profiles')
        .select('first_name, last_name, name_updated_at')
        .eq('id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1)

      const currentProfile = currentProfiles?.[0] || null

      const currentFirstName = currentProfile?.first_name || ''
      const currentLastName = currentProfile?.last_name || ''

      const isFirstNameChanging = firstName !== undefined && firstName !== currentFirstName
      const isLastNameChanging = lastName !== undefined && lastName !== currentLastName
      const isNameChanging = isFirstNameChanging || isLastNameChanging

      if (isNameChanging) {
        const lastUpdate = currentProfile?.name_updated_at
        if (lastUpdate) {
          const lastUpdateDate = new Date(lastUpdate)
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

          if (lastUpdateDate > sixtyDaysAgo) {
            const daysRemaining = Math.ceil(60 - (Date.now() - lastUpdateDate.getTime()) / (24 * 60 * 60 * 1000))
            nameChangeBlocked = true
          } else {
            if (isFirstNameChanging) updateData.first_name = firstName.slice(0, 100)
            if (isLastNameChanging) updateData.last_name = lastName.slice(0, 100)
            updateData.name_updated_at = new Date().toISOString()
          }
        } else {
          if (isFirstNameChanging) updateData.first_name = firstName.slice(0, 100)
          if (isLastNameChanging) updateData.last_name = lastName.slice(0, 100)
          updateData.name_updated_at = new Date().toISOString()
        }
      }
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('id')

    if (updateError) {
      return createErrorResponse(updateError, 'UPDATE error')
    }

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ ...updateData, id: user.id })

      if (insertError) {
        return createErrorResponse(insertError, 'INSERT error')
      }
    }

    if (nameChangeBlocked) {
      return NextResponse.json({
        success: true,
        warning: 'Name change was blocked because you changed it within the last 60 days. Other settings were saved.'
      })
    }
    
    return NextResponse.json({ success: true })

  } catch (error) {
    return createErrorResponse(error, 'Settings PUT error')
  }
}
