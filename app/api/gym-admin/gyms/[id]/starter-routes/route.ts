import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { loadStarterRoutes, saveStarterRoutes, parseSaveStarterRoutesRequest } from '@/features/gym-admin/server/starter-routes'

const ROUTE_EDITOR_ROLES = new Set(['owner', 'manager', 'head_setter', 'setter'])

async function requireGymRouteAccess(request: NextRequest, gymId: string) {
  const supabase = getServerClientFromRequest(request)

  const { userId } = await resolveUserIdWithFallback(request, supabase)
  if (!userId) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }), supabase: null, role: null as string | null }

  const { data: membership, error: membershipError } = await supabase
    .from('gym_memberships')
    .select('role, status')
    .eq('user_id', userId)
    .eq('gym_place_id', gymId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError || !membership || !ROUTE_EDITOR_ROLES.has(membership.role)) {
    return { error: NextResponse.json({ error: 'Gym access required' }, { status: 403 }), supabase: null, role: null as string | null }
  }

  return { error: null, supabase, role: membership.role as string }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: gymId } = await params
  const access = await requireGymRouteAccess(request, gymId)
  if (access.error || !access.supabase) return access.error!
  const { supabase } = access

  return loadStarterRoutes(supabase, gymId, access.role)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: gymId } = await params
  const access = await requireGymRouteAccess(request, gymId)
  if (access.error || !access.supabase) return access.error!
  const { supabase } = access

  const parsedBody = parseSaveStarterRoutesRequest(await request.json())
  if (!parsedBody.success) return parsedBody.response

  return saveStarterRoutes(supabase, gymId, parsedBody.data.routes)
}
