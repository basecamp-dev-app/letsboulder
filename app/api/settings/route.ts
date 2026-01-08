import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('username, first_name, last_name, gender, avatar_url, bio, grade_system, units, is_public, default_location, theme_preference')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

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
        themePreference: profile?.theme_preference || 'system'
      }
    })

  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

    const body = await request.json()
    const { bio, gradeSystem, units, isPublic, defaultLocation, themePreference, firstName, lastName } = body

    const updateData: Record<string, unknown> = {}

    if (bio !== undefined) updateData.bio = bio.slice(0, 500)
    if (gradeSystem !== undefined) updateData.grade_system = gradeSystem
    if (units !== undefined) updateData.units = units
    if (isPublic !== undefined) updateData.is_public = isPublic
    if (defaultLocation !== undefined) updateData.default_location = defaultLocation
    if (themePreference !== undefined) updateData.theme_preference = themePreference
    if (firstName !== undefined) updateData.first_name = firstName.slice(0, 100)
    if (lastName !== undefined) updateData.last_name = lastName.slice(0, 100)

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) {
      console.error('Error updating profile:', error)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
