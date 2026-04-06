import { NextRequest } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { requireAdmin } from '@/features/admin/server'
import { loadStarterRoutes, saveStarterRoutes, parseSaveStarterRoutesRequest } from '@/features/gym-admin/server/starter-routes'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!
  const { supabase } = admin.context

  const { id: gymId } = await params

  return loadStarterRoutes(supabase, gymId, null)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!
  const { supabase } = admin.context

  const { id: gymId } = await params

  const parsedBody = parseSaveStarterRoutesRequest(await request.json())
  if (!parsedBody.success) return parsedBody.response

  return saveStarterRoutes(supabase, gymId, parsedBody.data.routes)
}
