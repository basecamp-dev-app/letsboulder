import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
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
      .select('*')
      .eq('id', user.id)
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
  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
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
    const { username, first_name, last_name, gender } = body

    if (username !== undefined) {
      const trimmedUsername = username.trim()

      if (trimmedUsername.length === 0) {
        return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 })
      }

      if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        return NextResponse.json({ error: 'Username must be between 3 and 30 characters' }, { status: 400 })
      }

      const usernameRegex = /^[A-Za-z0-9._-]+$/
      if (!usernameRegex.test(trimmedUsername)) {
        return NextResponse.json({ error: 'Username can only contain letters, numbers, underscores, periods, and hyphens' }, { status: 400 })
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
      .eq('id', user.id)
      .single()

    if (!existingProfile?.email) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser?.email) {
        updateData.email = authUser.email
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single()

    if (updateError) {
      if (updateError.code === '23505') {
        const suggestions = [
          username + Math.floor(Math.random() * 1000),
          first_name ? `${first_name}.${last_name || ''}`.toLowerCase().replace(/\.+$/, '') + Math.floor(Math.random() * 100) : null,
        ].filter(Boolean)

        return NextResponse.json({ 
          error: 'Username is already taken',
          suggestions
        }, { status: 409 })
      }
      return createErrorResponse(updateError, 'Profile update error')
    }

    return NextResponse.json(updated)
  } catch (error) {
    return createErrorResponse(error, 'Profile update error')
  }
}
