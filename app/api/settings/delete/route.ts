import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createErrorResponse, reportError, sanitizeError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getAdminClient } from '@/lib/supabase-server'
import { serverEnv } from '@/lib/env.server'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

type DeleteAccountResult = Database['public']['Functions']['delete_account_atomic']['Returns'][number]

function createDeleteFailureResponse(message: string, error: unknown, userId: string, deleteRouteUploads: boolean) {
  reportError(error, {
    message,
    extra: { userId, deleteRouteUploads },
  })

  return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
}

async function removeStorageFolder(
  bucket: 'avatars' | 'route-uploads',
  userId: string,
  limit: number
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabaseAdmin = getAdminClient()
  const { data: files, error: listError } = await supabaseAdmin.storage.from(bucket).list(userId, { limit })

  if (listError) {
    return {
      ok: false,
      response: createDeleteFailureResponse(
        `Failed to list ${bucket} during account deletion`,
        listError,
        userId,
        bucket === 'route-uploads'
      ),
    }
  }

  if (!files || files.length === 0) {
    return { ok: true }
  }

  const paths = files.map((file) => `${userId}/${file.name}`)
  const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(paths)

  if (removeError) {
    return {
      ok: false,
      response: createDeleteFailureResponse(
        `Failed to remove ${bucket} during account deletion`,
        removeError,
        userId,
        bucket === 'route-uploads'
      ),
    }
  }

  return { ok: true }
}

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

const deleteTokenPayloadSchema = z.object({
  action: z.literal('delete-account'),
  userId: z.string().uuid(),
  deleteRouteUploads: z.boolean(),
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

  const parsedPayload = deleteTokenPayloadSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'Invalid token purpose' }, { status: 400 })
  }

  const deletePayload = parsedPayload.data

  const { supabase, userId } = middlewareResult

  const supabaseAdmin = getAdminClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (userId !== deletePayload.userId) {
      return NextResponse.json({ error: 'Token does not match user' }, { status: 403 })
    }

    if (deletePayload.deleteRouteUploads) {
      const routeUploadsResult = await removeStorageFolder('route-uploads', userId, 1000)
      if (!routeUploadsResult.ok) return routeUploadsResult.response
    }

    const avatarResult = await removeStorageFolder('avatars', userId, 10)
    if (!avatarResult.ok) return avatarResult.response

    const { data: deleteResults, error: deleteError } = await supabaseAdmin.rpc('delete_account_atomic', {
      p_user_id: userId,
      p_email: user.email,
      p_delete_route_uploads: deletePayload.deleteRouteUploads,
    })

    if (deleteError) {
      return createDeleteFailureResponse('Account deletion RPC failed', deleteError, userId, deletePayload.deleteRouteUploads)
    }

    const deleteResult = deleteResults?.[0] as DeleteAccountResult | undefined

    if (!deleteResult?.deleted_profile) {
      return createDeleteFailureResponse(
        'Account deletion RPC did not confirm profile deletion',
        new Error('delete_account_atomic returned no successful result'),
        userId,
        deletePayload.deleteRouteUploads
      )
    }

    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      return createDeleteFailureResponse('Failed to sign out after account deletion', signOutError, userId, deletePayload.deleteRouteUploads)
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteUserError) {
      return createDeleteFailureResponse('Failed to delete auth user after account deletion', deleteUserError, userId, deletePayload.deleteRouteUploads)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    return createErrorResponse(error, 'Account deletion error')
  }
}
