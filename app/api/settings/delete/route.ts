import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { jwtVerify } from 'jose'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse, sanitizeError } from '@/lib/errors'

const DELETE_TOKEN_SECRET = new TextEncoder().encode(
  process.env.DELETE_ACCOUNT_SECRET || 'default-dev-secret-change-in-production'
)

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing confirmation token' }, { status: 400 })
  }

  let payload
  try {
    const { payload: verified } = await jwtVerify(token, DELETE_TOKEN_SECRET)
    payload = verified
  } catch (error) {
    sanitizeError(error, 'Token verification failed')
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  if (payload.action !== 'delete-account') {
    return NextResponse.json({ error: 'Invalid token purpose' }, { status: 400 })
  }

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

    const rateLimitResult = rateLimit(request, 'sensitive', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    if (user.id !== payload.userId) {
      return NextResponse.json({ error: 'Token does not match user' }, { status: 403 })
    }

    if (payload.deleteRouteUploads) {
      const { data: files } = await supabase.storage
        .from('route-uploads')
        .list(user.id, { limit: 1000 })

      if (files && files.length > 0) {
        const paths = files.map(f => `${user.id}/${f.name}`)
        await supabase.storage.from('route-uploads').remove(paths)
      }
    }

    const { data: avatarFiles } = await supabase.storage
      .from('avatars')
      .list(user.id, { limit: 10 })

    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map(f => `${user.id}/${f.name}`)
      await supabase.storage.from('avatars').remove(paths)
    }

    await supabase.from('admin_actions').delete().eq('user_id', user.id)
    await supabase.from('user_climbs').delete().eq('user_id', user.id)
    await supabase.from('climb_corrections').delete().eq('user_id', user.id)
    await supabase.from('correction_votes').delete().eq('user_id', user.id)
    await supabase.from('logs').delete().eq('user_id', user.id)
    await supabase.from('climb_verifications').delete().eq('user_id', user.id)
    await supabase.from('grade_votes').delete().eq('user_id', user.id)
    await supabase.from('route_grades').delete().eq('user_id', user.id)

    if (payload.deleteRouteUploads) {
      await supabase.from('images').delete().eq('created_by', user.id)
      await supabase.from('climbs').delete().eq('user_id', user.id)
    } else {
      await supabase.from('images').update({ created_by: null }).eq('created_by', user.id)
      await supabase.from('climbs').update({ user_id: null }).eq('user_id', user.id)
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id)

    if (profileError) {
      return createErrorResponse(profileError, 'Error deleting profile')
    }

    await supabase.auth.signOut()
    await supabase.auth.admin.deleteUser(user.id)

    return NextResponse.json({ success: true })

  } catch (error) {
    return createErrorResponse(error, 'Account deletion error')
  }
}
