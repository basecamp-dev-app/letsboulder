import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parsePagination } from '@/lib/pagination'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { parseWithSchema } from '@/lib/api-validation'

const NOTIFICATION_COLUMNS = 'id, user_id, type, title, message, link, is_read, created_at'

const createNotificationSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  link: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const unreadOnly = searchParams.get('unread_only') === 'true'
  const { limit, offset } = parsePagination(searchParams, { limit: 50 })

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let query = supabase
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching notifications')
    }

    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    return NextResponse.json({ 
      notifications: data || [],
      unread_count: count || 0,
    })
  } catch (error) {
    return createErrorResponse(error, 'Notifications fetch error')
  }
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const parsedBody = parseWithSchema(createNotificationSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { type, title, message, link } = parsedBody.data

    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        link,
      })

    if (error) {
      return createErrorResponse(error, 'Error creating notification')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Notification create error')
  }
}
