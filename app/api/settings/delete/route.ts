import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createErrorResponse, sanitizeError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getAdminClient } from '@/lib/supabase-server'
import { serverEnv } from '@/lib/env.server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

function getDeleteTokenSecret(): Uint8Array {
  const secret = serverEnv.DELETE_ACCOUNT_SECRET

  if (secret) {
    return new TextEncoder().encode(secret)
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return new TextEncoder().encode('dev-only-delete-secret')
  }

  throw new Error('DELETE_ACCOUNT_SECRET is required in non-development environments')
}

const deleteSettingsQuerySchema = z.object({
  token: z.string().min(1, 'Missing confirmation token'),
})

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const parsedQuery = parseWithSchema(
    deleteSettingsQuerySchema,
    Object.fromEntries(new URL(request.url).searchParams.entries())
  )
  if (!parsedQuery.success) return parsedQuery.response

  const { token } = parsedQuery.data

  let payload
  try {
    const deleteTokenSecret = getDeleteTokenSecret()
    const { payload: verified } = await jwtVerify(token, deleteTokenSecret)
    payload = verified
  } catch (error) {
    sanitizeError(error, 'Token verification failed')
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
  }

  if (payload.action !== 'delete-account') {
    return NextResponse.json({ error: 'Invalid token purpose' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult

  const supabaseAdmin = getAdminClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (userId !== payload.userId) {
      return NextResponse.json({ error: 'Token does not match user' }, { status: 403 })
    }

    if (payload.deleteRouteUploads) {
      await supabaseAdmin.from('deleted_accounts').insert({
        user_id: userId,
        email: user.email,
        delete_route_uploads: payload.deleteRouteUploads
      })

      const { data: files } = await supabase.storage
        .from('route-uploads')
        .list(userId, { limit: 1000 })

      if (files && files.length > 0) {
        const paths = files.map(f => `${userId}/${f.name}`)
        await supabase.storage.from('route-uploads').remove(paths)
      }
    }

    const { data: avatarFiles } = await supabase.storage
      .from('avatars')
      .list(userId, { limit: 10 })

    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map(f => `${userId}/${f.name}`)
      await supabase.storage.from('avatars').remove(paths)
    }

    await supabase.from('admin_actions').delete().eq('user_id', userId)
    await supabase.from('user_climbs').delete().eq('user_id', userId)
    await supabase.from('climb_corrections').delete().eq('user_id', userId)
    await supabase.from('correction_votes').delete().eq('user_id', userId)
    await supabase.from('logs').delete().eq('user_id', userId)
    await supabase.from('climb_verifications').delete().eq('user_id', userId)
    await supabase.from('grade_votes').delete().eq('user_id', userId)
    await supabase.from('route_grades').delete().eq('user_id', userId)

    if (payload.deleteRouteUploads) {
      await supabase.from('images').delete().eq('created_by', userId)
      await supabase.from('climbs').delete().eq('user_id', userId)
    } else {
      await supabase.from('images').update({ created_by: null }).eq('created_by', userId)
      await supabase.from('climbs').update({ user_id: null }).eq('user_id', userId)
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      return createErrorResponse(profileError, 'Error deleting profile')
    }

    await supabase.auth.signOut()
    await supabaseAdmin.auth.admin.deleteUser(userId)

    return NextResponse.json({ success: true })

  } catch (error) {
    return createErrorResponse(error, 'Account deletion error')
  }
}
