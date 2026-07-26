import { NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'

import type { NextRequest } from 'next/server'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'

type RequestSupabaseClient = ReturnType<typeof getServerClientFromRequest>

export interface AdminRequestContext {
  supabase: RequestSupabaseClient
  userId: string
}

export interface AdminRequestResult {
  error: NextResponse | null
  context: AdminRequestContext | null
}

export async function requireAdmin(request: NextRequest): Promise<AdminRequestResult> {
  const supabase = getServerClientFromRequest(request)

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
      context: null,
    }
  }

  const { data: isAdmin, error: profileError } = await isCurrentUserAdmin(supabase)

  if (profileError || !isAdmin) {
    return {
      error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
      context: null,
    }
  }

  return {
    error: null,
    context: {
      supabase,
      userId: user.id,
    },
  }
}

export async function requireAdminFromSupabase(
  supabase: RequestSupabaseClient
): Promise<NextResponse | null> {
  const { data: isAdmin, error: profileError } = await isCurrentUserAdmin(supabase)

  if (profileError || !isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  return null
}
